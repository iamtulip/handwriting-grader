import { supabase } from '../db';

export async function generateCandidates(submissionId: string) {
  console.log(`[CANDIDATE] Generating N-best lattice for ${submissionId}`);

  // 1. เรียก OCR A (Google Vision)
  // 2. เรียก OCR B (PaddleOCR - ทนทานภาษาไทย/ลายมือ)
  // 3. เรียก Math Specialist (Mathpix - สำหรับสูตร)

  const candidates = [
    { id: "c1", text: "324,729", normalized: "324729", source: "Vision", prob: 0.95 },
    { id: "c2", text: "324.729", normalized: "324.729", source: "Paddle", prob: 0.85 },
    { id: "c3", text: "324729", normalized: "324729", source: "Heuristic", prob: 0.99 }
  ];

  // บันทึกลง Candidate Set เพื่อรอให้ Verifier/Grader เลือก
  return candidates;
}