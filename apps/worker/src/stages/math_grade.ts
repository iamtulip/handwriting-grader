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

  ocr1_confidence: number
  ocr2_confidence: number
  math_score: number
  final_confidence: number
  decision: 'auto_graded' | 'needs_review'
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0
  if (x < 0) return 0
  if (x > 1) return 1
  return x
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

function engineConfidence(
  candidates: PersistedCandidate[],
  engine: 'google_vision' | 'paddle_ocr'
): number {
  const c = candidates.find((x) => x.engine_source === engine)
  return clamp01(Number(c?.confidence_score ?? 0))
}

function engineText(
  candidates: PersistedCandidate[],
  engine: 'google_vision' | 'paddle_ocr'
): string | null {
  const c = candidates.find((x) => x.engine_source === engine)
  return c?.raw_text ?? null
}

function getWeights() {
  const alpha = Number(process.env.OCR_CONF_ALPHA ?? 0.35)
  const beta = Number(process.env.OCR_CONF_BETA ?? 0.35)
  const gamma = Number(process.env.OCR_CONF_GAMMA ?? 0.30)
  const sum = alpha + beta + gamma || 1

  return {
    alpha: alpha / sum,
    beta: beta / sum,
    gamma: gamma / sum,
  }
}

function getThreshold() {
  return Number(process.env.OCR_CONF_THRESHOLD ?? 0.9)
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
      ocr1_confidence: engineConfidence(candidates, 'google_vision'),
      ocr2_confidence: engineConfidence(candidates, 'paddle_ocr'),
      math_score: 0,
      final_confidence: 0,
      decision: 'needs_review',
    }
  }

  const expectedValue = answerKeyItem.expected_value
  const points = Number(answerKeyItem.points ?? roi.score_weight ?? 1)
  const answerType = answerKeyItem.answer_type ?? roi.answer_type ?? 'text'

  let best: PersistedCandidate | null = null
  let matched = false

  for (const candidate of candidates) {
    let ok = false

    if (answerType === 'number') {
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

    if (!best) best = candidate
  }

  if (!best && candidates.length > 0) {
    best = [...candidates].sort(
      (a, b) => Number(b.confidence_score ?? 0) - Number(a.confidence_score ?? 0)
    )[0]
  }

  const c1 = engineConfidence(candidates, 'google_vision')
  const c2 = engineConfidence(candidates, 'paddle_ocr')
  const m = matched ? 1 : 0

  const { alpha, beta, gamma } = getWeights()
  const C = clamp01(alpha * c1 + beta * c2 + gamma * m)
  const threshold = getThreshold()

  const decision: 'auto_graded' | 'needs_review' =
    C >= threshold ? 'auto_graded' : 'needs_review'

  const autoScore = matched ? points : 0
  const finalScore = autoScore

  return {
    matched,
    auto_score: autoScore,
    final_score: finalScore,
    selected_candidate_id: best?.id ?? null,
    confidence: C,
    reason: matched ? 'deterministic_match' : 'deterministic_no_match',
    ocr1_confidence: c1,
    ocr2_confidence: c2,
    math_score: m,
    final_confidence: C,
    decision,
    evidence_map: {
      roi_id: roi.roi_id,
      expected_value: expectedValue,
      answer_type: answerType,
      points,
      ocr1_text: engineText(candidates, 'google_vision'),
      ocr2_text: engineText(candidates, 'paddle_ocr'),
      ocr1_confidence: c1,
      ocr2_confidence: c2,
      math_score: m,
      alpha,
      beta,
      gamma,
      final_confidence: C,
      threshold,
      decision,
      selected_candidate_text: best?.raw_text ?? null,
      selected_candidate_normalized: best?.normalized_value ?? null,
    },
  }
}