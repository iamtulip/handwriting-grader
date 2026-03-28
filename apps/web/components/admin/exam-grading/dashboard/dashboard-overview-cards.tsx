import { StatCard } from '../shared/stat-card'

type Props = {
  overview: {
    totalExams: number
    readyForUpload: number
    processing: number
    needsReview: number
  }
}

export function DashboardOverviewCards({ overview }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard label="จำนวนชุดข้อสอบ" value={overview.totalExams} />
      <StatCard
        label="พร้อมอัปโหลด / พร้อมตรวจ"
        value={overview.readyForUpload}
        tone="emerald"
      />
      <StatCard label="กำลังประมวลผล" value={overview.processing} tone="amber" />
      <StatCard label="ต้อง review" value={overview.needsReview} tone="sky" />
    </div>
  )
}