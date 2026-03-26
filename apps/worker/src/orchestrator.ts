import 'dotenv/config'
import { supabase } from './lib/supabase'
import { loadContext } from './stages/load_context'
import { runAlignmentForPage } from './stages/alignment'
import { cropRoisForPage } from './stages/roi_crop'
import { runOcrEnsembleForRoi } from './stages/ocr_ensemble'
import { persistCandidates } from './stages/candidate_persist'
import { deterministicGradeRoi } from './stages/math_grade'
import { verifyRoiIfNeeded } from './stages/verifier'
import { finalizeSubmission } from './stages/finalize'
import { setStage } from './utils/stage'

const POLL_INTERVAL_MS = 3000
const PIPELINE_VERSION = 'v2'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message

  if (typeof error === 'object' && error !== null) {
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }

  return String(error ?? 'Unknown worker error')
}

async function markSubmissionError(
  submissionId: string,
  message: string,
  status: 'needs_review' | 'uploaded' = 'needs_review'
) {
  const { error } = await supabase
    .from('submissions')
    .update({
      current_stage: 'v2:error',
      status,
      last_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)

  if (error) {
    console.error('[worker] failed to mark submission error', {
      submissionId,
      message,
      error,
    })
  }
}

async function lockNextJob(): Promise<string | null> {
  const { data: jobs, error } = await supabase
    .from('submissions')
    .select(`
      id,
      updated_at,
      submission_files!inner (
        id
      )
    `)
    .eq('pipeline_version', PIPELINE_VERSION)
    .in('current_stage', ['pending', 'v2:queued'])
    .order('updated_at', { ascending: false })
    .limit(1)

  if (error) {
    console.error('[worker] failed to poll jobs', error)
    return null
  }

  if (!jobs || jobs.length === 0) {
    return null
  }

  const submissionId = jobs[0].id as string

  const { data: locked, error: lockError } = await supabase
    .from('submissions')
    .update({
      current_stage: 'v2:queued',
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .in('current_stage', ['pending', 'v2:queued'])
    .select('id')
    .maybeSingle()

  if (lockError || !locked) {
    return null
  }

  return submissionId
}

async function cleanupBrokenQueuedSubmissions() {
  const { data: broken, error } = await supabase
    .from('submissions')
    .select('id')
    .eq('pipeline_version', PIPELINE_VERSION)
    .in('current_stage', ['pending', 'v2:queued'])

  if (error || !broken || broken.length === 0) {
    return
  }

  for (const row of broken) {
    const submissionId = row.id as string

    const { data: files, error: fileError } = await supabase
      .from('submission_files')
      .select('id')
      .eq('submission_id', submissionId)
      .limit(1)

    if (fileError) {
      console.error('[worker] failed to inspect submission_files', {
        submissionId,
        fileError,
      })
      continue
    }

    if (!files || files.length === 0) {
      await markSubmissionError(
        submissionId,
        'No submission_files attached to this submission',
        'needs_review'
      )
    }
  }
}

export async function pollAndProcessV2() {
  try {
    await cleanupBrokenQueuedSubmissions()

    const submissionId = await lockNextJob()
    if (!submissionId) return

    await processSubmissionV2(submissionId)
  } catch (error) {
    console.error('[worker] pollAndProcessV2 error', error)
  }
}

export async function processSubmissionV2(submissionId: string) {
  try {
    await setStage(submissionId, 'v2:loading_context')
    const ctx = await loadContext(submissionId)

    if (!ctx.pages || ctx.pages.length === 0) {
      throw new Error('Submission files not found')
    }

    for (const pageFile of ctx.pages) {
      const pageNo = pageFile.page_number

      await setStage(submissionId, `v2:aligning:p${pageNo}`)
      const alignment = await runAlignmentForPage(ctx, pageFile)

      await setStage(submissionId, `v2:cropping:p${pageNo}`)
      const roiCrops = await cropRoisForPage(ctx, pageNo, alignment)

      if (!roiCrops || roiCrops.length === 0) {
        console.warn('[worker] no ROI crops found for page', {
          submissionId,
          pageNo,
        })
        continue
      }

      for (const roi of roiCrops) {
        await setStage(submissionId, `v2:ocr:p${pageNo}:roi:${roi.roi_id}`)
        const rawCandidates = await runOcrEnsembleForRoi(ctx, roi)

        await setStage(submissionId, `v2:candidates:p${pageNo}:roi:${roi.roi_id}`)
        const dbCandidates = await persistCandidates(ctx, roi, rawCandidates)

        await setStage(submissionId, `v2:grading:p${pageNo}:roi:${roi.roi_id}`)
        const grade = await deterministicGradeRoi(ctx, roi, dbCandidates)

        await setStage(submissionId, `v2:verify:p${pageNo}:roi:${roi.roi_id}`)
        const final = await verifyRoiIfNeeded(ctx, roi, dbCandidates, grade)

        const resolvedItemNo =
          roi.item_no ??
          (roi.region?.item_no != null ? String(roi.region.item_no) : null) ??
          (roi.region?.question_no != null ? String(roi.region.question_no) : null) ??
          String(roi.roi_id)

        if (!roi.item_no) {
          console.warn('[worker] roi.item_no missing, fallback used', {
            submissionId,
            roi_id: roi.roi_id,
            page_number: pageNo,
            kind: roi.kind,
            resolvedItemNo,
          })
        }

        const { error } = await supabase.from('grading_results').upsert(
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
          },
          { onConflict: 'submission_id,roi_id,page_number,layout_spec_version' as any }
        )

        if (error) {
          throw error
        }
      }
    }

    await finalizeSubmission(ctx)
    await setStage(submissionId, 'v2:done')

    const { error: clearError } = await supabase
      .from('submissions')
      .update({
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', submissionId)

    if (clearError) {
      console.error('[worker] failed to clear last_error', clearError)
    }
  } catch (error) {
    const message = getErrorMessage(error)

    console.error(`[worker] processSubmissionV2 failed for ${submissionId}`, error)
    console.error('[worker] full error object:', error)

    if (message.includes('Submission files not found')) {
      await markSubmissionError(submissionId, message, 'needs_review')
      return
    }

    await markSubmissionError(submissionId, message, 'needs_review')
    throw error
  }
}

setInterval(() => {
  void pollAndProcessV2()
}, POLL_INTERVAL_MS)