type Props = {
  submission: {
    id: string
    studentName: string
    studentCode: string
    assignmentTitle: string
    status: string
    currentStage: string | null
    submittedAt: string | null
  }
}

export function ExamGradingDetailHeader({ submission }: Props) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="space-y-2">
        <p className="text-sm text-neutral-500">ระบบตรวจข้อสอบ &gt; รายละเอียดการตรวจ</p>
        <h1 className="text-2xl font-bold text-neutral-900">{submission.assignmentTitle}</h1>

        <div className="grid gap-2 text-sm text-neutral-700 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <span className="font-medium">นักศึกษา:</span> {submission.studentName}
          </div>
          <div>
            <span className="font-medium">รหัส:</span> {submission.studentCode}
          </div>
          <div>
            <span className="font-medium">สถานะ:</span> {submission.status}
          </div>
          <div>
            <span className="font-medium">Stage:</span> {submission.currentStage ?? '-'}
          </div>
        </div>
      </div>
    </div>
  )
}