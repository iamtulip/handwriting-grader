import { MathNormalizer } from './engines/math_normalizer';
import { supabase } from './lib/supabase';

export async function processSubmissionV2(submissionId: string) {
  // 1. ดึงข้อมูลและ Layout Spec ล่าสุด
  const { data: sub } = await supabase.from('submissions').select('*, assignments(id)').eq('id', submissionId).single();
  const { data: spec } = await supabase
    .from('assignment_layout_specs')
    .select('*')
    .eq('assignment_id', sub.assignments.id)
    .eq('is_active', true)
    .single();

  // 2. Loop จัดการ "รายหน้า" (Multi-page Support)
  for (const page of spec.layout_data.pages) {
    await updateStage(submissionId, `align_page_${page.page_number}`);
    
    // -- Alignment Step --
    const alignment = await runAlignment(submissionId, page.page_number);
    await saveArtifact(submissionId, page.page_number, 'alignment_proof', alignment);

    // -- Extraction Step per ROI --
    for (const roi of page.rois) {
      await updateStage(submissionId, `extract_roi_${roi.id}`);
      
      const rawCandidates = await runOCREnsemble(submissionId, page.page_number, roi);
      
      // -- Persistence: เขียน Candidates ลง DB ทันทีเพื่อ Audit --
      const dbCandidates = await saveCandidates(submissionId, roi.id, rawCandidates);

      // -- Grading: Math Engine & Verifier --
      const bestCandidate = findBestMatch(dbCandidates, roi);
      
      if (bestCandidate.confidence < 0.98) {
         // เรียก VLM Verifier พร้อมส่ง Candidates ทั้งหมดไปให้เลือก
         await runVLMVerifier(submissionId, roi, dbCandidates);
      } else {
         await finalizeScore(submissionId, roi, bestCandidate);
      }
    }
  }
  
  await updateStage(submissionId, 'completed');
}

async function saveCandidates(subId: string, roiId: string, candidates: any[]) {
  const formatted = candidates.map((c, index) => ({
    submission_id: subId,
    roi_id: roiId,
    rank: index + 1,
    raw_text: c.text,
    normalized_value: MathNormalizer.normalize(c.text),
    confidence_score: c.score,
    engine_source: c.engine
  }));
  
  const { data } = await supabase.from('grading_candidates').insert(formatted).select();
  return data;
}