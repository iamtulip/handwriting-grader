import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

async function getWeeklyDirect() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  // ใช้ทุก section ของนักศึกษา
  const { data: studentSectionRows } = await supabase
    .from('student_sections')
    .select('section_id')
    .eq('student_id', user.id)

  const sectionIds = (studentSectionRows ?? []).map((x) => x.section_id)

  if (sectionIds.length === 0) {
    return { items: [] }
  }

  const { data: assignments } = await supabase
    .from('assignments')
    .select(`
      id,
      title,
      assignment_type,
      week_number,
      class_date,
      open_at,
      close_at,
      created_at,
      section_id,
      is_online_class
    `)
    .in('section_id', sectionIds)
    .order('class_date', { ascending: false })

  const { data: subs } = await supabase
    .from('submissions')
    .select(`
      assignment_id,
      status,
      total_score,
      submitted_at,
      fraud_flag
    `)
    .eq('student_id', user.id)

  const subMap = new Map<string, any>()
  for (const s of subs ?? []) {
    subMap.set(s.assignment_id, s)
  }

  const items = (assignments ?? []).map((a) => {
    const s = subMap.get(a.id)

    return {
      assignment_id: a.id,
      title: a.title ?? `Assignment ${a.week_number ?? ''}`,
      assignment_type: a.assignment_type ?? 'weekly_exercise',
      week_number: a.week_number ?? null,
      class_date: a.class_date ?? null,
      open_at: a.open_at ?? null,
      close_at: a.close_at ?? null,
      section_id: a.section_id ?? null,
      is_online_class: a.is_online_class ?? false,
      status: s?.status ?? 'not_submitted',
      total_score: s?.total_score ?? 0,
      submitted_at: s?.submitted_at ?? null,
      fraud_flag: s?.fraud_flag ?? false,
    }
  })

  return { items }
}

export default async function StudentWeeklyPage() {
  const { items } = await getWeeklyDirect()

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <header>
        <h1 className="text-3xl font-extrabold text-slate-900">Weekly Scores</h1>
        <p className="text-slate-600 mt-2 text-lg">
          คะแนนและผลการประเมินรายสัปดาห์ของคุณ
        </p>
      </header>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="text-left p-4 font-semibold">สัปดาห์</th>
                <th className="text-left p-4 font-semibold">ชื่องาน</th>
                <th className="text-left p-4 font-semibold">ประเภท</th>
                <th className="text-left p-4 font-semibold">วันที่เรียน</th>
                <th className="text-left p-4 font-semibold">สถานะ</th>
                <th className="text-center p-4 font-semibold">Flags</th>
                <th className="text-right p-4 font-semibold">คะแนน</th>
                <th className="text-right p-4 font-semibold">รายละเอียด</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {items.map((it: any) => (
                <tr key={it.assignment_id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">{it.week_number ?? '-'}</td>
                  <td className="p-4 font-bold text-slate-800">{it.title}</td>
                  <td className="p-4 text-slate-600">{it.assignment_type}</td>
                  <td className="p-4 text-slate-600">{it.class_date ?? '-'}</td>

                  <td className="p-4">
                    <StatusBadge status={it.status ?? 'not_submitted'} />
                  </td>

                  <td className="p-4 text-center">
                    <div className="flex justify-center gap-2">
                      {it.is_online_class && (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                          online
                        </span>
                      )}
                      {it.fraud_flag && (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700">
                          fraud
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="p-4 text-right font-bold text-blue-600">
                    {(it.total_score ?? 0).toFixed(2)}
                  </td>

                  <td className="p-4 text-right">
                    <Link
                      className="inline-flex items-center justify-center px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
                      href={`/student/weekly/${it.assignment_id}`}
                    >
                      ดูผลตรวจ
                    </Link>
                  </td>
                </tr>
              ))}

              {items.length === 0 && (
                <tr>
                  <td className="p-8 text-center text-slate-500" colSpan={8}>
                    ยังไม่มีรายการงานหรือการสอบในระบบ
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: 'bg-green-50 text-green-700',
    graded: 'bg-green-50 text-green-700',
    published: 'bg-green-50 text-green-700',
    not_submitted: 'bg-red-50 text-red-700',
    needs_review: 'bg-amber-50 text-amber-700',
    uploaded: 'bg-blue-50 text-blue-700',
    ocr_pending: 'bg-blue-50 text-blue-700',
    extract_pending: 'bg-blue-50 text-blue-700',
    grade_pending: 'bg-blue-50 text-blue-700',
    pending: 'bg-slate-100 text-slate-700',
    rejected: 'bg-red-50 text-red-700',
  }

  const cls = map[status] ?? 'bg-slate-100 text-slate-700'

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${cls}`}>
      {status}
    </span>
  )
}