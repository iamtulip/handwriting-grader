//apps/web/app/api/instructor/assignments/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: me, error: meError } = await supabase
    .from('user_profiles')
    .select('id, role, full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (meError) {
    return NextResponse.json({ error: meError.message }, { status: 500 })
  }

  const myRole = me?.role ?? 'student'
  if (!['instructor', 'admin'].includes(myRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const sectionId = url.searchParams.get('sectionId')
  const type = url.searchParams.get('type')
  const week = url.searchParams.get('week')
  const archived = url.searchParams.get('archived')

  let allowedSectionIds: string[] = []

  if (myRole === 'admin') {
    const { data: allSections, error } = await supabase
      .from('sections')
      .select('id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    allowedSectionIds = (allSections ?? []).map((s) => s.id)
  } else {
    const { data: mine, error } = await supabase
      .from('instructor_sections')
      .select('section_id')
      .eq('instructor_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    allowedSectionIds = (mine ?? []).map((x) => x.section_id).filter(Boolean)
  }

  if (allowedSectionIds.length === 0) {
    return NextResponse.json({ items: [] })
  }

  let targetSectionIds = allowedSectionIds
  if (sectionId) {
    targetSectionIds = allowedSectionIds.includes(sectionId) ? [sectionId] : []
  }

  if (targetSectionIds.length === 0) {
    return NextResponse.json({ items: [] })
  }

  let query = supabase
    .from('assignments')
  .select(`
  id,
  title,
  description,
  assignment_type,
  workflow_mode,
  week_number,
  class_date,
  open_at,
  due_at,
  close_at,
  end_of_friday_at,
  section_id,
  created_by,
  created_by_user_id,
  created_at,
  updated_at
`)
    .in('section_id', targetSectionIds)
    .order('class_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (type) {
    query = query.eq('assignment_type', type)
  }

  if (week && !Number.isNaN(Number(week))) {
    query = query.eq('week_number', Number(week))
  }

  // schema ปัจจุบันยังไม่มี is_archived ใน dump ล่าสุดของโปรเจ็กต์นี้หรืออาจมีจาก migration ภายหลัง
  // จึงไม่ filter archived ที่ชั้น query เพื่อกัน route พัง ถ้าต้องการภายหลังค่อยเปิดใช้อีกครั้ง
  const { data: assignments, error: assignmentsError } = await query

  if (assignmentsError) {
    return NextResponse.json({ error: assignmentsError.message }, { status: 500 })
  }

  const assignmentList = assignments ?? []
  if (assignmentList.length === 0) {
    return NextResponse.json({ items: [] })
  }

  const sectionIds = Array.from(
    new Set(assignmentList.map((a) => a.section_id).filter(Boolean))
  )

  const { data: sections, error: sectionsError } = await supabase
    .from('sections')
    .select('id, course_code, section_number, term, section_kind, is_system_generated')
    .in('id', sectionIds)

  if (sectionsError) {
    return NextResponse.json({ error: sectionsError.message }, { status: 500 })
  }

  const sectionMap = new Map<string, any>()
  for (const section of sections ?? []) {
    sectionMap.set(section.id, section)
  }

  const assignmentIds = assignmentList.map((a) => a.id)

  const { data: submissions, error: submissionsError } = await supabase
    .from('submissions')
    .select('id, assignment_id, status, total_score, submitted_at')
    .in('assignment_id', assignmentIds)

  if (submissionsError) {
    return NextResponse.json({ error: submissionsError.message }, { status: 500 })
  }

  const submissionMap = new Map<string, any[]>()
  for (const sub of submissions ?? []) {
    const list = submissionMap.get(sub.assignment_id) ?? []
    list.push(sub)
    submissionMap.set(sub.assignment_id, list)
  }

  const items = assignmentList.map((assignment) => {
    const section = sectionMap.get(assignment.section_id) ?? null
    const rows = submissionMap.get(assignment.id) ?? []

    const submission_count = rows.length
    const needs_review_count = rows.filter(
      (r) => r.status === 'needs_review' || r.status === 'review_required'
    ).length
    const graded_count = rows.filter(
      (r) => r.status === 'graded' || r.status === 'published'
    ).length
    const uploaded_count = rows.filter(
      (r) => r.status === 'uploaded'
    ).length

    const avg_total_score =
      submission_count > 0
        ? rows.reduce((sum, r) => sum + Number(r.total_score ?? 0), 0) / submission_count
        : 0

    return {
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      assignment_type: assignment.assignment_type,
      week_number: assignment.week_number,
      class_date: assignment.class_date,
      open_at: assignment.open_at,
      due_at: assignment.due_at,
      close_at: assignment.close_at,
      end_of_friday_at: assignment.end_of_friday_at,
      section_id: assignment.section_id,
      created_by: assignment.created_by,
      created_by_user_id: assignment.created_by_user_id,
      created_at: assignment.created_at,
      updated_at: assignment.updated_at,
      course_code: section?.course_code ?? null,
      section_number: section?.section_number ?? null,
      term: section?.term ?? null,
      submission_count,
      needs_review_count,
      graded_count,
      uploaded_count,
      avg_total_score: Number(avg_total_score.toFixed(2)),
      is_archived: false,
      workflow_mode: assignment.workflow_mode ?? 'course_assignment',
      section_kind: section?.section_kind ?? 'course',
      is_system_generated: Boolean(section?.is_system_generated ?? false),
    }
  })

  return NextResponse.json({ items })
}