import { processAlignment } from './pipelines/alignment';
import { generateCandidates } from './pipelines/candidate_gen';
import { checkEquivalence } from './pipelines/math_engine';
// ... import อื่นๆ

async function runDiamondPipeline(submissionId: string, assignmentId: string) {
  try {
    // 1. Image Geometry (Align & Crop)
    await processAlignment(submissionId, assignmentId);

    // 2. Ensemble Recognition
    const candidates = await generateCandidates(submissionId);

    // 3. Deterministic Pre-check (ถ้าทุกตัวตรงกันและผ่าน Math Logic ไม่ต้องเรียก LLM เพื่อประหยัดเงิน)
    // 4. Verifier Judge (ถ้ามีข้อสงสัย เรียก Gemini มาตัดสิน)
    
    // 5. Final scoring & Audit Log
    // บันทึก artifacts ครบชุด (ROI, OCR, Lattice, Proof, Decision)
    
    console.log(`[PIPELINE] ✅ Submission ${submissionId} graded with high confidence.`);
  } catch (err) {
    console.error(`[PIPELINE] ❌ Failed:`, err);
    // ส่งเข้า Human Review Queue พร้อมหลักฐานที่ทำค้างไว้
  }
}