'use client';

import React, { useState } from 'react';

// ==========================================
// 1. MOCK DATA (จำลองข้อมูลที่ดึงมาจาก Supabase Phase 2)
// ==========================================
const mockSubmission = {
  id: "sub_12345",
  student_id: "6610110xxx",
  status: "needs_review",
  image_url: "/mock-exam-paper.jpg", // ในระบบจริงคือ URL จาก GCS/Supabase Storage
  total_score: 2.0,
  max_score: 5.0,
};

const mockGradingResults = [
  {
    id: "res_1",
    item_no: "1",
    task: "อ๊ะอายชำระเงินดาวน์ไปกี่บาท",
    ocr_extracted_text: "196,000",
    score_awarded: 2.0,
    max_points: 2.0,
    ai_confidence_score: 0.98,
    is_flagged_for_review: false,
    feedback_text: "ตัวเลขตรงกับเฉลย",
  },
  {
    id: "res_2",
    item_no: "2",
    task: "จงหาเงินต้นของหนี้เริ่มแรก",
    ocr_extracted_text: "294,000",
    score_awarded: 1.0,
    max_points: 2.0,
    ai_confidence_score: 0.82, // < 0.85 (เข้าข่ายสีแดง)
    is_flagged_for_review: true,
    feedback_text: "AI ไม่แน่ใจลายมือ อาจเป็น 294,000 หรือ 244,000 (ลบด้วยลิควิด)",
  },
  {
    id: "res_3",
    item_no: "3.1",
    task: "ตารางผ่อนชำระ (เดือน ม.ค.) - ดอกเบี้ย",
    ocr_extracted_text: "อ่านไม่ออก",
    score_awarded: 0.0,
    max_points: 1.0,
    ai_confidence_score: 0.45, // สีแดงเข้ม
    is_flagged_for_review: true,
    feedback_text: "ลายมือเบลอมาก ไม่สามารถสกัดตัวเลขได้ กรุณาตรวจสอบด้วยตนเอง",
  }
];

// ==========================================
// 2. MAIN COMPONENT
// ==========================================
export default function ReviewerDashboard() {
  const [results, setResults] = useState(mockGradingResults);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ฟังก์ชันอัปเดตคะแนนเมื่ออาจารย์แก้ (Manual Override)
  const handleScoreChange = (id: string, newScore: string) => {
    const numericScore = parseFloat(newScore);
    if (isNaN(numericScore)) return;

    setResults(prev => prev.map(res => 
      res.id === id 
        ? { ...res, score_awarded: numericScore, is_flagged_for_review: false, feedback_text: "แก้ไขโดยอาจารย์ (Manual Override)" }
        : res
    ));
  };

  // ฟังก์ชันกดยืนยันเพื่อบันทึกลง Database
  const handleApprove = async () => {
    setIsSubmitting(true);
    // TODO: ส่งข้อมูล results กลับไปอัปเดตที่ตาราง grading_results ใน Supabase
    // TODO: อัปเดต submissions.status เป็น 'graded'
    setTimeout(() => {
      alert("✅ อนุมัติคะแนนเรียบร้อย ระบบบันทึก Audit Log แล้ว! (กำลังโหลดข้อสอบแผ่นถัดไป...)");
      setIsSubmitting(false);
    }, 1000);
  };

  // ฟังก์ชันคำนวณสีกรอบ (Heatmap Logic)
  const getBorderColor = (confidence: number) => {
    if (confidence >= 0.95) return 'border-l-4 border-l-green-500 bg-white';
    if (confidence >= 0.85) return 'border-l-4 border-l-yellow-400 bg-yellow-50/30';
    return 'border-l-4 border-l-red-500 bg-red-50/50'; // < 0.85
  };

  const getBadge = (confidence: number) => {
    if (confidence >= 0.95) return <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded font-bold">🟢 AI มั่นใจ 95%+</span>;
    if (confidence >= 0.85) return <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-1 rounded font-bold">🟡 รอตรวจสอบ (85%+)</span>;
    return <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded font-bold">🔴 ความเสี่ยงสูง ({Math.round(confidence * 100)}%)</span>;
  };

  const currentTotal = results.reduce((sum, r) => sum + r.score_awarded, 0);

  return (
    <div className="flex h-screen w-full bg-slate-100 text-slate-800 font-sans overflow-hidden">
      
      {/* 📌 PANE ซ้าย: แสดงภาพข้อสอบต้นฉบับ */}
      <div className="w-1/2 h-full border-r border-slate-300 flex flex-col relative shadow-inner">
        <div className="p-4 bg-slate-800 text-white flex justify-between items-center shadow-md z-10">
          <div>
            <h2 className="text-lg font-bold">📄 ต้นฉบับกระดาษคำตอบ</h2>
            <p className="text-xs text-slate-300">รหัสนักศึกษา: {mockSubmission.student_id}</p>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded border border-slate-500 text-sm transition">🔍 ซูมเข้า (Zoom In)</button>
          </div>
        </div>
        <div className="flex-1 p-6 overflow-auto flex justify-center items-start bg-slate-200">
          <div className="w-full max-w-2xl bg-white shadow-xl aspect-[1/1.4] rounded flex items-center justify-center text-slate-400 border border-slate-300 relative">
             [ พื้นที่แสดงรูปภาพจาก Supabase Storage ]
             {/* ตัวอย่าง Bounding Box สมมติ */}
             <div className="absolute top-[20%] left-[30%] w-[40%] h-[10%] border-2 border-red-500 bg-red-500/10 rounded flex items-start justify-end p-1">
                <span className="bg-red-500 text-white text-[10px] px-1 rounded">โฟกัสข้อ 2</span>
             </div>
          </div>
        </div>
      </div>

      {/* 📌 PANE ขวา: Reviewer Queue & Heatmap */}
      <div className="w-1/2 h-full flex flex-col bg-slate-50">
        
        {/* Header แผงควบคุมขวา */}
        <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm z-10">
          <div>
            <h1 className="text-xl font-bold text-slate-800">✅ ระบบตรวจทาน (Review Queue)</h1>
            <p className="text-sm text-slate-500 mt-1">
              ตรวจสอบคะแนนที่ AI ประเมินไว้ (แก้เฉพาะข้อที่มีไฮไลท์สีแดง)
            </p>
          </div>
          <div className="text-right">
             <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">คะแนนรวมสุทธิ</div>
             <div className="text-3xl font-extrabold text-blue-600">{currentTotal.toFixed(1)} <span className="text-lg text-slate-400">/ {mockSubmission.max_score}</span></div>
          </div>
        </div>

        {/* พื้นที่รายการข้อสอบ (Heatmap Item List) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          
          {results.map((item) => (
            <div key={item.id} className={`p-4 rounded-lg shadow-sm border ${getBorderColor(item.ai_confidence_score)} transition-all`}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="bg-slate-800 text-white text-xs px-2 py-1 rounded font-bold">ข้อ {item.item_no}</span>
                    {getBadge(item.ai_confidence_score)}
                  </div>
                  <h3 className="text-sm font-semibold text-slate-700">{item.task}</h3>
                </div>
                
                {/* ช่องกรอกคะแนน (Manual Override) */}
                <div className="text-right">
                  <label className="text-xs text-slate-500 block mb-1 font-medium">คะแนนที่ได้ (เต็ม {item.max_points})</label>
                  <input 
                    type="number" 
                    step="0.5"
                    max={item.max_points}
                    min={0}
                    value={item.score_awarded}
                    onChange={(e) => handleScoreChange(item.id, e.target.value)}
                    className={`w-20 text-center font-bold text-lg rounded-md border p-1 focus:ring-2 focus:outline-none ${
                      item.is_flagged_for_review ? 'border-red-400 bg-red-50 focus:ring-red-400 text-red-700' : 'border-slate-300 text-slate-800 focus:ring-blue-500'
                    }`} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm bg-white p-3 rounded border border-slate-100 shadow-inner">
                <div>
                  <span className="text-slate-500 block text-xs">สิ่งที่ AI อ่านได้ (OCR Extracted):</span>
                  <span className="font-mono text-slate-800 font-semibold">{item.ocr_extracted_text || "-"}</span>
                </div>
                <div>
                   <span className="text-slate-500 block text-xs">เหตุผลจาก AI (AI Feedback):</span>
                   <span className="text-slate-600 italic text-xs">{item.feedback_text}</span>
                </div>
              </div>
            </div>
          ))}

        </div>

        {/* Footer แถบคำสั่งยืนยัน (Next Action) */}
        <div className="p-4 border-t border-slate-200 bg-white flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
          <div className="text-sm text-slate-500 font-medium">
             เหลือข้อสอบที่ต้องตรวจ: <span className="font-bold text-slate-800">14 แผ่น</span>
          </div>
          <div className="flex gap-3">
            <button className="px-5 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 font-medium transition">
              ⏭️ ข้ามไปก่อน (Skip)
            </button>
            <button 
              onClick={handleApprove}
              disabled={isSubmitting}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-bold shadow-sm transition disabled:bg-slate-400 flex items-center gap-2">
              {isSubmitting ? 'กำลังบันทึก...' : '🔒 ยืนยันคะแนนแผ่นนี้ (Approve & Next)'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}