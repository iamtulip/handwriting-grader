import Link from 'next/link'
import { getExamListData } from '@/lib/admin/exam-grading-dashboard'
import { PageHeader } from '@/components/admin/exam-grading/shared/page-header'
import { ExamListFilters } from '@/components/admin/exam-grading/exams/exam-list-filters'
import { ExamListTable } from '@/components/admin/exam-grading/exams/exam-list-table'

export default async function ExamListPage() {
  const exams = await getExamListData()

  return (
    <div className="space-y-6">
      <PageHeader
        title="ชุดข้อสอบ"
        description="สร้างและจัดการ exam สำหรับระบบตรวจข้อสอบ"
        actions={
          <Link
            href="/admin/exam-grading/exams/new"
            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            สร้างชุดข้อสอบใหม่
          </Link>
        }
      />

      <ExamListFilters />
      <ExamListTable exams={exams} />
    </div>
  )
}