import { notFound } from 'next/navigation'
import { getExamGradingDetail } from '@/lib/admin/exam-grading'
import { ExamGradingDetailHeader } from '@/components/admin/exam-grading/exam-grading-detail-header'
import { ExamGradingSummaryCards } from '@/components/admin/exam-grading/exam-grading-summary-cards'
import { ExamGradingActionBar } from '@/components/admin/exam-grading/exam-grading-action-bar'
import { ExamPageViewer } from '@/components/admin/exam-grading/exam-page-viewer'
import { ExamItemList } from '@/components/admin/exam-grading/exam-item-list'

type PageProps = {
  params: Promise<{
    submissionId: string
  }>
}

export default async function ExamGradingDetailPage({ params }: PageProps) {
  const { submissionId } = await params
  const detail = await getExamGradingDetail(submissionId)

  if (!detail) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <ExamGradingDetailHeader submission={detail.submission} />
      <ExamGradingSummaryCards summary={detail.summary} />
      <ExamGradingActionBar submissionId={detail.submission.id} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <ExamPageViewer pages={detail.pages} items={detail.items} />
        </div>

        <div className="xl:col-span-7">
          <ExamItemList items={detail.items} />
        </div>
      </div>
    </div>
  )
}