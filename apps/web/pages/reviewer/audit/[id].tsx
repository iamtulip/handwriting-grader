import { useRouter } from 'next/router';
import { SubmissionHeatmap } from '@/components/grading/SubmissionHeatmap';
import { AuditWorkspace } from '@/components/grading/AuditWorkspace';

export default function AuditPage() {
  const router = useRouter();

  // Normalize router.query (string | string[] | undefined)
  const getParam = (v: any) => Array.isArray(v) ? v[0] : v;

  const id = getParam(router.query.id);      // submissionId
  const roiId = getParam(router.query.roiId);
  const p = getParam(router.query.p);
  const assignmentId = getParam(router.query.assignmentId);

  // Validation & Normalization
  const safeId = id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  const safeRoiId = roiId && /^[0-9a-f-]{36}$/i.test(roiId) ? roiId : null;
  const pageNumber = Math.max(1, Math.min(50, Number(p) || 1));

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <header className="mb-8 flex justify-between items-center">
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">DIAMOND V2: AUDIT TERMINAL</h1>
        <button onClick={() => router.back()} className="text-sm font-bold text-gray-500 hover:text-black">← Back</button>
      </header>

      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 xl:col-span-4">
          <SubmissionHeatmap assignmentId={String(assignmentId || '')} />
        </div>

        <div className="col-span-12 xl:col-span-8">
          {router.isReady && safeId && safeRoiId ? (
            <AuditWorkspace 
              submissionId={safeId} 
              roiId={safeRoiId} 
              pageNumber={pageNumber} 
            />
          ) : (
            <div className="bg-white rounded-xl p-20 text-center border-2 border-dashed border-gray-300">
              <div className="text-4xl mb-4 text-gray-300">🔍</div>
              <p className="text-gray-500 font-bold">กรุณาเลือกข้อที่ต้องการตรวจสอบจาก Heatmap</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}