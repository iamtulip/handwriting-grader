import Link from 'next/link'
import type { ExamOverviewData } from '@/lib/admin/exam-grading-dashboard'
import { PageHeader } from '../shared/page-header'
import { ExamStatusBadge } from '../shared/exam-status-badge'

export function ExamOverviewHeader({ exam }: { exam: ExamOverviewData }) {
  return (
    <PageHeader
      title={exam.title}
      description={`${exam.courseCode} · ${exam.termLabel}${exam.description ? ` · ${exam.description}` : ''}`}
      actions={
        <>
          <div className="flex items-center">
            <ExamStatusBadge status={exam.status} />
          </div>

          <Link
            href={`/admin/exam-grading/exams/${exam.id}/layout`}
            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            เปิด ROI Layout
          </Link>

          <Link
            href={`/admin/exam-grading/exams/${exam.id}/answer-key`}
            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            เปิด Answer Key
          </Link>
        </>
      }
    />
  )
}