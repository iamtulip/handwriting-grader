import type { ExamOverviewData } from '@/lib/admin/exam-grading-dashboard'
import { SectionCard } from '../shared/section-card'

export function ExamProgressChecklist({
  progress,
}: {
  progress: ExamOverviewData['progress']
}) {
  return (
    <SectionCard
      title="Progress"
      description="เช็กลำดับการเตรียม exam สำหรับระบบตรวจข้อสอบ"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {progress.map((step) => (
          <div
            key={step.key}
            className={`rounded-xl border p-4 ${
              step.done
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-neutral-200 bg-neutral-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  step.done ? 'bg-emerald-500' : 'bg-neutral-300'
                }`}
              />
              <span className="font-medium text-neutral-900">{step.label}</span>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}