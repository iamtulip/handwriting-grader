import { createClient } from '@/lib/supabase/server'

async function getAttendanceDirect() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  try {
    const { data: studentSections } = await supabase
      .from('student_sections')
      .select('section_id')
      .eq('student_id', user.id)

    const sectionIds = (studentSections ?? [])
      .map((x) => x.section_id)
      .filter(Boolean)

    if (sectionIds.length === 0) {
      return { items: [] as any[], note: undefined }
    }

    const { data: sessions } = await supabase
      .from('class_sessions')
      .select('id, class_date, starts_at, ends_at, section_id')
      .in('section_id', sectionIds)
      .order('class_date', { ascending: false })
      .limit(50)

    const sessionIds = (sessions ?? []).map((s) => s.id)
    if (sessionIds.length === 0) {
      return { items: [] as any[], note: undefined }
    }

    const { data: checkins } = await supabase
      .from('attendance_checkins')
      .select('session_id, check_in_time, is_on_time')
      .eq('student_id', user.id)
      .in('session_id', sessionIds)

    const checkinMap = new Map<string, any>()
    for (const c of checkins ?? []) {
      checkinMap.set(c.session_id, c)
    }

    const items = (sessions ?? []).map((s) => {
      const c = checkinMap.get(s.id)

      return {
        session_id: s.id,
        class_date: s.class_date,
        starts_at: s.starts_at ?? null,
        ends_at: s.ends_at ?? null,
        check_in_time: c?.check_in_time ?? null,
        is_on_time: c?.is_on_time ?? null,
      }
    })

    return { items, note: undefined }
  } catch {
    return {
      items: [],
      note: 'Attendance tables not ready yet (class_sessions / attendance_checkins) แต่หน้าไม่ล้ม',
    }
  }
}

function formatDate(value: string | null) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('th-TH')
}

function formatTime(value: string | null) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function AttendancePage() {
  const { items, note } = await getAttendanceDirect()

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header>
        <h1 className="text-3xl font-extrabold text-slate-900">Attendance</h1>
        <p className="text-slate-600 mt-2 text-lg">ประวัติการเข้าเรียนและการตรงต่อเวลา</p>

        {note && (
          <p className="text-sm text-amber-700 mt-4 bg-amber-50 p-4 rounded-lg border border-amber-200 font-bold">
            {note}
          </p>
        )}
      </header>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
            <tr>
              <th className="text-left p-4 font-semibold">วันที่เรียน</th>
              <th className="text-left p-4 font-semibold">เวลาเริ่ม</th>
              <th className="text-left p-4 font-semibold">เวลาสิ้นสุด</th>
              <th className="text-left p-4 font-semibold">เวลาเช็คชื่อ</th>
              <th className="text-left p-4 font-semibold">ตรงต่อเวลา</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {items.map((it: any) => (
              <tr key={it.session_id} className="hover:bg-slate-50 transition-colors">
                <td className="p-4 font-bold text-slate-800">{formatDate(it.class_date)}</td>
                <td className="p-4 text-slate-600">{formatTime(it.starts_at)}</td>
                <td className="p-4 text-slate-600">{formatTime(it.ends_at)}</td>
                <td className="p-4 text-slate-600">{formatTime(it.check_in_time)}</td>
                <td className="p-4">
                  {it.is_on_time === null ? (
                    <span className="text-slate-400 font-medium">-</span>
                  ) : it.is_on_time ? (
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-md font-bold text-xs">
                      ตรงเวลา
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-red-100 text-red-700 rounded-md font-bold text-xs">
                      สาย
                    </span>
                  )}
                </td>
              </tr>
            ))}

            {items.length === 0 && !note && (
              <tr>
                <td className="p-8 text-center text-slate-500" colSpan={5}>
                  ยังไม่มีประวัติการเข้าเรียน
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}