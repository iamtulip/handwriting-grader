import Link from 'next/link'
import { cookies } from 'next/headers'

async function getSections() {
  const cookieStore = await cookies()

  const res = await fetch('http://localhost:3000/api/instructor/sections', {
    cache: 'no-store',
    headers: {
      Cookie: cookieStore.toString(),
      Accept: 'application/json',
    },
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || 'Failed to load sections')
  }

  return data
}

export default async function InstructorSectionsPage() {
  const data = await getSections()
  const items = data.items ?? []

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Sections</h1>
          <p className="text-slate-600 mt-2 text-lg">
            กลุ่มเรียนที่คุณดูแลในระบบ
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/instructor"
            className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-colors"
          >
            กลับหน้า Dashboard
          </Link>

          <Link
            href="/instructor/assignments/new"
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors"
          >
            + สร้าง Assignment
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Sections" value={String(items.length)} />
        <StatCard
          title="Total Students"
          value={String(
            items.reduce(
              (sum: number, item: any) => sum + Number(item.student_count ?? 0),
              0
            )
          )}
        />
        <StatCard
          title="Total Assignments"
          value={String(
            items.reduce(
              (sum: number, item: any) => sum + Number(item.assignment_count ?? 0),
              0
            )
          )}
        />
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50">
          <div className="font-bold text-slate-900 text-lg">Section List</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200 text-slate-500">
              <tr>
                <th className="text-left p-4 font-medium">Course / Section</th>
                <th className="text-left p-4 font-medium">Term</th>
                <th className="text-left p-4 font-medium">Schedule</th>
                <th className="text-right p-4 font-medium">Students</th>
                <th className="text-right p-4 font-medium">Assignments</th>
                <th className="text-right p-4 font-medium">Sessions</th>
                <th className="text-right p-4 font-medium">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {items.map((item: any) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <Link
                      href={`/instructor/sections/${item.id}`}
                      className="font-bold text-slate-900 hover:text-blue-700 transition-colors"
                    >
                      {item.course_code} - Sec {item.section_number}
                    </Link>
                  </td>

                  <td className="p-4 text-slate-600">{item.term ?? '-'}</td>

                  <td className="p-4 text-slate-600">
                    {formatSchedule(item.schedule_day, item.start_time, item.end_time)}
                  </td>

                  <td className="p-4 text-right font-semibold text-slate-900">
                    {item.student_count ?? 0}
                  </td>

                  <td className="p-4 text-right font-semibold text-blue-600">
                    {item.assignment_count ?? 0}
                  </td>

                  <td className="p-4 text-right font-semibold text-emerald-600">
                    {item.session_count ?? 0}
                  </td>

                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/instructor/sections/${item.id}`}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
                      >
                        View
                      </Link>

                      <Link
                        href="/instructor/assignments/new"
                        className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
                      >
                        New Assignment
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}

              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-500">
                    ยังไม่พบ section ที่คุณเข้าถึงได้
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

function formatSchedule(
  scheduleDay?: number | null,
  startTime?: string | null,
  endTime?: string | null
) {
  const dayMap: Record<number, string> = {
    1: 'Mon',
    2: 'Tue',
    3: 'Wed',
    4: 'Thu',
    5: 'Fri',
    6: 'Sat',
    7: 'Sun',
  }

  const dayText = scheduleDay ? dayMap[scheduleDay] ?? `Day ${scheduleDay}` : '-'
  const timeText =
    startTime && endTime ? `${normalizeTime(startTime)} - ${normalizeTime(endTime)}` : '-'

  if (dayText === '-' && timeText === '-') return '-'
  if (dayText !== '-' && timeText !== '-') return `${dayText} • ${timeText}`
  return `${dayText !== '-' ? dayText : timeText}`
}

function normalizeTime(value: string) {
  return value.length >= 5 ? value.slice(0, 5) : value
}