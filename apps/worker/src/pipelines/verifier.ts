import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const verifierSchema = {
  type: SchemaType.OBJECT,
  properties: {
    selected_candidate_id: { type: SchemaType.STRING, description: "ID ของคำตอบที่ตรงกับรูปที่สุด" },
    evidence_reasoning: { type: SchemaType.STRING, description: "เหตุผลที่เลือกภาพนี้" },
    uncertainty_flag: { type: SchemaType.BOOLEAN, description: "จริง หากรูปอ่านยากเกินไปและควรส่งให้มนุษย์" }
  },
  required: ["selected_candidate_id", "uncertainty_flag"]
};

export async function verifyWithGemini(roiBuffer: Buffer, candidates: any[]) {
  // บังคับ Gemini: "จงเลือกจากรายการ candidates นี้เท่านั้น ห้ามคิดเลขเอง"
  // ส่งรูป ROI ชิ้นเล็กๆ ไปเพื่อให้ Gemini โฟกัสถูกจุด
  // ...
  return { selected_candidate_id: "c1", uncertainty_flag: false };
}