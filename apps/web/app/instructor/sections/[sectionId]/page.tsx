import Link from 'next/link'
import { cookies } from 'next/headers'

async function getSectionDetail(sectionId: string) {
  const cookieStore = await cookies()

  const res = await fetch(
    `http://localhost:3000/api/instructor/sections/${sectionId}`,
    {
      cache: 'no-store',
      headers: {
        Cookie: cookieStore.toString(),
      },
    }
  )

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || 'Failed to load section detail')
  }

  return data
}

export default async function InstructorSectionDetailPage({
  params,
}: {
  params: { sectionId: string }
}) {
  const data = await getSectionDetail(params.sectionId)

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">
            {data.section.course_code} - Sec {data.section.section_number}
          </h1>
          <p className="text-slate-600 mt-2 text-lg">
            ภาคการศึกษา {data.section.term}
          </p>
          <div className="text-sm text-slate-500 mt-3">
            เวลาเรียน: {data.section.start_time ?? '-'} ถึง {data.section.end_time ?? '-'}
          </div>
        </div>

        <div className="flex gap-3">
          <Link
            href="/instructor/sections"
            className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
          >
            กลับรายการกลุ่ม
          </Link>

          <Link
            href="/instructor/assignments/new"
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700"
          >
            + สร้าง Assignment
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Students" value={String(data.stats.student_count ?? 0)} />
        <StatCard title="Assignments" value={String(data.stats.assignment_count ?? 0)} />
        <StatCard title="Sessions" value={String(data.stats.session_count ?? 0)} />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 bg-slate-50">
            <div className="font-bold text-slate-900 text-lg">Students</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="text-left p-4 font-medium">Student ID</th>
                  <th className="text-left p-4 font-medium">Name</th>
                  <th className="text-left p-4 font-medium">Email</th>
                  <th className="text-left p-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data.students ?? []).map((s: any) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="p-4 font-mono text-slate-800">
                      {s.student_id_number ?? '-'}
                    </td>
                    <td className="p-4 font-semibold text-slate-900">
                      {s.full_name ?? '-'}
                    </td>
                    <td className="p-4 text-slate-600">{s.email ?? '-'}</td>
                    <td className="p-4">
                      <span className="px-2 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                        {s.registration_status ?? '-'}
                      </span>
                    </td>
                  </tr>
                ))}

                {(!data.students || data.students.length === 0) && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-500">
                      ยังไม่มีรายชื่อนักศึกษาใน section นี้
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 bg-slate-50">
            <div className="font-bold text-slate-900 text-lg">Attendance Summary</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="text-left p-4 font-medium">Date</th>
                  <th className="text-left p-4 font-medium">Start</th>
                  <th className="text-right p-4 font-medium">Check-ins</th>
                  <th className="text-right p-4 font-medium">On Time</th>
                  <th className="text-right p-4 font-medium">Late</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data.attendance ?? []).map((a: any) => (
                  <tr key={a.session_id} className="hover:bg-slate-50">
                    <td className="p-4 text-slate-800">{a.class_date ?? '-'}</td>
                    <td className="p-4 text-slate-600">
                      {formatDateTime(a.starts_at)}
                    </td>
                    <td className="p-4 text-right font-semibold text-slate-900">
                      {a.total_checkins ?? 0}
                    </td>
                    <td className="p-4 text-right font-semibold text-emerald-600">
                      {a.on_time_count ?? 0}
                    </td>
                    <td className="p-4 text-right font-semibold text-red-600">
                      {a.late_count ?? 0}
                    </td>
                  </tr>
                ))}

                {(!data.attendance || data.attendance.length === 0) && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">
                      ยังไม่มีข้อมูล attendance
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50">
          <div className="font-bold text-slate-900 text-lg">Assignments</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200 text-slate-500">
              <tr>
                <th className="text-left p-4 font-medium">Week</th>
                <th className="text-left p-4 font-medium">Title</th>
                <th className="text-left p-4 font-medium">Type</th>
                <th className="text-left p-4 font-medium">Class Date</th>
                <th className="text-right p-4 font-medium">Submissions</th>
                <th className="text-right p-4 font-medium">Graded</th>
                <th className="text-right p-4 font-medium">Needs Review</th>
                <th className="text-right p-4 font-medium">Avg Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data.assignments ?? []).map((a: any) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="p-4 text-slate-700">{a.week_number ?? '-'}</td>
                  <td className="p-4">
                    <Link
                      href={`/instructor/assignments/${a.id}`}
                      className="font-bold text-slate-900 hover:text-blue-700"
                    >
                      {a.title}
                    </Link>
                  </td>
                  <td className="p-4 text-slate-600">{a.assignment_type ?? '-'}</td>
                  <td className="p-4 text-slate-600">{a.class_date ?? '-'}</td>
                  <td className="p-4 text-right font-semibold text-slate-900">
                    {a.submission_count ?? 0}
                  </td>
                  <td className="p-4 text-right font-semibold text-emerald-600">
                    {a.graded_count ?? 0}
                  </td>
                  <td className="p-4 text-right font-semibold text-red-600">
                    {a.needs_review_count ?? 0}
                  </td>
                  <td className="p-4 text-right font-semibold text-blue-600">
                    {Number(a.avg_total_score ?? 0).toFixed(2)}
                  </td>
                </tr>
              ))}

              {(!data.assignments || data.assignments.length === 0) && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">
                    ยังไม่มี assignments ใน section นี้
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

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="text-sm text-slate-500 font-medium">{title}</div>
      <div className="text-3xl font-extrabold text-slate-900 mt-2">{value}</div>
    </div>
  )
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString('th-TH')
  } catch {
    return value
  }
}