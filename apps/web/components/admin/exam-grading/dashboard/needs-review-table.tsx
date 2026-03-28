import Link from 'next/link'
import type { NeedsReviewRow } from '@/lib/admin/exam-grading-dashboard'
import { SectionCard } from '../shared/section-card'

type Props = {
  items: NeedsReviewRow[]
}

export function NeedsReviewTable({ items }: Props) {
  return (
    <SectionCard
      title="งานล่าสุดที่ต้อง review"
      description="รายการกระดาษคำตอบที่ confidence ต่ำหรือระบบต้องการการตรวจซ้ำ"
    >
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-neutral-50 text-left text-neutral-600">
            <tr>
              <th className="px-4 py-3">Student ID</th>
              <th className="px-4 py-3">ชื่อ</th>
              <th className="px-4 py-3">Exam</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Avg. Conf.</th>
              <th className="px-4 py-3">Decision</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.submissionId} className="border-b last:border-b-0">
                <td className="px-4 py-3 text-neutral-700">{item.studentId}</td>
                <td className="px-4 py-3 text-neutral-700">{item.studentName}</td>
                <td className="px-4 py-3 text-neutral-700">{item.examTitle}</td>
                <td className="px-4 py-3 text-neutral-700">{item.scoreLabel}</td>
                <td className="px-4 py-3 text-neutral-700">
                  {item.avgConfidence.toFixed(2)}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                    {item.decision}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/exam-grading/submissions/${item.submissionId}`}
                    className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-neutral-50"
                  >
                    เปิดตรวจ
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}