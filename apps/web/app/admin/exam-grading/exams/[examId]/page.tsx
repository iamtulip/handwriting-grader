import { notFound } from 'next/navigation'
import { getExamOverviewData } from '@/lib/admin/exam-grading-dashboard'
import { ExamOverviewHeader } from '@/components/admin/exam-grading/exams/exam-overview-header'
import { ExamProgressChecklist } from '@/components/admin/exam-grading/exams/exam-progress-checklist'
import { ExamOverviewStats } from '@/components/admin/exam-grading/exams/exam-overview-stats'
import { ExamOverviewQuickLinks } from '@/components/admin/exam-grading/exams/exam-overview-quick-links'

type PageProps = {
  params: Promise<{
    examId: string
  }>
}

export default async function ExamOverviewPage({ params }: PageProps) {
  const { examId } = await params
  const exam = await getExamOverviewData(examId)

  if (!exam) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <ExamOverviewHeader exam={exam} />
      <ExamOverviewStats exam={exam} />
      <ExamProgressChecklist progress={exam.progress} />
      <ExamOverviewQuickLinks examId={exam.id} />
    </div>
  )
}