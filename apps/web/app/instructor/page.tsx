import Link from 'next/link'
import { cookies } from 'next/headers'

async function getOverview() {
  const cookieStore = await cookies()

  const res = await fetch('http://localhost:3000/api/instructor/overview', {
    cache: 'no-store',
    headers: {
      Cookie: cookieStore.toString(),
    },
  })

  if (!res.ok) {
    throw new Error('Failed to load instructor overview')
  }

  return res.json()
}

export default async function InstructorOverviewPage() {
  const data = await getOverview()
  const needsReviewCount = Number(data.stats?.needsReviewCount ?? 0)

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Instructor Overview</h1>
          <p className="text-slate-600 mt-2 text-lg">
            ยินดีต้อนรับ {data.profile?.full_name ?? 'Instructor'}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
  <Link
    href="/instructor/review"
    className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors"
  >
    Review Queue
  </Link>

          <Link
            href="/instructor/assignments"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
          >
            ดู Assignments
          </Link>

          <Link
            href="/instructor/sections"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-colors"
          >
            ดู Sections
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
  <Card title="จำนวนกลุ่มเรียน" value={String(data.stats.sectionCount ?? 0)} />
  <Card title="Assignments ล่าสุด" value={String(data.stats.assignmentCount ?? 0)} />
  <Card title="งานส่งวันนี้" value={String(data.stats.todaySubmissionCount ?? 0)} />

  <Link
    href="/instructor/review"
    className="block rounded-xl border border-red-200 bg-white p-5 shadow-sm hover:bg-red-50 hover:border-red-300 transition-colors"
  >
    <div className="text-sm text-slate-500 font-medium">รอตรวจ</div>
    <div className="text-3xl font-extrabold text-red-600 mt-2">
      {String(data.stats.needsReviewCount ?? 0)}
    </div>
    <div className="mt-3 text-sm font-semibold text-red-700">
      เปิดหน้าตรวจ →
    </div>
  </Link>
</section>
<section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card title="จำนวนกลุ่มเรียน" value={String(data.stats.sectionCount ?? 0)} />
        <Card title="Assignments ล่าสุด" value={String(data.stats.assignmentCount ?? 0)} />
        <Card title="งานส่งวันนี้" value={String(data.stats.todaySubmissionCount ?? 0)} />

        <Link
          href="/instructor/review"
          className="block rounded-xl border border-red-200 bg-white p-5 shadow-sm hover:bg-red-50 hover:border-red-300 transition-colors"
        >
          <div className="text-sm text-slate-500 font-medium">รอตรวจ</div>
          <div className="text-3xl font-extrabold text-red-600 mt-2">{needsReviewCount}</div>
          <div className="mt-3 text-sm font-semibold text-red-700">
            เปิด Review Queue →
          </div>
        </Link>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 bg-slate-50">
            <div className="font-bold text-slate-800 text-lg">Sections ที่ดูแล</div>
          </div>

          <div className="divide-y divide-slate-100">
            {(data.sections ?? []).map((s: any) => (
              <div key={s.section_id} className="p-5 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900">
                    {s.course_code} - Sec {s.section_number}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">Term: {s.term}</div>
                </div>

                <Link
                  href={`/instructor/sections`}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-700"
                >
                  เปิดดู
                </Link>
              </div>
            ))}

            {(!data.sections || data.sections.length === 0) && (
              <div className="p-8 text-center text-slate-500">ยังไม่มี sections ที่ผูกกับ instructor นี้</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="font-bold text-slate-800 text-lg">Assignments ล่าสุด</div>

            <Link
              href="/instructor/review"
              className="text-sm font-semibold text-red-600 hover:text-red-700"
            >
              ไปที่ Review Queue
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {(data.recentAssignments ?? []).map((a: any) => (
              <div key={a.assignment_id} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-bold text-slate-900">{a.title}</div>
                    <div className="text-sm text-slate-500 mt-1">
                      สัปดาห์ที่ {a.week_number ?? '-'} • submissions {a.submission_count ?? 0}
                    </div>
                  </div>

                  <div className="text-right text-sm space-y-2">
                    <div className="font-bold text-red-600">
                      needs review: {a.needs_review_count ?? 0}
                    </div>

                    {Number(a.needs_review_count ?? 0) > 0 && (
                      <Link
                        href={`/instructor/review`}
                        className="inline-flex rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                      >
                        Review
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {(!data.recentAssignments || data.recentAssignments.length === 0) && (
              <div className="p-8 text-center text-slate-500">ยังไม่มี assignments</div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="text-sm text-slate-500 font-medium">{title}</div>
      <div className="text-3xl font-extrabold text-slate-900 mt-2">{value}</div>
    </div>
  )
}