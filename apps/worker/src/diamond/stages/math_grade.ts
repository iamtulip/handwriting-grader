//บทบาท: หัวใจของการตัดสินคะแนน (The Judge) โดยใช้ตรรกะทางคณิตศาสตร์ 100% ซึ่งจะเปรียบเทียบคำตอบของนักศึกษาจากบรรดา Candidates กับเฉลยใน Layout Spec พร้อมพิจารณาค่าความคลาดเคลื่อน
// apps/worker/src/diamond/stages/math_grade.ts
import { MathNormalizer } from '../engines/math_normalizer';

export type GradeResult = {
  score: number;
  confidence: number; // 0..1
  disagreement: boolean;
  reason: string;
  matched_candidate_id?: string | null; // helps downstream
};

type CandidateRow = {
  id: string;
  raw_text?: string | null;
  normalized_value?: string | null;
  confidence_score?: number | null;
  engine_source?: string | null;
  rank?: number | null;
};

type ToleranceConfig = {
  abs_tol: number;
  rel_tol: number;
  policy?: 'thousands_comma' | 'decimal_comma';
};

function clamp01(x: any) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function computeDisagreement(cands: CandidateRow[], topK: number = 4) {
  const slice = cands.slice(0, topK);

  const normSet = new Set(
    slice
      .map((c) => (c.normalized_value ?? '').toString().trim())
      .filter((s) => s.length > 0)
  );

  const engineSet = new Set(
    slice
      .map((c) => (c.engine_source ?? '').toString().trim())
      .filter((s) => s.length > 0)
  );

  // disagreement if:
  // - multiple distinct normalized values among topK
  // OR
  // - multiple engines produce different outputs (approx proxy)
  const hasValueDisagreement = normSet.size > 1;
  const hasMultiEngine = engineSet.size > 1;

  return hasValueDisagreement && hasMultiEngine;
}

export async function deterministicGradeRoi(ctx: any, roi: any, dbCandidates: CandidateRow[]): Promise<GradeResult> {
  console.log(`[GRADER] Judging ROI: ${roi.roi_id} (p${roi.page_number})`);

  const expectedValue = roi.config?.expected_value;
  if (expectedValue === undefined || expectedValue === null || `${expectedValue}`.trim() === '') {
    // missing answer key => must review
    return { score: 0, confidence: 0, disagreement: true, reason: 'missing_expected_value', matched_candidate_id: null };
  }

  const toleranceCfg: ToleranceConfig = {
    abs_tol: roi.config?.abs_tol ?? 0,
    rel_tol: roi.config?.rel_tol ?? 0,
    policy: roi.config?.policy ?? 'thousands_comma',
  };

  if (!dbCandidates || dbCandidates.length === 0) {
    return { score: 0, confidence: 0, disagreement: false, reason: 'no_candidates', matched_candidate_id: null };
  }

  const points = roi.config?.points ?? 1;

  // 1) Find first matching candidate (use lattice, not only top1)
  let matched: CandidateRow | null = null;

  for (const c of dbCandidates) {
    const studentRaw = (c.raw_text ?? c.normalized_value ?? '').toString();
    if (!studentRaw.trim()) continue;

    const ok = MathNormalizer.isEquivalent(studentRaw, expectedValue, {
      abs_tol: toleranceCfg.abs_tol,
      rel_tol: toleranceCfg.rel_tol,
    });

    if (ok) {
      matched = c;
      break;
    }
  }

  const hasDisagreement = computeDisagreement(dbCandidates, 4);

  const isCorrect = Boolean(matched);
  const finalScore = isCorrect ? points : 0;

  // 2) Confidence policy:
  // - base on matched candidate if correct; else top1 confidence
  // - penalize if disagreement
  // - penalize slightly if correct candidate is not rank 1 (means OCR uncertainty)
  const top1 = dbCandidates[0];
  const base = isCorrect ? clamp01(matched?.confidence_score) : clamp01(top1?.confidence_score);

  const rankPenalty = isCorrect && matched?.rank && matched.rank > 1 ? Math.max(0.6, 1 - 0.07 * (matched.rank - 1)) : 1;
  const disagreementPenalty = hasDisagreement ? 0.8 : 1;

  const decisionConfidence = clamp01(base * rankPenalty * disagreementPenalty);

  return {
    score: finalScore,
    confidence: decisionConfidence,
    disagreement: Boolean(hasDisagreement),
    reason: isCorrect ? 'math_match_success' : 'math_mismatch',
    matched_candidate_id: matched?.id ?? null,
  };
}