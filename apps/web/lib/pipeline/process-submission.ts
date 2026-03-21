// apps/web/lib/pipeline/process-submission.ts
import { createClient } from '@/lib/supabase/server'
import { runDocumentAiOcr } from '@/lib/google/documentai-ocr'
import { runPaddleOcr } from '@/lib/ocr/paddleocr'
import { fuseCandidatesPerRoi, type OcrCandidateInput } from '@/lib/pipeline/fusion'

type OcrPageOutput = {
  page_number: number
  raw_text: string
  confidence: number
}

type OcrEnginePageOutput = {
  engine: 'google_document_ai' | 'paddleocr'
  page_number: number
  raw_text: string
  confidence: number
}

type ExtractedCandidate = {
  roi_id: string
  page_number: number
  rank: number
  raw_text: string
  normalized_value: string
  confidence_score: number
  engine_source: string
}

function normalizeAnswer(raw: string, answerType: string = 'number') {
  const text = String(raw ?? '').trim()

  if (answerType === 'number') {
    return text.replace(/\s+/g, '')
  }

  if (answerType === 'fraction') {
    return text.replace(/\s+/g, '')
  }

  return text
}

function scoreDeterministic(expected: any, actual: string) {
  if (expected == null || expected === '') return 0
  return String(expected).trim() === String(actual).trim() ? 1 : 0
}

async function downloadSubmissionFileBuffer(
  supabase: any,
  bucket: string,
  storagePath: string
): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(bucket).download(storagePath)
  if (error) throw error

  const arrayBuffer = await data.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

function detectMimeType(storagePath: string) {
  const path = storagePath.toLowerCase()
  if (path.endsWith('.pdf')) return 'application/pdf'
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

async function runDualOcrForSubmissionFiles(
  supabase: any,
  fileRows: Array<{ id: string; page_number: number; storage_path: string }>
): Promise<OcrEnginePageOutput[]> {
  const BUCKET = 'submission-files'
  const outputs: OcrEnginePageOutput[] = []

  for (const file of fileRows) {
    const buffer = await downloadSubmissionFileBuffer(supabase, BUCKET, file.storage_path)
    const mimeType = detectMimeType(file.storage_path)
    const filename = file.storage_path.split('/').pop() ?? `page-${file.page_number}.jpg`

    const [googlePages, paddlePages] = await Promise.all([
      runDocumentAiOcr({ buffer, mimeType }).catch(() => []),
      runPaddleOcr({ buffer, filename, mimeType }).catch(() => []),
    ])

    for (const page of googlePages) {
      outputs.push({
        engine: 'google_document_ai',
        page_number: page.page_number,
        raw_text: page.raw_text,
        confidence: page.confidence,
      })
    }

    for (const page of paddlePages) {
      outputs.push({
        engine: 'paddleocr',
        page_number: page.page_number,
        raw_text: page.raw_text,
        confidence: page.confidence,
      })
    }

    if (googlePages.length === 0 && paddlePages.length === 0) {
      outputs.push({
        engine: 'google_document_ai',
        page_number: file.page_number,
        raw_text: '',
        confidence: 0,
      })
    }
  }

  return outputs.sort((a, b) => {
    if (a.page_number !== b.page_number) return a.page_number - b.page_number
    return a.engine.localeCompare(b.engine)
  })
}

function extractCandidatesFromLayout(
  layoutData: any,
  ocrPages: OcrEnginePageOutput[]
): ExtractedCandidate[] {
  const pagesByKey = new Map<string, OcrEnginePageOutput>()

  for (const page of ocrPages) {
    pagesByKey.set(`${page.engine}:${page.page_number}`, page)
  }

  const candidates: ExtractedCandidate[] = []

  for (const page of layoutData?.pages ?? []) {
    const pageNumber = Number(page?.page_number ?? 1)
    const rois = Array.isArray(page?.rois) ? page.rois : []

    for (const roi of rois) {
      if (!['answer', 'table_cell', 'student_id'].includes(String(roi?.kind ?? ''))) continue

      const answerType = roi?.answer_type ?? 'number'

      const engines: Array<'google_document_ai' | 'paddleocr'> = [
        'google_document_ai',
        'paddleocr',
      ]

      let rank = 1

      for (const engine of engines) {
        const pageOcr = pagesByKey.get(`${engine}:${pageNumber}`)

        const raw = pageOcr?.raw_text ?? ''
        const normalized = normalizeAnswer(raw, answerType)

        candidates.push({
          roi_id: String(roi.id),
          page_number: pageNumber,
          rank,
          raw_text: raw,
          normalized_value: normalized,
          confidence_score: Number(pageOcr?.confidence ?? 0),
          engine_source: engine,
        })

        rank += 1
      }
    }
  }

  return candidates
}

function buildResultRows(
  layoutData: any,
  answerKey: any,
  candidates: ExtractedCandidate[],
  submissionId: string,
  layoutSpecVersion: number
) {
  const candidateMap = new Map<string, OcrCandidateInput[]>()

  for (const c of candidates) {
    const list = candidateMap.get(c.roi_id) ?? []
    list.push({
      roi_id: c.roi_id,
      page_number: c.page_number,
      engine_source: c.engine_source,
      raw_text: c.raw_text,
      normalized_value: c.normalized_value,
      confidence_score: c.confidence_score,
    })
    candidateMap.set(c.roi_id, list)
  }

  const answerItems = Array.isArray(answerKey?.items) ? answerKey.items : []
  const answerKeyByRoi = new Map<string, any>()
  for (const item of answerItems) {
    if (item?.roi_id) answerKeyByRoi.set(String(item.roi_id), item)
  }

  const rows: any[] = []

  for (const page of layoutData?.pages ?? []) {
    const pageNumber = Number(page?.page_number ?? 1)
    const rois = Array.isArray(page?.rois) ? page.rois : []

    for (const roi of rois) {
      if (!['answer', 'table_cell'].includes(String(roi?.kind ?? ''))) continue

      const roiId = String(roi.id)
      const ak = answerKeyByRoi.get(roiId)
      const expected = ak?.expected_value ?? null
      const scoreWeight = Number(roi?.score_weight ?? ak?.points ?? 1)
      const answerType = roi?.answer_type ?? ak?.answer_type ?? 'number'

      const fused = fuseCandidatesPerRoi({
        roi_id: roiId,
        page_number: pageNumber,
        candidates: candidateMap.get(roiId) ?? [],
        answerKey,
        answerType,
      })

      const selected = fused.selected
      const normalized = selected?.normalized_value ?? ''
      const raw = selected?.raw_text ?? ''

      const isCorrect =
        expected != null && String(expected).trim() === String(normalized).trim()

      const autoScore = isCorrect ? scoreWeight : 0

      rows.push({
        submission_id: submissionId,
        item_no:
          String(roi?.question_no ?? roiId) +
          (roi?.part_no ? `.${roi.part_no}` : ''),
        extracted_raw: raw || null,
        extracted_normalized: normalized || null,
        ai_confidence: Number(fused.fused_confidence ?? 0),
        auto_score: Number(autoScore.toFixed(2)),
        final_score: Number(autoScore.toFixed(2)),
        is_overridden: false,
        reviewer_notes: fused.disagreement_reason
          ? `fusion_reason=${fused.disagreement_reason}`
          : null,
        page_number: pageNumber,
        roi_id: roiId,
        layout_spec_version: layoutSpecVersion,
        selected_candidate_id: null,
        evidence_map: {
          fusion: {
            agreement: fused.agreement,
            disagreement_reason: fused.disagreement_reason,
            needs_review_signal: fused.needs_review_signal,
            candidate_count: fused.all_candidates.length,
            candidates: fused.all_candidates.map((c) => ({
              engine_source: c.engine_source,
              raw_text: c.raw_text,
              normalized_value: c.normalized_value,
              confidence_score: c.confidence_score,
            })),
          },
          expected_value: expected,
        },
        is_human_override: false,
        manual_reason: null,
        confidence_score: Number(fused.fused_confidence ?? 0),
        meta_score_attendance: 0,
        meta_score_punctuality: 0,
        meta_score_accuracy: 0,
        final_meta_score: 0,
        is_blank: !raw && !normalized,
      })
    }
  }

  return rows
}

export async function processSubmissionPipeline(submissionId: string) {
  const supabase = await createClient()

  const { data: submission, error: submissionError } = await supabase
    .from('submissions')
    .select(`
      id,
      assignment_id,
      student_id,
      layout_spec_id,
      layout_spec_version,
      status,
      current_stage
    `)
    .eq('id', submissionId)
    .single()

  if (submissionError) throw submissionError

  await supabase
    .from('submissions')
    .update({
      status: 'uploaded',
      current_stage: 'ocr_processing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)

  const { data: files, error: filesError } = await supabase
    .from('submission_files')
    .select('id, submission_id, page_number, storage_path')
    .eq('submission_id', submissionId)
    .order('page_number', { ascending: true })

  if (filesError) throw filesError
  if (!files || files.length === 0) throw new Error('No submission_files found')

  for (const file of files) {
    await supabase.from('ocr_jobs').upsert(
      {
        file_id: file.id,
        status: 'processing',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'file_id' }
    )
  }

  const ocrOutputs = await runDualOcrForSubmissionFiles(supabase, files)

  for (const file of files) {
    const filePages = ocrOutputs.filter((x) => x.page_number === file.page_number)

    const mergedRawText = filePages
      .map((x) => `[${x.engine}] ${x.raw_text}`)
      .join('\n\n')

    const avgConfidence =
      filePages.length > 0
        ? filePages.reduce((sum, x) => sum + Number(x.confidence ?? 0), 0) / filePages.length
        : 0

    await supabase
      .from('ocr_jobs')
      .update({
        status: 'done',
        raw_text: mergedRawText,
        confidence: Number(avgConfidence.toFixed(4)),
        provider_metadata: {
          providers: filePages.map((x) => ({
            engine: x.engine,
            confidence: x.confidence,
          })),
        },
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('file_id', file.id)
  }

  await supabase
    .from('submissions')
    .update({
      current_stage: 'extracting_answers',
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)

  const { data: layoutSpec, error: layoutError } = submission.layout_spec_id
    ? await supabase
        .from('assignment_layout_specs')
        .select('id, version, layout_data')
        .eq('id', submission.layout_spec_id)
        .single()
    : await supabase
        .from('assignment_layout_specs')
        .select('id, version, layout_data')
        .eq('assignment_id', submission.assignment_id)
        .eq('is_active', true)
        .single()

  if (layoutError) throw layoutError

  await supabase.from('extraction_jobs').upsert(
    {
      submission_id: submissionId,
      status: 'processing',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'submission_id' }
  )

  const candidates = extractCandidatesFromLayout(layoutSpec.layout_data, ocrOutputs)

  await supabase.from('grading_candidates').delete().eq('submission_id', submissionId)

  if (candidates.length > 0) {
    const rows = candidates.map((c) => ({
      submission_id: submissionId,
      roi_id: c.roi_id,
      rank: c.rank,
      raw_text: c.raw_text,
      normalized_value: c.normalized_value,
      confidence_score: c.confidence_score,
      engine_source: c.engine_source,
      page_number: c.page_number,
      candidate_hash: null,
      layout_spec_version: layoutSpec.version ?? 1,
    }))

    const { error } = await supabase.from('grading_candidates').insert(rows)
    if (error) throw error
  }

  await supabase
    .from('extraction_jobs')
    .update({
      status: 'done',
      extracted_json: { candidate_count: candidates.length },
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('submission_id', submissionId)

  await supabase
    .from('submissions')
    .update({
      current_stage: 'auto_grading',
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)

  const { data: answerKey, error: answerKeyError } = await supabase
    .from('assignment_answer_keys')
    .select('assignment_id, answer_key, grading_config')
    .eq('assignment_id', submission.assignment_id)
    .maybeSingle()

  if (answerKeyError) throw answerKeyError

  const resultRows = buildResultRows(
    layoutSpec.layout_data,
    answerKey?.answer_key ?? { items: [] },
    candidates,
    submissionId,
    layoutSpec.version ?? 1
  )

  await supabase.from('grading_results').delete().eq('submission_id', submissionId)

  if (resultRows.length > 0) {
    const { error } = await supabase.from('grading_results').insert(resultRows)
    if (error) throw error
  }

  const totalScore = resultRows.reduce(
    (sum, row) => sum + Number(row.final_score ?? row.auto_score ?? 0),
    0
  )

  const reviewSignals = resultRows.filter(
    (row) =>
      row?.evidence_map?.fusion?.needs_review_signal === true ||
      Number(row.confidence_score ?? 0) < 0.75 ||
      row.is_blank === true
  ).length

  const nextStatus = reviewSignals > 0 ? 'needs_review' : 'graded'
  const nextStage = reviewSignals > 0 ? 'review_required' : 'auto_grading_completed'

  await supabase
    .from('submissions')
    .update({
      total_score: Number(totalScore.toFixed(2)),
      status: nextStatus,
      current_stage: nextStage,
      layout_spec_id: layoutSpec.id,
      layout_spec_version: layoutSpec.version ?? 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)

  return {
    ok: true,
    submission_id: submissionId,
    candidate_count: candidates.length,
    result_count: resultRows.length,
    total_score: Number(totalScore.toFixed(2)),
    review_signals: reviewSignals,
    next_status: nextStatus,
    next_stage: nextStage,
  }
}