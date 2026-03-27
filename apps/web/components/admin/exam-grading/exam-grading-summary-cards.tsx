type Props = {
  summary: {
    totalItems: number
    readableItems: number
    autoGraded: number
    needsReview: number
    averageConfidence: number
    workloadReductionPercent: number
  }
}

function SummaryCard({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-neutral-900">{value}</p>
    </div>
  )
}

export function ExamGradingSummaryCards({ summary }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
      <SummaryCard label="ข้อทั้งหมด" value={summary.totalItems} />
      <SummaryCard label="อ่านได้" value={summary.readableItems} />
      <SummaryCard label="Auto graded" value={summary.autoGraded} />
      <SummaryCard label="Needs review" value={summary.needsReview} />
      <SummaryCard
        label="Avg. Confidence"
        value={summary.averageConfidence.toFixed(2)}
      />

      <div className="col-span-2 rounded-2xl border bg-emerald-50 p-5 shadow-sm xl:col-span-5">
        <p className="text-sm font-medium text-emerald-800">Impact Summary</p>
        <p className="mt-2 text-sm text-emerald-900">
          ระบบอ่านคำตอบได้ {summary.readableItems} จาก {summary.totalItems} ข้อ,
          ตรวจอัตโนมัติได้ {summary.autoGraded} ข้อ
          และลดภาระการตรวจด้วยมือได้ประมาณ {summary.workloadReductionPercent}%.
        </p>
      </div>
    </div>
  )
}