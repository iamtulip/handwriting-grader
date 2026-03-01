//(หน้าจอหลักที่ทำหน้าที่เป็น "Risk Queue" เพื่อให้อาจารย์รู้ว่าควรเริ่มตรวจที่จุดไหนก่อน)
//apps/web/components/grading/SubmissionHeatmap.tsx
//(เน้นการลด Enumeration, ป้องกัน Request Race, และจัดการ Error อย่างเป็นระบบ)//
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export const SubmissionHeatmap = ({ assignmentId }: { assignmentId: string }) => {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!assignmentId) return;
    const ac = new AbortController();

    const fetchSubmissions = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const qs = new URLSearchParams({
          assignmentId,
          limit: '100', // Pagination Guard
          cursor: ''
        });

        const res = await fetch(`/api/reviewer/submissions?${qs.toString()}`, {
          method: 'GET',
          signal: ac.signal,
          credentials: 'include', // Session Handling
          cache: 'no-store',
          headers: {
            'Accept': 'application/json',
          },
        });

        if (!res.ok) {
          const t = await res.text().catch(() => '');
          throw new Error(t || `Request failed (${res.status})`);
        }

        const data = await res.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        setSubmissions(items);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        setErrorMsg(e?.message || 'โหลดข้อมูลไม่สำเร็จ');
        setSubmissions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSubmissions();
    return () => ac.abort(); // Prevent Stale UI
  }, [assignmentId]);

  const maskStudent = (v: string) => {
    if (!v) return '-';
    const s = String(v);
    // Anti-Enumeration: Show only last 4 chars
    return s.length <= 4 ? '****' : `${'*'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
  };

  if (loading) return <div className="p-8 text-center animate-pulse text-gray-500">กำลังโหลดข้อมูลความเสี่ยง...</div>;

  if (errorMsg) {
    return (
      <div className="p-8 text-center bg-red-50 rounded-xl border border-red-100">
        <div className="text-red-600 font-bold">เกิดข้อผิดพลาดในการโหลด</div>
        <div className="text-sm text-gray-600 mt-2 break-words">{errorMsg}</div>
        <button 
          className="mt-4 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-black transition"
          onClick={() => router.replace(router.asPath)}
        >
          ลองใหม่
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
      <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <h2 className="text-xl font-bold text-gray-800">Monitoring Dashboard (Risk Queue)</h2>
        <div className="flex gap-4 text-sm font-medium">
          <span className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500 rounded" /> วิกฤต (Conf &lt; 0.9)</span>
          <span className="flex items-center gap-1"><div className="w-3 h-3 bg-yellow-400 rounded" /> ต้องตรวจสอบ</span>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wider">
            <tr>
              <th className="p-4">รหัสนักศึกษา (Masked)</th>
              <th className="p-4">สถานะ</th>
              <th className="p-4 text-center">ความมั่นใจ AI</th>
              <th className="p-4 text-center">ความเสี่ยง</th>
              <th className="p-4">การดำเนินการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {submissions.map((sub: any) => (
              <tr key={sub.id} className="hover:bg-blue-50 transition-colors">
                <td className="p-4 font-mono text-sm">{maskStudent(sub.student_id)}</td>
                <td className="p-4 text-sm">
                  <span className={`px-2 py-1 rounded-full font-bold ${
                    sub.status === 'needs_review' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {sub.status}
                  </span>
                </td>
                <td className="p-4 text-center font-bold">
                  <div className={sub.risk.avg_confidence < 0.9 ? 'text-red-500' : 'text-gray-700'}>
                    {(sub.risk.avg_confidence * 100).toFixed(1)}%
                  </div>
                </td>
                <td className="p-4 text-center">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-black ${
                    sub.risk.needs_review_rois > 0 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {sub.risk.needs_review_rois} ROIs
                  </span>
                </td>
                <td className="p-4">
                  <button 
                    onClick={() => {
                      const id = String(sub.id || '');
                      if (!/^[0-9a-f-]{36}$/i.test(id)) return; // IDOR Sane Check
                      router.push(`/reviewer/audit/${id}`);
                    }}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-md transition-all active:scale-95"
                  >
                    เปิด Audit View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};