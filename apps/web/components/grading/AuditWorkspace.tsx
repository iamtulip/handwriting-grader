//(หน้าจอ Audit View รายข้อที่ใช้ "Audit-First Layout" ตามที่คุณต้องการ พร้อมระบบป้องกัน Spec Drift)
//apps/web/components/grading/AuditWorkspace.tsx
import React, { useState, useEffect } from 'react';

export const AuditWorkspace = ({ submissionId, roiId, pageNumber }: any) => {
  const [bundle, setBundle] = useState<any>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [manualReason, setManualReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [clientNonce, setClientNonce] = useState<string>(() => 
    (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now())
  );

  const clampPct = (n: any) => {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.min(100, Math.max(0, x)); // Layout Thrash Protection
  };

  const safeText = (s: any, max = 120) => {
    const v = String(s ?? '');
    const stripped = v.replace(/[\u0000-\u001F\u007F\u200E\u200F\u202A-\u202E]/g, '');
    return stripped.length > max ? stripped.slice(0, max) + '…' : stripped;
  };

  const isSafeImageUrl = (u: any) => {
    try {
      const url = new URL(String(u), window.location.origin);
      return url.origin === window.location.origin; // Same-origin Policy
    } catch { return false; }
  };

  useEffect(() => {
    if (!submissionId || !roiId) return;
    const ac = new AbortController();
    fetchBundle(ac.signal);
    return () => ac.abort();
  }, [submissionId, roiId, pageNumber]);

  const fetchBundle = async (signal?: AbortSignal) => {
    setErrorMsg(null);
    try {
      const qs = new URLSearchParams({
        submissionId: String(submissionId),
        roiId: String(roiId),
        page: String(pageNumber ?? 1),
      });
      const res = await fetch(`/api/reviewer/roi-bundle?${qs.toString()}`, {
        method: 'GET',
        signal,
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setBundle(data);
      setSelectedCandidateId(data?.lattice?.selected_candidate_id ?? null);
      setManualReason(data?.grading_state?.manual_reason ?? '');
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setErrorMsg(e?.message || 'ดึงข้อมูลไม่สำเร็จ');
      setBundle(null);
    }
  };

  const handleAction = async (actionType: 'confirm' | 'override') => {
    if (!bundle || bundle?.context_lock?.spec_mismatch) return;
    if (actionType === 'override' && manualReason.trim().length < 3) {
      alert("กรุณาระบุเหตุผลในการแก้ไขคะแนน");
      return;
    }
    if (!selectedCandidateId) {
      alert("กรุณาเลือกตัวเลือกจาก AI ก่อน");
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch('/api/reviewer/override', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Client-Nonce': clientNonce, // Anti-Replay Guard
        },
        body: JSON.stringify({
          submission_id: submissionId,
          roi_id: roiId,
          page_number: pageNumber,
          layout_spec_version: bundle.context_lock.layout_spec_version,
          action_type: actionType,
          selected_candidate_id: selectedCandidateId,
          manual_reason: manualReason,
          client_nonce: clientNonce,
        })
      });

      if (!res.ok) throw new Error(await res.text());
      alert("บันทึกข้อมูลสำเร็จ");
      setClientNonce(crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
      fetchBundle(); 
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (errorMsg) return (
    <div className="p-10 text-center">
      <div className="text-red-600 font-bold mb-4">โหลด Audit Bundle ไม่สำเร็จ</div>
      <button onClick={() => fetchBundle()} className="bg-gray-800 text-white px-6 py-2 rounded-lg">ลองใหม่</button>
    </div>
  );

  if (!bundle) return <div className="p-10 text-center animate-pulse text-blue-600 font-bold">กำลังดึงข้อมูล...</div>;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {bundle.context_lock.spec_mismatch && (
        <div className="bg-red-600 text-white p-4 rounded-lg flex justify-between items-center animate-pulse shadow-xl">
          <span className="font-bold underline">⚠️ คำเตือน: เฉลย (Spec) เปลี่ยนระหว่างการตรวจ!</span>
          <button onClick={() => window.location.reload()} className="bg-white text-red-600 px-4 py-1 rounded font-bold">รีเฟรชตอนนี้</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left: Evidence with Protection */}
        <div className="bg-white p-4 rounded-xl shadow-md border border-gray-200">
          <h3 className="text-lg font-bold text-gray-700 mb-3 border-b pb-2">🖼️ หลักฐานรายข้อ (ROI)</h3>
          <div className="relative border-4 border-gray-100 rounded-lg overflow-hidden bg-gray-50">
            <img 
              src={isSafeImageUrl(bundle.evidence.roi_image_url) ? bundle.evidence.roi_image_url : ''} 
              className="w-full object-contain" 
              alt="ROI" 
              referrerPolicy="no-referrer"
            />
            {bundle.evidence.evidence_map?.visual_bbox && (
              <div 
                className="absolute border-4 border-yellow-400 bg-yellow-400/20 rounded shadow-sm"
                style={{
                  left: `${clampPct(bundle.evidence.evidence_map.visual_bbox[0])}%`,
                  top: `${clampPct(bundle.evidence.evidence_map.visual_bbox[1])}%`,
                  width: `${clampPct(bundle.evidence.evidence_map.visual_bbox[2])}%`,
                  height: `${clampPct(bundle.evidence.evidence_map.visual_bbox[3])}%`,
                }}
              />
            )}
          </div>
        </div>

        {/* Right: Lattice with Sanitize */}
        <div className="flex flex-col gap-6">
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
            <h3 className="text-lg font-bold text-gray-700 mb-4 border-b pb-2">📝 ตัวเลือกจาก AI</h3>
            <div className="space-y-3">
              {bundle.lattice.candidates.map((c: any) => (
                <label 
                  key={c.id} 
                  className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all ${
                    selectedCandidateId === c.id ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-100 hover:border-blue-200'
                  } ${bundle.context_lock.spec_mismatch ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  <input type="radio" name="candidate" className="w-5 h-5 mr-4 accent-blue-600" checked={selectedCandidateId === c.id} onChange={() => setSelectedCandidateId(c.id)} />
                  <div className="flex-1">
                    <div className="text-2xl font-mono font-black text-gray-800">{safeText(c.raw_text, 80)}</div>
                    <div className="text-xs text-gray-500 mt-1">Conf: {(Number(c.confidence_score) * 100).toFixed(1)}% • Norm: {safeText(c.normalized_value, 60)}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-gray-50 p-6 rounded-xl border-2 border-dashed border-gray-200">
            <textarea className="w-full p-3 border rounded-lg text-sm" placeholder="ระบุเหตุผลในการแก้ไข..." rows={3} value={manualReason} onChange={(e) => setManualReason(e.target.value)} />
            <div className="grid grid-cols-2 gap-4 mt-6">
              <button onClick={() => handleAction('confirm')} disabled={isProcessing || bundle.context_lock.spec_mismatch} className="bg-green-600 text-white py-3 rounded-xl font-bold disabled:opacity-50">ยืนยัน AI</button>
              <button onClick={() => handleAction('override')} disabled={isProcessing || !manualReason || bundle.context_lock.spec_mismatch} className="bg-blue-600 text-white py-3 rounded-xl font-bold disabled:opacity-50">OVERRIDE</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};