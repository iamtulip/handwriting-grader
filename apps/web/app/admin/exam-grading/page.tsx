import { getExamDashboardData } from '@/lib/admin/exam-grading-dashboard'
import { PageHeader } from '@/components/admin/exam-grading/shared/page-header'
import { DashboardQuickActions } from '@/components/admin/exam-grading/dashboard/dashboard-quick-actions'
import { DashboardOverviewCards } from '@/components/admin/exam-grading/dashboard/dashboard-overview-cards'
import { RecentExamTable } from '@/components/admin/exam-grading/dashboard/recent-exam-table'
import { NeedsReviewTable } from '@/components/admin/exam-grading/dashboard/needs-review-table'

export default async function ExamGradingDashboardPage() {
  const data = await getExamDashboardData()

  return (
    <div className="space-y-6">
      <PageHeader
        title="ระบบตรวจข้อสอบ"
        description="จัดการชุดข้อสอบ, ROI Layout, Answer Key, Uploads และผลตรวจข้อสอบอัตโนมัติ"
        actions={<DashboardQuickActions />}
      />

      <DashboardOverviewCards overview={data.overview} />
      <RecentExamTable exams={data.recentExams} />
      <NeedsReviewTable items={data.needsReviewItems} />
    </div>
  )
}