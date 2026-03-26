import type { WorkerContext } from './load_context'
import type { RoiCrop } from './roi_crop'
import type { PersistedCandidate } from './candidate_persist'
import type { GradeDecision } from './math_grade'

export type FinalDecision = {
  auto_score: number
  final_score: number
  selected_candidate_id: string | null
  evidence_map: Record<string, unknown>

  review_required: boolean
  ocr1_confidence: number
  ocr2_confidence: number
  math_score: number
  final_confidence: number
  decision: 'auto_graded' | 'needs_review'
}

export async function verifyRoiIfNeeded(
  _ctx: WorkerContext,
  _roi: RoiCrop,
  _candidates: PersistedCandidate[],
  grade: GradeDecision
): Promise<FinalDecision> {
  const reviewRequired = grade.decision === 'needs_review'

  return {
    auto_score: grade.auto_score,
    final_score: grade.final_score,
    selected_candidate_id: grade.selected_candidate_id,
    review_required: reviewRequired,
    ocr1_confidence: grade.ocr1_confidence,
    ocr2_confidence: grade.ocr2_confidence,
    math_score: grade.math_score,
    final_confidence: grade.final_confidence,
    decision: grade.decision,
    evidence_map: {
      ...grade.evidence_map,
      verifier_used: false,
      review_required: reviewRequired,
      decision: grade.decision,
      ocr1_confidence: grade.ocr1_confidence,
      ocr2_confidence: grade.ocr2_confidence,
      math_score: grade.math_score,
      final_confidence: grade.final_confidence,
    },
  }
}