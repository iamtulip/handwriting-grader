import type { WorkerContext, WorkerAnswerKeyItem } from './load_context'
import type { RoiCrop } from './roi_crop'
import type { PersistedCandidate } from './candidate_persist'

export type GradeDecision = {
  matched: boolean
  auto_score: number
  final_score: number
  selected_candidate_id: string | null
  evidence_map: Record<string, unknown>
  confidence: number
  reason: string
}

function normalizeString(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function tryParseNumber(value: unknown): number | null {
  const s = String(value ?? '')
    .replace(/\s+/g, '')
    .replace(/,/g, '')

  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function numericEqual(actual: unknown, expected: unknown, absTol = 0.01): boolean {
  const a = tryParseNumber(actual)
  const e = tryParseNumber(expected)
  if (a === null || e === null) return false
  return Math.abs(a - e) <= absTol
}

function findAnswerKeyItem(ctx: WorkerContext, roi: RoiCrop): WorkerAnswerKeyItem | null {
  const items = ctx.answerKey?.answer_key?.items ?? []

  const byRoi = items.find((item) => item.roi_id === roi.roi_id)
  if (byRoi) return byRoi

  const byQuestion = items.find(
    (item) =>
      item.page_number === roi.page_number &&
      item.question_no != null &&
      roi.question_no != null &&
      item.question_no === roi.question_no
  )

  return byQuestion ?? null
}

export async function deterministicGradeRoi(
  ctx: WorkerContext,
  roi: RoiCrop,
  candidates: PersistedCandidate[]
): Promise<GradeDecision> {
  const answerKeyItem = findAnswerKeyItem(ctx, roi)

  if (!answerKeyItem) {
    return {
      matched: false,
      auto_score: 0,
      final_score: 0,
      selected_candidate_id: candidates[0]?.id ?? null,
      confidence: 0,
      reason: 'answer_key_not_found',
      evidence_map: {
        roi_id: roi.roi_id,
        page_number: roi.page_number,
      },
    }
  }

  const expectedValue = answerKeyItem.expected_value
  const points = Number(answerKeyItem.points ?? roi.score_weight ?? 1)

  let best: PersistedCandidate | null = null
  let matched = false

  for (const candidate of candidates) {
    let ok = false

    if ((answerKeyItem.answer_type ?? roi.answer_type) === 'number') {
      ok = numericEqual(candidate.normalized_value, expectedValue, 0.01)
    } else {
      ok =
        normalizeString(candidate.normalized_value) ===
        normalizeString(expectedValue)
    }

    if (ok) {
      best = candidate
      matched = true
      break
    }

    if (!best) {
      best = candidate
    }
  }

  return {
    matched,
    auto_score: matched ? points : 0,
    final_score: matched ? points : 0,
    selected_candidate_id: best?.id ?? null,
    confidence: Number(best?.confidence_score ?? 0),
    reason: matched ? 'deterministic_match' : 'deterministic_no_match',
    evidence_map: {
      roi_id: roi.roi_id,
      expected_value: expectedValue,
      selected_candidate_text: best?.raw_text ?? null,
      selected_candidate_normalized: best?.normalized_value ?? null,
      answer_type: answerKeyItem.answer_type ?? roi.answer_type ?? null,
    },
  }
}