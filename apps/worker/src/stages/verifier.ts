import type { WorkerContext } from './load_context'
import type { RoiCrop } from './roi_crop'
import type { PersistedCandidate } from './candidate_persist'
import type { GradeDecision } from './math_grade'

export type FinalDecision = {
  auto_score: number
  final_score: number
  selected_candidate_id: string | null
  evidence_map: Record<string, unknown>
}

export async function verifyRoiIfNeeded(
  _ctx: WorkerContext,
  _roi: RoiCrop,
  _candidates: PersistedCandidate[],
  grade: GradeDecision
): Promise<FinalDecision> {
  // รอบแรกยังไม่เรียก verifier จริง
  // ถ้าต้องการภายหลัง ค่อยเปิดเงื่อนไข low confidence / disagreement

  return {
    auto_score: grade.auto_score,
    final_score: grade.final_score,
    selected_candidate_id: grade.selected_candidate_id,
    evidence_map: {
      ...grade.evidence_map,
      verifier_used: false,
      grade_reason: grade.reason,
      grade_confidence: grade.confidence,
    },
  }
}