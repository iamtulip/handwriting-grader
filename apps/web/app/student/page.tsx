import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

type SectionInfo = {
  id: string
  course_code: string | null
  section_number: number | null
  term: string | null
}

type StudentSectionRow = {
  section_id: string
  section?: SectionInfo[] | null
}

type AssignmentRow = {
  id: string
  title: string | null
  week_number: number | null
  class_date: string | null
  assignment_type: string | null
  open_at: string | null
  due_at: string | null
  close_at: string | null
  created_at: string | null
  section_id: string | null
  is_online_class: boolean | null
  section?: SectionInfo[] | null
}

async function getOverviewDirect() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, full_name, student_id_number, registration_status')
    .eq('id', user.id)
    .maybeSingle()

  const { data: studentSectionRows, error: sectionError } = await supabase
    .from('student_sections')
    .select(`
      section_id,
      section:sections (
        id,
        course_code,
        section_number,
        term
      )
    `)
    .eq('student_id', user.id)

  if (sectionError) {
    throw new Error(sectionError.message)
  }

  const sectionRows = (studentSectionRows ?? []) as StudentSectionRow[]
  const sectionIds = sectionRows.map((x) => x.section_id).filter(Boolean)
  const primarySection = sectionRows[0]?.section?.[0] ?? null

  let assignments: AssignmentRow[] = []

  if (sectionIds.length > 0) {
    const { data, error: assignmentError } = await supabase
      .from('assignments')
      .select(`
        id,
        title,
        week_number,
        class_date,
        assignment_type,
        open_at,
        due_at,
        close_at,
        created_at,
        section_id,
        is_online_class,
        section:sections (
          id,
          course_code,
          section_number,
          term
        )
      `)
      .in('section_id', sectionIds)
      .order('class_date', { ascending: false })
      .limit(50)

    if (assignmentError) {
      throw new Error(assignmentError.message)
    }

    assignments = (data ?? []) as AssignmentRow[]
  }

  const { data: subs } = await supabase
    .from('submissions')
    .select(`
      assignment_id,
      status,
      current_stage,
      total_score,
      submitted_at,
      fraud_flag
    `)
    .eq('student_id', user.id)
    .order('submitted_at', { ascending: false })
    .limit(50)

  const subMap = new Map<string, any>()
  for (const s of subs ?? []) {
    subMap.set(s.assignment_id, s)
  }

  const merged = assignments.map((a) => {
    const s = subMap.get(a.id)
    return {
      assignment_id: a.id,
      title: a.title ?? `Assignment ${a.week_number ?? ''}`,
      week_number: a.week_number ?? null,
      class_date: a.class_date ?? null,
      assignment_type: a.assignment_type ?? 'weekly_exercise',
      is_online_class: a.is_online_class ?? false,
      section_id: a.section_id ?? null,
      course_code: a.section?.[0]?.course_code ?? null,
      section_number: a.section?.[0]?.section_number ?? null,
      term: a.section?.[0]?.term ?? null,
      open_at: a.open_at ?? null,
      due_at: a.due_at ?? null,
      close_at: a.close_at ?? null,
      status: s?.status ?? 'not_submitted',
      total_score: Number(s?.total_score ?? 0),
      submitted_at: s?.submitted_at ?? null,
      fraud_flag: s?.fraud_flag ?? false,
      needs_review:
        s?.status === 'needs_review' ||
        s?.current_stage === 'review_required',
    }
  })

  const totalAssignments = assignments.length
  const submittedCount = (subs ?? []).length
  const needsReviewCount = merged.filter((x) => x.needs_review).length
  const fraudCount = (subs ?? []).filter((x) => x.fraud_flag === true).length

  const avgScore =
    submittedCount > 0
      ? (subs ?? []).reduce((sum, x) => sum + Number(x.total_score ?? 0), 0) /
        submittedCount
      : 0

  return {
    authUserId: user.id,
    profile: {
      full_name: profile?.full_name ?? null,
      student_id_number: profile?.student_id_number ?? null,
      registration_status: profile?.registration_status ?? null,
    },
    enrollment: {
      count: sectionRows.length,
      sections: sectionRows,
      primarySection,
    },
    stats: {
      totalAssignments,
      submittedCount,
      avgScore,
      needsReviewCount,
      fraudCount,
    },
    recent: merged.slice(0, 10),
  }
}

export default async function StudentOverviewPage() {
  const data = await getOverviewDirect()

  const hasEnrollment = data.enrollment.count > 0
  const primary = data.enrollment.primarySection

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Overview</h1>
          <p className="text-slate-600 mt-2 text-lg">
            {data.profile.full_name ?? 'Student'} (รหัสนักศึกษา:{' '}
            {data.profile.student_id_number ?? '-'})
          </p>

          <div className="mt-3">
            <StatusBadge status={data.profile.registration_status ?? 'pending'} />
          </div>

          <div className="mt-4 space-y-1 text-sm text-slate-600">
            <div>
              <span className="font-semibold text-slate-800">Auth User ID:</span>{' '}
              {data.authUserId}
            </div>
            {primary ? (
              <>
                <div>
                  <span className="font-semibold text-slate-800">รายวิชา:</span>{' '}
                  {primary.course_code ?? '-'}
                </div>
                <div>
                  <span className="font-semibold text-slate-800">กลุ่ม:</span>{' '}
                  {primary.section_number ?? '-'}
                </div>
                <div>
                  <span className="font-semibold text-slate-800">ภาคเรียน:</span>{' '}
                  {primary.term ?? '-'}
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
                ยังไม่พบการผูกนักศึกษากับ section ในระบบ
              </div>
            )}
          </div>
        </div>

        <Link
          href="/student/weekly"
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          ดูคะแนนรายสัปดาห์
        </Link>
      </header>

      {!hasEnrollment && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 font-semibold">
          นักศึกษายังไม่ถูกผูกกับ section ใด ๆ ในตาราง student_sections จึงไม่สามารถเห็นงานได้
        </section>
      )}

      {hasEnrollment && data.stats.totalAssignments === 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-700 font-semibold">
          นักศึกษาอยู่ใน section แล้ว แต่ยังไม่พบ assignment ของ section นี้ในมุมมองที่หน้า student ใช้
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card title="งานทั้งหมด (Assignments)" value={String(data.stats.totalAssignments)} />
        <Card title="ส่งแล้ว (Submitted)" value={String(data.stats.submittedCount)} />
        <Card title="คะแนนเฉลี่ย (Avg Score)" value={Number(data.stats.avgScore).toFixed(2)} />
        <Card title="รอตรวจ (Needs Review)" value={String(data.stats.needsReviewCount)} />
        <Card title="Fraud Flags" value={String(data.stats.fraudCount)} />
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="font-bold text-slate-800 text-lg">ประวัติการส่งงานล่าสุด</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white text-slate-500 border-b border-slate-200">
              <tr>
                <th className="text-left p-4 font-medium">สัปดาห์</th>
                <th className="text-left p-4 font-medium">ชื่องาน</th>
                <th className="text-left p-4 font-medium">รายวิชา/กลุ่ม</th>
                <th className="text-left p-4 font-medium">เปิด</th>
                <th className="text-left p-4 font-medium">กำหนดส่ง</th>
                <th className="text-left p-4 font-medium">สถานะ</th>
                <th className="text-right p-4 font-medium">คะแนนรวม</th>
                <th className="text-center p-4 font-medium">Flags</th>
                <th className="text-right p-4 font-medium">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {data.recent.map((r: any) => (
                <tr key={r.assignment_id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">{r.week_number ?? '-'}</td>
                  <td className="p-4 font-semibold text-slate-800">{r.title}</td>
                  <td className="p-4 text-slate-600">
                    {r.course_code ?? '-'} / Sec {r.section_number ?? '-'} ({r.term ?? '-'})
                  </td>
                  <td className="p-4 text-slate-600">{formatDateTime(r.open_at)}</td>
                  <td className="p-4 text-slate-600">{formatDateTime(r.due_at)}</td>
                  <td className="p-4">
                    <StatusBadge status={r.status ?? '-'} />
                  </td>
                  <td className="p-4 text-right font-bold text-blue-600">
                    {Number(r.total_score ?? 0).toFixed(2)}
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex justify-center gap-2">
                      {r.is_online_class && (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                          online
                        </span>
                      )}
                      {r.fraud_flag && (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700">
                          fraud
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <Link
                      href={`/student/weekly/${r.assignment_id}`}
                      className="text-blue-600 hover:underline font-semibold"
                    >
                      ดูรายละเอียด
                    </Link>
                  </td>
                </tr>
              ))}

              {data.recent.length === 0 && (
                <tr>
                  <td className="p-8 text-center text-slate-500" colSpan={9}>
                    ยังไม่มีข้อมูลการส่งงาน
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

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="text-sm text-slate-500 font-medium">{title}</div>
      <div className="text-3xl font-extrabold text-slate-900 mt-2">{value}</div>
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

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('th-TH')
}