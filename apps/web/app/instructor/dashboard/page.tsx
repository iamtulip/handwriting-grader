//apps/web/app/instructor/dashboard/page.tsx
import Link from 'next/link'
import { cookies } from 'next/headers'

async function getDashboardData() {
  const cookieStore = await cookies()

  const res = await fetch('http://localhost:3000/api/instructor/dashboard', {
    cache: 'no-store',
    headers: {
      Cookie: cookieStore.toString(),
      Accept: 'application/json',
    },
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || 'Failed to load dashboard')
  }

  return data
}

export default async function InstructorDashboardPage() {
  const data = await getDashboardData()
  const stats = data.stats ?? {}
  const recentAssignments = data.recent_assignments ?? []

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">
            Instructor Dashboard
          </h1>
          <p className="text-slate-600 mt-2 text-lg">
            ยินดีต้อนรับ {data.profile?.full_name ?? 'Instructor'}
          </p>
          <div className="text-sm text-slate-500 mt-2">
            Role: {data.profile?.role ?? '-'}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/instructor/assignments/new"
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700"
          >
            + สร้าง Assignment
          </Link>

          <Link
            href="/instructor/assignments"
            className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
          >
            ดู Assignments ทั้งหมด
          </Link>

          <Link
            href="/instructor/sections"
            className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
          >
            ดู Sections
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Sections" value={String(stats.section_count ?? 0)} />
        <StatCard title="Assignments" value={String(stats.assignment_count ?? 0)} />
        <StatCard title="Source PDFs" value={String(stats.source_pdf_count ?? 0)} />
        <StatCard
          title="Needs Review"
          value={String(stats.needs_review_submission_count ?? 0)}
          valueClassName="text-red-600"
        />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Approved Answer Keys"
          value={String(stats.answer_key_approved_count ?? 0)}
          valueClassName="text-emerald-600"
        />
        <StatCard
          title="Approved Layouts"
          value={String(stats.layout_approved_count ?? 0)}
          valueClassName="text-indigo-600"
        />
        <StatCard
          title="Open Appeals"
          value={String(stats.open_appeal_count ?? 0)}
          valueClassName="text-amber-600"
        />
        <StatCard
          title="Active Assignments"
          value={String(stats.active_assignment_count ?? 0)}
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <QuickLinksCard />

        <ProgressCard
          title="Assignment Pipeline"
          items={[
            {
              label: 'Uploaded Source PDF',
              value: `${stats.source_pdf_count ?? 0}/${stats.assignment_count ?? 0}`,
            },
            {
              label: 'Approved Answer Key',
              value: `${stats.answer_key_approved_count ?? 0}/${stats.assignment_count ?? 0}`,
            },
            {
              label: 'Approved Layout',
              value: `${stats.layout_approved_count ?? 0}/${stats.assignment_count ?? 0}`,
            },
          ]}
        />

        <ProgressCard
          title="Review Queue"
          items={[
            {
              label: 'Needs Review',
              value: String(stats.needs_review_submission_count ?? 0),
            },
            {
              label: 'Open Appeals',
              value: String(stats.open_appeal_count ?? 0),
            },
          ]}
        />
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="font-bold text-slate-900 text-lg">Recent Assignments</div>
          <Link
            href="/instructor/assignments"
            className="text-sm font-semibold text-blue-700 hover:text-blue-800"
          >
            ดูทั้งหมด
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200 text-slate-500">
              <tr>
                <th className="text-left p-4 font-medium">Title</th>
                <th className="text-left p-4 font-medium">Section</th>
                <th className="text-left p-4 font-medium">Type</th>
                <th className="text-left p-4 font-medium">Week</th>
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-right p-4 font-medium">Submissions</th>
                <th className="text-right p-4 font-medium">Needs Review</th>
                <th className="text-right p-4 font-medium">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {recentAssignments.map((item: any) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="p-4">
                    <div className="font-bold text-slate-900">{item.title}</div>
                    <div className="text-xs text-slate-500 mt-1">{item.id}</div>
                  </td>

                  <td className="p-4 text-slate-600">
                    {item.course_code && item.section_number
                      ? `${item.course_code} - Sec ${item.section_number}`
                      : '-'}
                  </td>

                  <td className="p-4 text-slate-600">{item.assignment_type ?? '-'}</td>
                  <td className="p-4 text-slate-600">{item.week_number ?? '-'}</td>

                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      <StatusBadge
                        ok={item.has_source_pdf}
                        okText="PDF uploaded"
                        badText="No PDF"
                      />
                      <StatusBadge
                        ok={item.answer_key_approved}
                        okText="Answer key approved"
                        badText="Answer key pending"
                      />
                      <StatusBadge
                        ok={item.layout_approved}
                        okText="Layout approved"
                        badText="Layout pending"
                      />
                    </div>
                  </td>

                  <td className="p-4 text-right font-semibold text-slate-900">
                    {item.submission_count ?? 0}
                  </td>

                  <td className="p-4 text-right font-semibold text-red-600">
                    {item.needs_review_count ?? 0}
                  </td>

                  <td className="p-4">
                    <div className="flex justify-end gap-2 flex-wrap">
                      <Link
                        href={`/instructor/assignments/${item.id}`}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                      >
                        Workspace
                      </Link>
                      <Link
                        href={`/instructor/assignments/${item.id}/layout`}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
                      >
                        Layout
                      </Link>
                      <Link
                        href={`/instructor/assignments/${item.id}/answer-key`}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                      >
                        Answer Key
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}

              {recentAssignments.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-500">
                    ยังไม่มี assignment ในระบบ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function StatCard({
  title,
  value,
  valueClassName = 'text-slate-900',
}: {
  title: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="text-sm text-slate-500 font-medium">{title}</div>
      <div className={`text-3xl font-extrabold mt-2 ${valueClassName}`}>{value}</div>
    </div>
  )
}

function QuickLinksCard() {
  const links = [
    { href: '/instructor/assignments/new', label: 'Create Assignment' },
    { href: '/instructor/assignments', label: 'Manage Assignments' },
    { href: '/instructor/sections', label: 'Open Sections' },
  ]

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="font-bold text-slate-900 text-lg mb-4">Quick Links</div>
      <div className="space-y-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="block rounded-lg border border-slate-200 px-4 py-3 font-semibold text-slate-800 hover:bg-slate-50"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  )
}

function ProgressCard({
  title,
  items,
}: {
  title: string
  items: { label: string; value: string }[]
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="font-bold text-slate-900 text-lg mb-4">{title}</div>
      <div className="space-y-3">
        {items.map((item, idx) => (
          <div
            key={`${item.label}-${idx}`}
            className="flex items-center justify-between rounded-lg border border-slate-100 p-3"
          >
            <div className="text-slate-600 font-medium">{item.label}</div>
            <div className="text-slate-900 font-bold">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusBadge({
  ok,
  okText,
  badText,
}: {
  ok: boolean
  okText: string
  badText: string
}) {
  return ok ? (
    <span className="inline-flex w-fit px-2 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
      {okText}
    </span>
  ) : (
    <span className="inline-flex w-fit px-2 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">
      {badText}
    </span>
  )
}
