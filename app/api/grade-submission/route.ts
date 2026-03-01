// app/api/grade-submission/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// กำหนด Threshold ความมั่นใจ (ถ้า AI มั่นใจต่ำกว่า 85% ต้องให้คนตรวจซ้ำเสมอ)
const CONFIDENCE_THRESHOLD = 0.85;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { submission_id } = body;

    if (!submission_id) {
      return NextResponse.json({ error: 'Missing submission_id' }, { status: 400 });
    }

    // 1. Initialize Supabase Admin Client (ใช้ Service Role Key เพื่อ Bypass RLS ในฝั่ง Server)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2. ดึงข้อมูล Submission และ Assignment (เฉลย)
    const { data: submission, error: subError } = await supabase
      .from('submissions')
      .select('*, assignments(answer_key, grading_config)')
      .eq('id', submission_id)
      .single();

    if (subError || !submission) throw new Error('Submission not found');

    const answerKey = submission.assignments.answer_key;
    const imageUrl = submission.image_url;

    // ------------------------------------------------------------------
    // 3. [THE EYES] เรียกใช้ Google Cloud Vision API (OCR)
    // ------------------------------------------------------------------
    console.log(`[System] กำลังส่งภาพไปสกัดข้อความด้วย Google Vision OCR...`);
    // *หมายเหตุ: ในการใช้งานจริงคุณต้องใส่ Google API Key
    // const ocrResult = await callGoogleVisionAPI(imageUrl);
    const mockOcrText = "1. 196000 บาท 2. ร้าน A 3. ตาราง ม.ค. 50000 1470 ..."; // สมมติผลลัพธ์ OCR

    // ------------------------------------------------------------------
    // 4. [THE BRAIN] เรียกใช้ Gemini 1.5 Pro เพื่อวิเคราะห์และตรวจเทียบเฉลย
    // ------------------------------------------------------------------
    console.log(`[System] กำลังให้ AI ประเมินคำตอบเทียบกับ Master Key...`);
    
    /* Prompt Engineering ระดับ CTO: 
      สั่งให้ AI คืนค่ากลับมาเป็น JSON Array ที่ตรงกับตารางฐานข้อมูลของเราเป๊ะๆ 
      และต้องบังคับให้ประเมิน confidence_score ทุกข้อ
    */
    const systemPrompt = `
      คุณคือระบบตรวจข้อสอบอัตโนมัติ นำข้อความ OCR นี้ไปเทียบกับ Answer Key
      และตอบกลับมาเป็น JSON Array เท่านั้น รูปแบบ:
      [
        {
          "item_no": "1",
          "extracted_value": "196000",
          "is_correct": true,
          "score_awarded": 2.0,
          "confidence_score": 0.95,
          "reason": "ตัวเลขตรงกับเฉลยเป๊ะ"
        }
      ]
    `;
    
    // *หมายเหตุ: โค้ดเรียก Gemini API (ใช้ @google/genai หรือ fetch ตรง)
    // const aiGradingResult = await callGeminiAPI(systemPrompt, mockOcrText, answerKey);
    
    // สมมติผลลัพธ์จาก AI (Mock Data เพื่อให้เห็นภาพการทำงาน)
    const aiGradingResult = [
      { item_no: "1", extracted_value: "196000", is_correct: true, score_awarded: 2.0, confidence_score: 0.98, reason: "ตรงกับเฉลย" },
      { item_no: "2", extracted_value: "ร้าน A", is_correct: true, score_awarded: 1.0, confidence_score: 0.90, reason: "พบ Keyword" },
      // จำลองเคสที่ AI อ่านลายมือไม่ออก หรือไม่มั่นใจ
      { item_no: "3", extracted_value: "70000", is_correct: false, score_awarded: 0.0, confidence_score: 0.65, reason: "ลายมืออ่านยาก คล้ายเลข 1 หรือ 7" }
    ];

    // ------------------------------------------------------------------
    // 5. [THE JUDGE] บันทึกลงฐานข้อมูล + ตัดสินใจ (Deterministic Logic)
    // ------------------------------------------------------------------
    let requiresHumanReview = false;
    let totalScore = 0;

    const gradingRecords = aiGradingResult.map((item) => {
      // ตรรกะตรวจจับความเสี่ยง (Guardrail)
      const isFlagged = item.confidence_score < CONFIDENCE_THRESHOLD;
      if (isFlagged) requiresHumanReview = true;

      totalScore += item.score_awarded;

      return {
        submission_id: submission_id,
        item_no: item.item_no,
        ocr_extracted_text: item.extracted_value, // เก็บค่าดิบไว้ตรวจสอบ
        score_awarded: item.score_awarded,
        max_points: 2.0, // ดึงจาก answer key ตัวจริง
        ai_confidence_score: item.confidence_score,
        feedback_text: item.reason,
        is_flagged_for_review: isFlagged,
        method: 'ai_auto'
      };
    });

    // A. บันทึกผลรายข้อลง `grading_results`
    const { error: insertError } = await supabase
      .from('grading_results')
      .insert(gradingRecords);

    if (insertError) throw insertError;

    // B. อัปเดตสถานะแผ่นข้อสอบใน `submissions`
    const finalStatus = requiresHumanReview ? 'needs_review' : 'graded';
    
    await supabase
      .from('submissions')
      .update({
        total_score: totalScore,
        status: finalStatus,
        graded_at: new Date().toISOString()
      })
      .eq('id', submission_id);

    // ------------------------------------------------------------------
    // 6. ส่งผลลัพธ์กลับไปยังหน้าจอ
    // ------------------------------------------------------------------
    return NextResponse.json({
      success: true,
      message: `Grading complete. Status: ${finalStatus}`,
      total_score: totalScore,
      requires_human_review: requiresHumanReview,
      items_flagged: gradingRecords.filter(r => r.is_flagged_for_review).length
    });

  } catch (error: any) {
    console.error('[Grading API Error]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}