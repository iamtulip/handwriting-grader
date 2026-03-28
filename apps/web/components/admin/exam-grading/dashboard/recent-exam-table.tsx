import Link from 'next/link'
import type { ExamSummaryRow } from '@/lib/admin/exam-grading-dashboard'
import { ExamStatusBadge } from '../shared/exam-status-badge'
import { SectionCard } from '../shared/section-card'

type Props = {
  exams: ExamSummaryRow[]
}

export function RecentExamTable({ exams }: Props) {
  return (
    <SectionCard
      title="ชุดข้อสอบล่าสุด"
      description="ภาพรวมของชุดข้อสอบที่กำลังจัดการในระบบ"
    >
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-neutral-50 text-left text-neutral-600">
            <tr>
              <th className="px-4 py-3">ชื่อชุดข้อสอบ</th>
              <th className="px-4 py-3">รหัสวิชา</th>
              <th className="px-4 py-3">ข้อ</th>
              <th className="px-4 py-3">หน้า</th>
              <th className="px-4 py-3">ผู้เข้าสอบ</th>
              <th className="px-4 py-3">สถานะ</th>
              <th className="px-4 py-3">อัปเดตล่าสุด</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {exams.map((exam) => (
              <tr key={exam.id} className="border-b last:border-b-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-neutral-900">{exam.title}</div>
                  <div className="text-xs text-neutral-500">{exam.termLabel}</div>
                </td>
                <td className="px-4 py-3 text-neutral-700">{exam.courseCode}</td>
                <td className="px-4 py-3 text-neutral-700">{exam.totalItems}</td>
                <td className="px-4 py-3 text-neutral-700">{exam.totalPages}</td>
                <td className="px-4 py-3 text-neutral-700">{exam.totalStudents}</td>
                <td className="px-4 py-3">
                  <ExamStatusBadge status={exam.status} />
                </td>
                <td className="px-4 py-3 text-neutral-700">{exam.updatedAt}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/exam-grading/exams/${exam.id}`}
                    className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-neutral-50"
                  >
                    เปิด
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