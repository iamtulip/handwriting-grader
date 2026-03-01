'use client';

import React, { useState } from 'react';

// ==========================================
// 1. MOCK DATA (จำลองข้อมูลของนักศึกษา)
// ==========================================
const mockSubmission = {
  id: "sub_12345",
  assignment_title: "แบบฝึกหัดครั้งที่ 10 เรื่อง การผ่อนชำระสินค้าและบริการ ชุดที่ 1",
  student_id: "6610110xxx",
  student_name: "นายปัญญา ดีเยี่ยม",
  status: "graded", // 'graded' | 'appealed'
  image_url: "/mock-exam-paper.jpg", 
  total_score: 8.5,
  max_score: 10.0,
  graded_at: "2026-02-25T10:30:00Z",
};

const mockResults = [
  {
    item_no: "1",
    task: "อ๊ะอายชำระเงินดาวน์ไปกี่บาท",
    ocr_extracted_text: "196,000",
    score_awarded: 2.0,
    max_points: 2.0,
    feedback: "ถูกต้อง",
  },
  {
    item_no: "2",
    task: "จงหาเงินต้นของหนี้เริ่มแรก",
    ocr_extracted_text: "244,000", // สมมติว่า AI อ่านผิด (เด็กเขียน 294,000)
    score_awarded: 0.0,
    max_points: 2.0,
    feedback: "คำตอบไม่ถูกต้อง (คาดหวัง: 294,000)",
  },
];

// ==========================================
// 2. MAIN COMPONENT
// ==========================================
export default function StudentResultView() {
  const [submissionStatus, setSubmissionStatus] = useState(mockSubmission.status);
  const [isAppealModalOpen, setIsAppealModalOpen] = useState(false);
  const [appealReason, setAppealReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ฟังก์ชันส่งคำร้องขออุทธรณ์
  const handleAppealSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!appealReason.trim()) return alert("กรุณาระบุเหตุผลในการอุทธรณ์คะแนน");

    setIsSubmitting(true);
    
    // TODO: ยิง API ไปอัปเดตสถานะ submissions เป็น 'appealed' และเพิ่มข้อมูลลง audit_logs
    setTimeout(() => {
      setSubmissionStatus('appealed');
      setIsAppealModalOpen(false);
      setIsSubmitting(false);
      alert("✅ ส่งคำร้องขอตรวจสอบคะแนนใหม่เรียบร้อยแล้ว อาจารย์ผู้สอนจะได้รับการแจ้งเตือน");
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-10">
      
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{mockSubmission.assignment_title}</h1>
            <p className="text-sm text-slate-500 mt-1">
              {mockSubmission.student_id} - {mockSubmission.student_name}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">คะแนนของคุณ</div>
              <div className="text-3xl font-extrabold text-blue-600">
                {mockSubmission.total_score} <span className="text-lg text-slate-400">/ {mockSubmission.max_score}</span>
              </div>
            </div>
            {submissionStatus === 'graded' ? (
              <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-bold border border-green-200">
                ✅ ตรวจแล้ว
              </span>
            ) : (
              <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-sm font-bold border border-amber-200">
                ⏳ รอผลอุทธรณ์
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content Layout */}
      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">
        
        {/* PANE ซ้าย: ภาพกระดาษคำตอบ */}
        <div className="w-full lg:w-1/2 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-3 bg-slate-800 text-white text-sm font-semibold flex justify-between items-center">
            <span>📄 กระดาษคำตอบของคุณ</span>
            <button className="text-slate-300 hover:text-white transition">🔍 ซูมดูภาพ</button>
          </div>
          <div className="flex-1 bg-slate-200 p-4 flex justify-center items-start min-h-[500px]">
             {/* ภาพจำลองข้อสอบ */}
             <div className="w-full max-w-md bg-white shadow-md aspect-[1/1.4] rounded border border-slate-300 flex items-center justify-center text-slate-400">
                [ รูปภาพต้นฉบับ ]
             </div>
          </div>
        </div>

        {/* PANE ขวา: รายละเอียดคะแนน */}
        <div className="w-full lg:w-1/2 flex flex-col gap-4">
          
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4">📊 รายละเอียดการให้คะแนน</h2>
            
            <div className="space-y-4">
              {mockResults.map((res, index) => (
                <div key={index} className={`p-4 rounded-lg border ${res.score_awarded === res.max_points ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-semibold text-slate-700">ข้อ {res.item_no}: {res.task}</div>
                    <div className="font-bold text-lg whitespace-nowrap ml-4">
                      <span className={res.score_awarded === res.max_points ? 'text-green-600' : 'text-red-600'}>
                        {res.score_awarded}
                      </span> 
                      <span className="text-slate-400 text-sm"> / {res.max_points}</span>
                    </div>
                  </div>
                  <div className="text-sm bg-white p-2 rounded border border-slate-100 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <span className="text-slate-500 block text-xs">ระบบอ่านคำตอบคุณได้:</span>
                      <span className="font-mono text-slate-800">{res.ocr_extracted_text}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-xs">หมายเหตุจากระบบ:</span>
                      <span className="text-slate-600 italic">{res.feedback}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Appeal Action Box */}
          {submissionStatus === 'graded' && (
            <div className="bg-blue-50 p-5 rounded-xl border border-blue-200">
              <h3 className="font-bold text-blue-800 mb-2">สงสัยคะแนนของตนเอง?</h3>
              <p className="text-sm text-blue-600 mb-4">
                หากระบบอ่านลายมือของคุณผิดพลาด หรือคุณมีข้อโต้แย้งเกี่ยวกับการตรวจ คุณสามารถขอให้อาจารย์ตรวจสอบกระดาษคำตอบของคุณใหม่อีกครั้งได้
              </p>
              <button 
                onClick={() => setIsAppealModalOpen(true)}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded shadow transition">
                ✋ ขออุทธรณ์ตรวจสอบคะแนนใหม่
              </button>
            </div>
          )}

        </div>
      </div>

      {/* Appeal Modal (ปรากฏเมื่อกดปุ่มอุทธรณ์) */}
      {isAppealModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="p-4 bg-blue-600 text-white font-bold flex justify-between items-center">
              <span>📝 แบบฟอร์มขออุทธรณ์คะแนน</span>
              <button onClick={() => setIsAppealModalOpen(false)} className="text-white hover:text-blue-200">✕</button>
            </div>
            <form onSubmit={handleAppealSubmit} className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                กรุณาระบุข้อที่ต้องการให้อาจารย์ตรวจสอบใหม่ และอธิบายเหตุผลให้ชัดเจน (เช่น "ข้อ 2 หนูเขียนเลข 294,000 ค่ะ แต่ระบบอ่านเป็น 244,000")
              </p>
              <textarea 
                rows={4}
                required
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
                placeholder="พิมพ์เหตุผลของคุณที่นี่..."
                className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none mb-4 resize-none"
              ></textarea>
              <div className="flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsAppealModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-md font-medium transition">
                  ยกเลิก
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-bold transition disabled:bg-slate-400">
                  {isSubmitting ? 'กำลังส่งข้อมูล...' : 'ส่งคำร้อง'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}