// apps/web/app/student/upload/page.tsx
import UploadForm from './_components/UploadForm';

export default function StudentUploadPage() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-6 font-sans text-slate-800">
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-800 p-6 text-white text-center sm:text-left">
          <h1 className="text-2xl font-bold tracking-wide">📤 AI Exam Submission</h1>
          <p className="text-slate-300 text-sm mt-1">อัปโหลดกระดาษคำตอบวิชา Smart Math</p>
        </div>
        <div className="p-6 sm:p-8">
          <UploadForm />
        </div>
      </div>
    </div>
  );
}