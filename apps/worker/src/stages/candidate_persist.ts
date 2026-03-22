import { supabase } from '../lib/supabase'
import type { WorkerContext } from './load_context'
import type { RoiCrop } from './roi_crop'
import type { OcrRawCandidate } from './ocr_ensemble'

export type PersistedCandidate = {
  id: string
  submission_id: string
  roi_id: string
  page_number: number
  rank: number
  raw_text: string
  normalized_value: string | null
  confidence_score: number | null
  engine_source: string | null
}

export async function persistCandidates(
  ctx: WorkerContext,
  roi: RoiCrop,
  rawCandidates: OcrRawCandidate[]
): Promise<PersistedCandidate[]> {
  if (!rawCandidates.length) {
    return []
  }

  const rows = rawCandidates.map((candidate, index) => ({
    submission_id: ctx.submission.id,
    roi_id: roi.roi_id,
    page_number: roi.page_number,
    rank: index + 1,
    raw_text: candidate.text,
    normalized_value: candidate.normalized_value ?? null,
    confidence_score: candidate.confidence_score ?? null,
    engine_source: candidate.engine_source ?? null,
  }))

  const { data, error } = await supabase
    .from('grading_candidates')
    .upsert(rows, {
      onConflict: 'submission_id,roi_id,page_number,rank' as any,
    })
    .select(`
      id,
      submission_id,
      roi_id,
      page_number,
      rank,
      raw_text,
      normalized_value,
      confidence_score,
      engine_source
    `)
    .order('rank', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []) as PersistedCandidate[]
}