//apps/web/app/api/instructor/sections/[sectionId]/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

async function canAccessSection(
  supabase: any,
  userId: string,
  role: string,
  sectionId: string
) {
  if (role === 'admin') return true

  if (role === 'instructor') {
    // 1) direct mapping via instructor_sections
    const { data: directAccess } = await supabase
      .from('instructor_sections')
      .select('section_id')
      .eq('instructor_id', userId)
      .eq('section_id', sectionId)
      .maybeSingle()

    if (directAccess) return true

    // 2) fallback via assignments created/owned in this section
    const { data: assignmentAccess } = await supabase
      .from('assignments')
      .select('id')
      .eq('section_id', sectionId)
      .eq('created_by', userId)
      .limit(1)
      .maybeSingle()

    return !!assignmentAccess
  }

  if (role === 'reviewer') {
    const { data } = await supabase
      .from('reviewer_assignments')
      .select(`
        assignment_id,
        assignments!inner(
          id,
          section_id
        )
      `)
      .eq('reviewer_id', userId)

    return (data ?? []).some((x: any) => x.assignments?.section_id === sectionId)
  }

  return false
}

export async function GET(
  _: Request,
  context: { params: Promise<{ sectionId: string }> }
) {
  const { sectionId } = await context.params

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: me } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const role = me?.role ?? 'student'
  if (!['instructor', 'reviewer', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const allowed = await canAccessSection(supabase, user.id, role, sectionId)

  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: section, error: sectionError } = await supabase
    .from('sections')
    .select('id, course_code, section_number, term, created_at')
    .eq('id', sectionId)
    .maybeSingle()

  if (sectionError || !section) {
    return NextResponse.json({ error: 'Section not found' }, { status: 404 })
  }

  const { data: studentLinks } = await supabase
    .from('student_sections')
    .select('student_id')
    .eq('section_id', sectionId)

  const studentIds = (studentLinks ?? []).map((x: any) => x.student_id)

  let students: any[] = []
  if (studentIds.length > 0) {
    const { data } = await supabase
      .from('user_profiles')
      .select('id, full_name, email, student_id_number, registration_status')
      .in('id', studentIds)
      .order('student_id_number', { ascending: true })

    students = data ?? []
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
      due_at,
      close_at,
      end_of_friday_at,
      created_at,
      created_by
    `)
    .eq('section_id', sectionId)
    .order('class_date', { ascending: false })

  const assignmentIds = (assignments ?? []).map((a: any) => a.id)

  let submissionRows: any[] = []
  if (assignmentIds.length > 0) {
    const { data } = await supabase
      .from('submissions')
      .select('id, assignment_id, student_id, status, total_score, submitted_at')
      .in('assignment_id', assignmentIds)

    submissionRows = data ?? []
  }

  const submissionMap = new Map<string, any[]>()
  for (const row of submissionRows) {
    const key = row.assignment_id
    const list = submissionMap.get(key) ?? []
    list.push(row)
    submissionMap.set(key, list)
  }

  const assignmentSummary = (assignments ?? []).map((a: any) => {
    const rows = submissionMap.get(a.id) ?? []
    const submission_count = rows.length
    const graded_count = rows.filter((r) => r.status === 'graded').length
    const needs_review_count = rows.filter((r) => r.status === 'needs_review').length
    const avg_total_score =
      submission_count > 0
        ? rows.reduce((sum, r) => sum + Number(r.total_score ?? 0), 0) / submission_count
        : 0

    return {
      ...a,
      submission_count,
      graded_count,
      needs_review_count,
      avg_total_score,
    }
  })

  const { data: sessions } = await supabase
    .from('class_sessions')
    .select('id, class_date, starts_at, ends_at')
    .eq('section_id', sectionId)
    .order('class_date', { ascending: false })
    .limit(20)

  const sessionIds = (sessions ?? []).map((s: any) => s.id)

  let attendanceCheckins: any[] = []
  if (sessionIds.length > 0) {
    const { data } = await supabase
      .from('attendance_checkins')
      .select('session_id, student_id, is_on_time, check_in_time')
      .in('session_id', sessionIds)

    attendanceCheckins = data ?? []
  }

  const attendanceSummary =
    (sessions ?? []).map((session: any) => {
      const rows = attendanceCheckins.filter((x) => x.session_id === session.id)
      return {
        session_id: session.id,
        class_date: session.class_date,
        starts_at: session.starts_at,
        ends_at: session.ends_at,
        total_checkins: rows.length,
        on_time_count: rows.filter((x) => x.is_on_time === true).length,
        late_count: rows.filter((x) => x.is_on_time === false).length,
      }
    }) ?? []

  return NextResponse.json({
    section,
    stats: {
      student_count: students.length,
      assignment_count: assignments?.length ?? 0,
      session_count: sessions?.length ?? 0,
    },
    students,
    assignments: assignmentSummary,
    attendance: attendanceSummary,
  })
}