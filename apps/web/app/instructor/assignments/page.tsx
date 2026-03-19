//apps/web/app/instructor/assignments/page.tsx
import Link from 'next/link'
import { cookies } from 'next/headers'

async function getAssignments() {
  const cookieStore = await cookies()

  const res = await fetch('http://localhost:3000/api/instructor/assignments', {
    cache: 'no-store',
    headers: {
      Cookie: cookieStore.toString(),
    },
  })

  if (!res.ok) {
    throw new Error('Failed to load instructor assignments')
  }

  return res.json()
}

export default async function InstructorAssignmentsPage() {
  const data = await getAssignments()

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Assignments</h1>
          <p className="text-slate-600 mt-2 text-lg">งานทั้งหมดใน sections ที่คุณดูแล</p>
        </div>

        <Link
          href="/instructor/assignments/new"
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
        >
          + สร้าง Assignment
        </Link>
      </header>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
            <tr>
              <th className="text-left p-4 font-semibold">ชื่องาน</th>
              <th className="text-left p-4 font-semibold">ประเภท</th>
              <th className="text-left p-4 font-semibold">สัปดาห์</th>
              <th className="text-left p-4 font-semibold">วันที่เรียน</th>
              <th className="text-right p-4 font-semibold">ส่งแล้ว</th>
              <th className="text-right p-4 font-semibold">รอตรวจ</th>
              <th className="text-right p-4 font-semibold">คะแนนเฉลี่ย</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(data.items ?? []).map((a: any) => (
              <tr key={a.assignment_id} className="hover:bg-slate-50 transition-colors">
                <td className="p-4">
                  <Link
                    href={`/instructor/assignments/${a.assignment_id}`}
                    className="font-bold text-slate-900 hover:text-blue-700 transition-colors"
            >
                    {a.title}
                  </Link>
                  <div className="text-xs text-slate-500 mt-1">{a.assignment_id}</div>
                </td>
                <td className="p-4 text-slate-700">{a.assignment_type}</td>
                <td className="p-4 text-slate-700">{a.week_number ?? '-'}</td>
                <td className="p-4 text-slate-700">{a.class_date ?? '-'}</td>
                <td className="p-4 text-right font-semibold text-slate-900">
                  {a.submission_count ?? 0}
                </td>
                <td className="p-4 text-right font-semibold text-red-600">
                  {a.needs_review_count ?? 0}
                </td>
                <td className="p-4 text-right font-bold text-blue-600">
                  {Number(a.avg_total_score ?? 0).toFixed(2)}
                </td>
              </tr>
            ))}

            {(!data.items || data.items.length === 0) && (
              <tr>
                <td className="p-8 text-center text-slate-500" colSpan={7}>
                  ยังไม่มี assignment ใน sections ที่คุณดูแล
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}