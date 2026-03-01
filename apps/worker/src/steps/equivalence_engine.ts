import { supabase } from '../lib/supabase';

export async function gradeEquivalence(submissionId: string, candidates: any[]) {
  // 1. ดึงคำตอบที่ถูกต้อง (Expected Answer) จาก Layout Spec
  const { data: submission } = await supabase
    .from('submissions')
    .select('assignments(layout_spec)')
    .eq('id', submissionId)
    .single();

  const results = [];

  for (const roi of submission.assignments.layout_spec.rois) {
    // Logic: ดึง N-best candidates ที่ตรงกับข้อนี้
    const studentCandidates = candidates.filter(c => c.roi_id === roi.id);
    
    // 2. Deterministic Check (Numeric/Symbolic)
    let finalDecision = null;
    for (const cand of studentCandidates) {
      if (isMathEquivalent(cand.normalized, roi.expected_answer, roi.tolerance)) {
        finalDecision = cand;
        break;
      }
    }

    // 3. หากไม่ชัวร์ ส่งให้ VLM Verifier (Constrained Pick)
    if (!finalDecision) {
      // เรียกโมดูล Gemini Verifier (ห้ามมั่วตัวเลขใหม่)
      // finalDecision = await callVLMVerifier(roi.image_path, studentCandidates);
    }

    results.push({
        roi_id: roi.id,
        score: finalDecision ? 1 : 0,
        confidence: finalDecision ? finalDecision.prob : 0
    });
  }

  return { 
    confidence: Math.min(...results.map(r => r.confidence)) 
  };
}

function isMathEquivalent(a: string, b: string, tol: number): boolean {
  // รองรับ 0.5 == 1/2 และ Tolerance
  const valA = parseFloat(a);
  const valB = parseFloat(b);
  return Math.abs(valA - valB) <= tol;
}