import Link from 'next/link'

export function DashboardQuickActions() {
  const actions = [
    {
      href: '/admin/exam-grading/exams/new',
      label: 'สร้างชุดข้อสอบใหม่',
    },
    {
      href: '/admin/exam-grading/exams',
      label: 'เปิดรายการชุดข้อสอบ',
    },
    {
      href: '/admin/exam-grading/exams/exam-midterm-math1',
      label: 'เปิด exam ตัวอย่าง',
    },
  ]

  return (
    <div className="flex flex-wrap gap-3">
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="rounded-xl border px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
        >
          {action.label}
        </Link>
      ))}
    </div>
  )
}