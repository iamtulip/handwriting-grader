import type { ExamOverviewData } from '@/lib/admin/exam-grading-dashboard'
import { StatCard } from '../shared/stat-card'

export function ExamOverviewStats({ exam }: { exam: ExamOverviewData }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard label="จำนวนข้อ" value={exam.totalItems} />
      <StatCard label="จำนวนหน้า" value={exam.totalPages} />
      <StatCard label="ผู้เข้าสอบ" value={exam.totalStudents} tone="sky" />
      <StatCard
        label="ประมวลผลแล้ว"
        value={exam.processedCount}
        tone="amber"
      />
    </div>
  )
}