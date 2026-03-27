import { supabase } from '../lib/supabase'
import type { WorkerContext } from './load_context'
import type { RoiCrop } from './roi_crop'
import type { OcrCandidate } from './ocr_ensemble'

export type PersistedCandidate = {
  id: string
  submission_id: string
  roi_id: string
  rank: number
  raw_text: string | null
  normalized_value: string | null
  confidence_score: number | null
  engine_source: string | null
  created_at?: string | null
  page_number?: number | null
  candidate_hash?: string | null
  layout_spec_version?: number | null
}

function safeText(value: unknown): string {
  return String(value ?? '').trim()
}

function safeNullableText(value: unknown): string | null {
  const s = safeText(value)
  return s.length > 0 ? s : null
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function buildCandidateHash(
  submissionId: string,
  roiId: string,
  rank: number,
  normalizedValue: string | null,
  rawText: string | null,
  engineSource: string | null
): string {
  return [
    submissionId,
    roiId,
    String(rank),
    normalizedValue ?? '',
    rawText ?? '',
    engineSource ?? '',
  ].join('::')
}

export async function persistCandidates(
  ctx: WorkerContext,
  roi: RoiCrop,
  rawCandidates: OcrCandidate[]
): Promise<PersistedCandidate[]> {
  const submissionId = ctx.submission.id

  const cleaned = rawCandidates
    .map((item) => ({
      raw_text: safeNullableText(item.raw_text),
      normalized_value: safeNullableText(item.normalized_value),
      confidence_score: safeNumber(item.confidence_score, 0),
      engine_source: safeNullableText(item.engine_source),
    }))
    .filter((item) => item.raw_text !== null || item.normalized_value !== null)
    .sort((a, b) => b.confidence_score - a.confidence_score)

  console.log('[worker] persistCandidates input', {
    submission_id: submissionId,
    roi_id: roi.roi_id,
    total: cleaned.length,
    top3: cleaned.slice(0, 3),
  })

  const { error: deleteError } = await supabase
    .from('grading_candidates')
    .delete()
    .eq('submission_id', submissionId)
    .eq('roi_id', roi.roi_id)

  if (deleteError) {
    throw new Error(`Failed to delete old grading_candidates: ${deleteError.message}`)
  }

  if (cleaned.length === 0) {
    console.warn('[worker] persistCandidates no candidates after cleaning', {
      submission_id: submissionId,
      roi_id: roi.roi_id,
    })
    return []
  }

  const rowsToInsert = cleaned.map((item, index) => {
    const rank = index + 1
    const normalizedValue = item.normalized_value
    const rawText = item.raw_text
    const engineSource = item.engine_source

    return {
      submission_id: submissionId,
      roi_id: roi.roi_id,
      rank,
      raw_text: rawText,
      normalized_value: normalizedValue,
      confidence_score: item.confidence_score,
      engine_source: engineSource,
      page_number: roi.page_number,
      layout_spec_version: ctx.layoutSpec.version,
      candidate_hash: buildCandidateHash(
        submissionId,
        roi.roi_id,
        rank,
        normalizedValue,
        rawText,
        engineSource
      ),
    }
  })

  const { data, error } = await supabase
    .from('grading_candidates')
    .insert(rowsToInsert)
    .select(`
      id,
      submission_id,
      roi_id,
      rank,
      raw_text,
      normalized_value,
      confidence_score,
      engine_source,
      created_at,
      page_number,
      candidate_hash,
      layout_spec_version
    `)

  if (error) {
    throw new Error(`Failed to insert grading_candidates: ${error.message}`)
  }

  const persisted = (data ?? []) as PersistedCandidate[]

  console.log('[worker] persistCandidates inserted', {
    submission_id: submissionId,
    roi_id: roi.roi_id,
    inserted: persisted.length,
  })

  return persisted
}