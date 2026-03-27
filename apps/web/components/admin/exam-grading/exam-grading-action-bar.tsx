type Props = {
  submissionId: string
}

export function ExamGradingActionBar({ submissionId }: Props) {
  return (
    <div className="flex flex-wrap gap-3 rounded-2xl border bg-white p-4 shadow-sm">
      <button className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50">
        รีเฟรชผล
      </button>

      <button className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50">
        รัน OCR ใหม่
      </button>

      <a
        href={`/admin/submissions/${submissionId}`}
        className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
      >
        เปิดรายละเอียด submission เดิม
      </a>
    </div>
  )
}