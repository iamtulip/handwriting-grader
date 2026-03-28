import Link from 'next/link'
import type { ExamSummaryRow } from '@/lib/admin/exam-grading-dashboard'
import { ExamStatusBadge } from '../shared/exam-status-badge'
import { SectionCard } from '../shared/section-card'

type Props = {
  exams: ExamSummaryRow[]
}

export function ExamListTable({ exams }: Props) {
  return (
    <SectionCard title="รายการชุดข้อสอบ">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-neutral-50 text-left text-neutral-600">
            <tr>
              <th className="px-4 py-3">ชื่อชุดข้อสอบ</th>
              <th className="px-4 py-3">รหัสวิชา</th>
              <th className="px-4 py-3">ข้อ</th>
              <th className="px-4 py-3">หน้า</th>
              <th className="px-4 py-3">ผู้เข้าสอบ</th>
              <th className="px-4 py-3">ประมวลผลแล้ว</th>
              <th className="px-4 py-3">สถานะ</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {exams.map((exam) => (
              <tr key={exam.id} className="border-b last:border-b-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-neutral-900">{exam.title}</div>
                  <div className="text-xs text-neutral-500">
                    {exam.termLabel} · {exam.updatedAt}
                  </div>
                </td>
                <td className="px-4 py-3">{exam.courseCode}</td>
                <td className="px-4 py-3">{exam.totalItems}</td>
                <td className="px-4 py-3">{exam.totalPages}</td>
                <td className="px-4 py-3">{exam.totalStudents}</td>
                <td className="px-4 py-3">{exam.processedCount}</td>
                <td className="px-4 py-3">
                  <ExamStatusBadge status={exam.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/admin/exam-grading/exams/${exam.id}`}
                      className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-neutral-50"
                    >
                      Overview
                    </Link>
                    <Link
                      href={`/admin/exam-grading/exams/${exam.id}/layout`}
                      className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-neutral-50"
                    >
                      Layout
                    </Link>
                    <Link
                      href={`/admin/exam-grading/exams/${exam.id}/results`}
                      className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-neutral-50"
                    >
                      Results
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}