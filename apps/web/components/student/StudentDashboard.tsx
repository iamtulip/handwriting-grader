// apps/web/components/student/StudentDashboard.tsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

type DashboardData = {
  profile: { full_name: string; student_id_number: string };
  section: { course_code: string; section_number: number; term: string };
  total_meta_score: number;
  timeline: Array<{
    id: string;
    title: string;
    assignment_type: string;
    week_number: number;
    close_at: string;
    submission: {
      id: string;
      status: string;
      submitted_at: string;
      fraud_flag: boolean;
      result: {
        final_score: number;
        final_meta_score: number;
        meta_score_attendance: number;
        meta_score_punctuality: number;
        meta_score_accuracy: number;
        is_blank: boolean;
      } | null;
    } | null;
  }>;
};

export const StudentDashboard = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await fetch('/api/student/dashboard', { credentials: 'include' });
        const result = await res.json();
        
        if (!res.ok) throw new Error(result.error || 'ดึงข้อมูลไม่สำเร็จ');
        setData(result);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  if (loading) return <div className="p-8 text-center font-bold text-gray-500">กำลังโหลดข้อมูล...</div>;
  if (error) return <div className="p-8 text-center font-bold text-red-600">❌ {error}</div>;
  if (!data) return null;

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Header Profile & Summary */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 rounded-2xl p-8 text-white shadow-lg flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black mb-2">{data.profile.full_name}</h1>
          <p className="text-blue-100 font-mono text-lg mb-1">รหัสนักศึกษา: {data.profile.student_id_number}</p>
          <p className="text-blue-200 text-sm">
            กลุ่มเรียน: {data.section.course_code} - Sec {data.section.section_number} ({data.section.term})
          </p>
        </div>
        <div className="bg-white/10 p-6 rounded-xl backdrop-blur-sm border border-white/20 text-center min-w-[150px]">
          <p className="text-sm font-bold text-blue-100 mb-1">คะแนนเก็บสะสม</p>
          <p className="text-5xl font-black text-white">{data.total_meta_score.toFixed(2)}</p>
        </div>
      </div>

      <h2 className="text-2xl font-black text-gray-800 mb-6">📝 แบบฝึกหัดรายสัปดาห์ (Weekly Timeline)</h2>

      {/* Timeline List */}
      <div className="space-y-6">
        {data.timeline.length === 0 && (
          <div className="bg-gray-50 p-8 rounded-xl text-center text-gray-500 border border-gray-200 font-bold">
            ยังไม่มีแบบฝึกหัดในกลุ่มเรียนนี้
          </div>
        )}

        {data.timeline.map((asm) => {
          const isGraded = asm.submission?.status === 'graded';
          const isPendingReview = asm.submission && !isGraded;
          const isMissing = !asm.submission;
          const res = asm.submission?.result;

          return (
            <div key={asm.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden transition hover:shadow-md">
              <div className="p-6 sm:flex sm:justify-between sm:items-center">
                
                {/* Assignment Info */}
                <div className="mb-4 sm:mb-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="bg-gray-100 text-gray-600 text-xs font-black px-3 py-1 rounded-full">
                      สัปดาห์ที่ {asm.week_number || '-'}
                    </span>
                    <h3 className="text-xl font-bold text-gray-800">{asm.title}</h3>
                  </div>
                  {isMissing && asm.close_at && (
                    <p className="text-sm text-red-500 font-bold mt-2">
                      ⏳ ปิดรับงาน: {new Date(asm.close_at).toLocaleString('th-TH')}
                    </p>
                  )}
                  {asm.submission && (
                    <p className="text-sm text-gray-500 mt-2">
                      ส่งเมื่อ: {new Date(asm.submission.submitted_at).toLocaleString('th-TH')}
                    </p>
                  )}
                </div>

                {/* Status & Actions */}
                <div className="flex flex-col items-end gap-3">
                  {/* Status Badges */}
                  {isMissing && <span className="px-4 py-2 bg-yellow-50 text-yellow-700 font-bold rounded-lg border border-yellow-200">รอดำเนินการ (Pending)</span>}
                  {isPendingReview && <span className="px-4 py-2 bg-blue-50 text-blue-700 font-bold rounded-lg border border-blue-200">🔍 รอตรวจคะแนน</span>}
                  {asm.submission?.fraud_flag && <span className="px-4 py-2 bg-red-100 text-red-700 font-bold rounded-lg border border-red-300">🚨 พบความผิดปกติ (ทุจริต)</span>}
                  
                  {isMissing && (
                    <button 
                      onClick={() => router.push(`/student/upload/${asm.id}`)}
                      className="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 transition shadow-sm"
                    >
                      ส่งแบบฝึกหัด
                    </button>
                  )}
                </div>
              </div>

              {/* Score Breakdown (ถ้าตรวจเสร็จแล้ว) */}
              {isGraded && res && asm.assignment_type === 'weekly_exercise' && (
                <div className="bg-green-50/50 border-t border-green-100 p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-green-800">สรุปคะแนน (Meta-Score)</h4>
                    <span className="text-2xl font-black text-green-700">{res.final_meta_score.toFixed(2)} / 5.0</span>
                  </div>
                  
                  {res.is_blank ? (
                    <div className="text-red-600 font-bold text-sm bg-red-50 p-3 rounded-lg">
                      คะแนนเป็น 0 เนื่องจากระบบตรวจพบกระดาษเปล่า
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-white p-4 rounded-lg border border-green-100 text-center">
                        <p className="text-xs font-bold text-gray-500 mb-1">การเข้าชั้นเรียน</p>
                        <p className="text-xl font-black text-gray-800">{res.meta_score_attendance.toFixed(2)}</p>
                      </div>
                      <div className="bg-white p-4 rounded-lg border border-green-100 text-center">
                        <p className="text-xs font-bold text-gray-500 mb-1">ความตรงต่อเวลา</p>
                        <p className="text-xl font-black text-gray-800">{res.meta_score_punctuality.toFixed(2)}</p>
                      </div>
                      <div className="bg-white p-4 rounded-lg border border-green-100 text-center">
                        <p className="text-xs font-bold text-gray-500 mb-1">ความถูกต้อง (เปอร์เซ็นต์)</p>
                        <p className="text-xl font-black text-gray-800">{res.meta_score_accuracy.toFixed(2)}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* คะแนนสอบ (ถ้าเป็น Quiz/Exam) */}
              {isGraded && res && asm.assignment_type !== 'weekly_exercise' && (
                <div className="bg-purple-50/50 border-t border-purple-100 p-6 flex justify-between items-center">
                  <h4 className="font-bold text-purple-800">คะแนนสอบ (Raw Score)</h4>
                  <span className="text-2xl font-black text-purple-700">{res.final_score.toFixed(2)}</span>
                </div>
              )}

            </div>
          );
        })}
      </div>
    </div>
  );
};