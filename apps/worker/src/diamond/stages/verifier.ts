// apps/worker/src/diamond/stages/verifier.ts
//บทบาท: ใช้ Gemini ในโหมด "Grounded Judge" เพื่อเลือกคำตอบที่ถูกต้องที่สุดจาก Candidates โดยถูกสั่งให้ "ห้ามคิดเลขเอง" แต่ให้เลือกจากหลักฐานที่มีเท่านั้น
//ทำให้ “Gemini = พยาน” จริง:
//ถ้าไม่จำเป็น → ข้าม
///ถ้าจำเป็น → ต้องเลือก selected_candidate_id จาก list เท่านั้น
//้าเลือกมั่ว/ไม่อยู่ใน list → uncertainty_flag=true และส่งคน
//evidence_map บันทึกได้ทันทีใน grading_results
export type VerifierDecision = {
  selected_candidate_id: string | null;
  uncertainty_flag: boolean;
  evidence_map: {
    reason: string;
    model?: string;
    // bbox is optional; if you later implement grounded bbox from Gemini
    visual_bbox?: [number, number, number, number];
    // audit extras
    candidates_count?: number;
  };
};

type GradeResult = {
  score: number;
  confidence: number; // 0..1
  disagreement?: boolean;
  reason?: string;
};

function shouldCallVerifier(gradeResult: GradeResult) {
  // Conservative defaults for V2:
  // - if disagreement OR confidence below threshold => call verifier
  return Boolean(gradeResult.disagreement) || gradeResult.confidence < 0.95;
}

/**
 * Production: call Gemini with STRICT schema output:
 * {
 *   selected_candidate_id: string,
 *   uncertainty_flag: boolean,
 *   evidence: { bbox: [...], note: "..." }
 * }
 *
 * Hard rule: Gemini can only pick one of the candidate IDs provided.
 */
async function callGeminiConstrainedMock(candidateIds: string[]) {
  // TODO: Replace with real Gemini call (Flash/Pro as you decide)
  // MUST return an ID from candidateIds OR set uncertainty_flag=true
  return {
    selected_candidate_id: candidateIds[0] ?? null,
    uncertainty_flag: false,
    visual_bbox: [10, 10, 50, 50] as [number, number, number, number],
    model: 'gemini-1.5-flash',
    reason: 'mock_verifier_confirmed',
  };
}

export async function verifyRoiIfNeeded(ctx: any, roi: any, dbCandidates: any[], gradeResult: GradeResult): Promise<{
  auto_score: number;
  final_score: number;
  selected_candidate_id: string | null;
  evidence_map: any;
  needs_human_review?: boolean;
}> {
  // If no candidates => cannot verify; must escalate to human
  if (!dbCandidates || dbCandidates.length === 0) {
    return {
      auto_score: 0,
      final_score: 0,
      selected_candidate_id: null,
      evidence_map: { reason: 'no_candidates', model: null },
      needs_human_review: true,
    };
  }

  const needsVerifier = shouldCallVerifier(gradeResult);

  // If not needed, accept best candidate (rank 1) deterministically
  const best = dbCandidates[0];

  if (!needsVerifier) {
    return {
      auto_score: gradeResult.score,
      final_score: gradeResult.score,
      selected_candidate_id: best?.id ?? null,
      evidence_map: {
        reason: 'high_confidence_match',
        candidates_count: dbCandidates.length,
      },
    };
  }

  console.log(`[VERIFIER] Escalating ROI ${roi.roi_id} (p${roi.page_number}) to AI Judge`);

  const candidateIds = dbCandidates.map((c: any) => c.id).filter(Boolean);

  const v = await callGeminiConstrainedMock(candidateIds);

  // Guard: Gemini must pick from provided IDs
  const ok = v.selected_candidate_id && candidateIds.includes(v.selected_candidate_id);

  const decision: VerifierDecision = ok
    ? {
        selected_candidate_id: v.selected_candidate_id,
        uncertainty_flag: Boolean(v.uncertainty_flag),
        evidence_map: {
          reason: v.reason || 'gemini_confirmed',
          model: v.model,
          visual_bbox: v.visual_bbox,
          candidates_count: candidateIds.length,
        },
      }
    : {
        selected_candidate_id: null,
        uncertainty_flag: true,
        evidence_map: {
          reason: 'verifier_invalid_selection_rejected',
          model: v.model,
          candidates_count: candidateIds.length,
        },
      };

  // If verifier uncertain -> route to human (do NOT auto-final)
  if (decision.uncertainty_flag || !decision.selected_candidate_id) {
    return {
      auto_score: gradeResult.score,
      final_score: gradeResult.score,
      selected_candidate_id: decision.selected_candidate_id,
      evidence_map: decision.evidence_map,
      needs_human_review: true,
    };
  }

  return {
    auto_score: gradeResult.score,
    final_score: gradeResult.score,
    selected_candidate_id: decision.selected_candidate_id,
    evidence_map: decision.evidence_map,
  };
}