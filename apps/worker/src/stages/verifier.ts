import type { WorkerContext, WorkerAnswerKeyItem } from './load_context'
import type { RoiCrop } from './roi_crop'
import type { PersistedCandidate } from './candidate_persist'
import type { GradeMathAnswerResult } from './math_grade'

type VerifyAndFinalizeArgs = {
  ctx: WorkerContext
  roi: RoiCrop
  candidates: PersistedCandidate[]
  grade: GradeMathAnswerResult
  answerKeyItem: WorkerAnswerKeyItem | null
}

export type VerifyAndFinalizeResult = {
  alpha: number
  beta: number
  gamma: number
  final_confidence: number
  threshold: number
  decision: 'auto_graded' | 'needs_review'
  selected_candidate_text: string | null
  selected_candidate_normalized: string | null
  selected_candidate_id: string | null
  verifier_used: boolean
  review_required: boolean
  auto_score: number
  final_score: number
  evidence_map: any
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function confidenceOfSelectedCandidate(
  candidates: PersistedCandidate[],
  selectedCandidateId: string | null
): number {
  if (!Array.isArray(candidates) || candidates.length === 0) return 0

  if (selectedCandidateId) {
    const found = candidates.find((c) => String(c.id) === String(selectedCandidateId))
    if (found) return clamp01(Number(found.confidence_score ?? 0))
  }

  return clamp01(Number(candidates[0]?.confidence_score ?? 0))
}

function deterministicScore(grade: GradeMathAnswerResult): number {
  return clamp01(Number(grade?.match_score ?? 0))
}

function binaryMatchedScore(grade: GradeMathAnswerResult): number {
  return grade?.matched ? 1 : 0
}

export async function verifyAndFinalize({
  ctx: _ctx,
  roi: _roi,
  candidates,
  grade,
  answerKeyItem: _answerKeyItem,
}: VerifyAndFinalizeArgs): Promise<VerifyAndFinalizeResult> {
  const alpha = 0.35
  const beta = 0.35
  const gamma = 0.3

  const c1 = deterministicScore(grade)
  const c2 = confidenceOfSelectedCandidate(candidates, grade?.selected_candidate_id ?? null)
  const m = binaryMatchedScore(grade)

  const final_confidence = clamp01(alpha * c1 + beta * c2 + gamma * m)
  const threshold = 0.9

  const decision: 'auto_graded' | 'needs_review' =
    final_confidence >= threshold ? 'auto_graded' : 'needs_review'

  return {
    alpha,
    beta,
    gamma,
    final_confidence,
    threshold,
    decision,
    selected_candidate_text: grade?.selected_candidate_text ?? null,
    selected_candidate_normalized: grade?.selected_candidate_normalized ?? null,
    selected_candidate_id: grade?.selected_candidate_id ?? null,
    verifier_used: true,
    review_required: decision === 'needs_review',
    auto_score: Number(grade?.auto_score ?? 0),
    final_score: Number(grade?.auto_score ?? 0),
    evidence_map: {
      c1,
      c2,
      m,
      formula: 'C = alpha*c1 + beta*c2 + gamma*m',
    },
  }
}