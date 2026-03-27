import { supabase } from './lib/supabase'
import { loadContext, type WorkerContext } from './stages/load_context'
import { cropRoisForPage, type RoiCrop } from './stages/roi_crop'
import { runOcrEnsembleForRoi } from './stages/ocr_ensemble'
import { persistCandidates, type PersistedCandidate } from './stages/candidate_persist'
import { gradeMathAnswer } from './stages/math_grade'
import { verifyAndFinalize } from './stages/verifier'

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5000)
const PIPELINE_VERSION = 'v2'

type SubmissionRow = {
  id: string
  status: string | null
  current_stage: string | null
  last_error: string | null
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function resolveItemNo(roi: RoiCrop): string {
  if (roi.item_no && String(roi.item_no).trim() !== '') {
    return String(roi.item_no).trim()
  }

  if (roi.question_no && String(roi.question_no).trim() !== '') {
    return String(roi.question_no).trim()
  }

  return String(roi.roi_id)
}

function findAnswerKeyItem(ctx: WorkerContext, roi: RoiCrop): any | null {
  const resolvedItemNo = resolveItemNo(roi)
  const items = Array.isArray(ctx.answerKeyItems) ? ctx.answerKeyItems : []

  const found =
    items.find((item: any) => {
      const itemNo =
        item?.item_no ??
        item?.question_no ??
        item?.no ??
        item?.id

      return itemNo != null && String(itemNo).trim() === resolvedItemNo
    }) ?? null

  return found
}

async function markSubmissionStage(
  submissionId: string,
  stage: string,
  patch?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from('submissions')
    .update({
      current_stage: stage,
      pipeline_version: PIPELINE_VERSION,
      updated_at: new Date().toISOString(),
      ...(patch ?? {}),
    })
    .eq('id', submissionId)

  if (error) {
    throw new Error(`Failed to update submission stage: ${error.message}`)
  }
}

async function markSubmissionError(
  submissionId: string,
  errorMessage: string,
  status = 'needs_review'
): Promise<void> {
  const { error } = await supabase
    .from('submissions')
    .update({
      status,
      current_stage: 'v2:error',
      last_error: errorMessage,
      pipeline_version: PIPELINE_VERSION,
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)

  if (error) {
    throw new Error(`Failed to mark submission error: ${error.message}`)
  }
}

async function finalizeSubmission(
  submissionId: string,
  decision: 'auto_graded' | 'needs_review'
): Promise<void> {
  const nextStatus = decision === 'auto_graded' ? 'graded' : 'needs_review'

  const { error } = await supabase
    .from('submissions')
    .update({
      status: nextStatus,
      current_stage: 'v2:done',
      last_error: null,
      pipeline_version: PIPELINE_VERSION,
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)

  if (error) {
    throw new Error(`Failed to finalize submission: ${error.message}`)
  }
}

async function lockNextSubmission(): Promise<SubmissionRow | null> {
  const candidateStatuses = [
    'uploaded',
    'ocr_pending',
    'extract_pending',
    'grade_pending',
  ]

  const { data, error } = await supabase
    .from('submissions')
    .select('id, status, current_stage, last_error')
    .in('status', candidateStatuses)
    .or('current_stage.is.null,current_stage.neq.v2:locked')
    .order('updated_at', { ascending: true })
    .limit(1)

  if (error) {
    throw new Error(`Failed to fetch next submission: ${error.message}`)
  }

  const row = (data ?? [])[0] as SubmissionRow | undefined
  if (!row) return null

  const { data: updated, error: updateError } = await supabase
    .from('submissions')
    .update({
      status: 'processing',
      current_stage: 'v2:locked',
      pipeline_version: PIPELINE_VERSION,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .neq('current_stage', 'v2:locked')
    .select('id, status, current_stage, last_error')
    .single()

  if (updateError || !updated) {
    return null
  }

  console.log('[worker] locked submission', {
    submissionId: updated.id,
    status: updated.status,
    current_stage: updated.current_stage,
  })

  return updated as SubmissionRow
}

async function processSingleRoi(
  ctx: WorkerContext,
  roi: RoiCrop
): Promise<'auto_graded' | 'needs_review'> {
  const submissionId = ctx.submission.id
  const pageNo = Number(roi.page_number)
  const resolvedItemNo = resolveItemNo(roi)

  console.log('[worker] process ROI start', {
    submissionId,
    roi_id: roi.roi_id,
    pageNo,
    item_no: resolvedItemNo,
  })

  const ocrResult = await runOcrEnsembleForRoi(ctx, roi)

  const dbCandidates: PersistedCandidate[] = await persistCandidates(
    ctx,
    roi,
    ocrResult.candidates
  )

  const answerKeyItem = findAnswerKeyItem(ctx, roi)

  const grade = await gradeMathAnswer({
    ctx,
    roi,
    candidates: dbCandidates,
    answerKeyItem,
  })

  const final = await verifyAndFinalize({
    ctx,
    roi,
    candidates: dbCandidates,
    grade,
    answerKeyItem,
  })

  console.log('[worker] verifier result', {
    submissionId,
    roi_id: roi.roi_id,
    item_no: resolvedItemNo,
    alpha: final.alpha,
    beta: final.beta,
    gamma: final.gamma,
    final_confidence: final.final_confidence,
    threshold: final.threshold,
    decision: final.decision,
    selected_candidate_text: final.selected_candidate_text ?? null,
    selected_candidate_normalized: final.selected_candidate_normalized ?? null,
    verifier_used: final.verifier_used,
    review_required: final.review_required,
  })

  const { error } = await supabase
    .from('grading_results')
    .upsert(
      {
        submission_id: submissionId,
        item_no: resolvedItemNo,
        roi_id: roi.roi_id,
        page_number: pageNo,
        layout_spec_version: ctx.layoutSpec.version,
        auto_score: final.auto_score,
        final_score: final.final_score,
        selected_candidate_id: final.selected_candidate_id,
        evidence_map: final.evidence_map ?? null,
        is_human_override: false,
        confidence_score: final.final_confidence ?? null,
        debug_payload: {
          roi_id: roi.roi_id,
          page_number: pageNo,
          bbox_norm: roi.bbox_norm ?? null,
          question_no: roi.question_no ?? null,
          item_no: roi.item_no ?? null,
          answer_type: roi.answer_type ?? null,
          score_weight: roi.score_weight ?? null,
          debug_roi_path: ocrResult.debug?.debug_roi_path ?? null,
          google_raw_by_variant: ocrResult.debug?.google_raw_by_variant ?? [],
          paddle_raw_by_variant: ocrResult.debug?.paddle_raw_by_variant ?? [],
          merged_candidates: ocrResult.debug?.merged_candidates ?? [],
          persisted_candidates: dbCandidates ?? [],
          grade,
          final,
        },
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'submission_id,item_no',
      }
    )

  if (error) {
    throw new Error(`Failed to upsert grading_results: ${error.message}`)
  }

  console.log('[worker] grading_results upserted', {
    submissionId,
    pageNo,
    roi_id: roi.roi_id,
    item_no: resolvedItemNo,
  })

  return final.decision === 'auto_graded' ? 'auto_graded' : 'needs_review'
}

export async function processSubmissionV2(submissionId: string): Promise<void> {
  console.log('[worker] processSubmissionV2 start', { submissionId })

  try {
    await markSubmissionStage(submissionId, 'v2:load_context')

    const ctx = await loadContext(submissionId)

    if (
      ctx.submission.status === 'graded' ||
      ctx.submission.status === 'needs_review' ||
      ctx.submission.current_stage === 'v2:done'
    ) {
      console.log('[worker] skip already completed submission', {
        submissionId: ctx.submission.id,
        status: ctx.submission.status,
        current_stage: ctx.submission.current_stage,
      })
      return
    }

    console.log('[worker] context loaded', {
      submissionId: ctx.submission.id,
      pages: ctx.pages.map((p: any) => ({
        page_number: p.page_number,
        storage_path: p.storage_path,
      })),
      layoutVersion: ctx.layoutSpec.version,
      answerKeyItems: Array.isArray(ctx.answerKeyItems) ? ctx.answerKeyItems.length : 0,
    })

    let overallDecision: 'auto_graded' | 'needs_review' = 'auto_graded'

    const pages = Array.isArray(ctx.pages) ? ctx.pages : []

    for (const page of pages) {
      const pageNumber = Number(page.page_number ?? 1)

      await markSubmissionStage(submissionId, `v2:roi_crop:page_${pageNumber}`)

      const rois = await cropRoisForPage(ctx, pageNumber, null)

      console.log('[worker] page ROIs', {
        submissionId,
        pageNo: pageNumber,
        count: rois.length,
      })

      for (const roi of rois) {
        await markSubmissionStage(
          submissionId,
          `v2:ocr:item_${roi.item_no ?? roi.question_no ?? roi.roi_id}`
        )

        const decision = await processSingleRoi(ctx, roi)

        if (decision === 'needs_review') {
          overallDecision = 'needs_review'
        }
      }
    }

    console.log('[worker] finalize start', { submissionId })

    await finalizeSubmission(submissionId, overallDecision)

    console.log('[worker] processSubmissionV2 done', { submissionId })
  } catch (error) {
    const message = stringifyError(error)

    console.error('[worker] processSubmissionV2 failed', {
      submissionId,
      error: message,
    })

    await markSubmissionError(submissionId, message, 'needs_review')
    throw error
  }
}

async function pollAndProcessV2(): Promise<void> {
  try {
    const locked = await lockNextSubmission()
    if (!locked) return

    await processSubmissionV2(locked.id)
  } catch (error) {
    console.error('[worker] pollAndProcessV2 error', error)
  }
}

void pollAndProcessV2()

setInterval(() => {
  void pollAndProcessV2()
}, POLL_INTERVAL_MS)