import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET() {
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
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (meError) {
    return NextResponse.json({ error: meError.message }, { status: 500 })
  }

  const role = me?.role ?? 'student'

  if (!['instructor', 'reviewer', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let sections: any[] = []

  if (role === 'admin') {
    const { data, error } = await supabase
      .from('sections')
      .select('id, course_code, section_number, term, created_at')
      .order('course_code', { ascending: true })
      .order('section_number', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    sections = data ?? []
  } else if (role === 'instructor') {
    const { data: instructorLinks, error: linkError } = await supabase
      .from('instructor_sections')
      .select('section_id')
      .eq('instructor_id', user.id)

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 })
    }

    const sectionIds = (instructorLinks ?? [])
      .map((x: any) => x.section_id)
      .filter(Boolean)

    if (sectionIds.length === 0) {
      return NextResponse.json({ items: [] })
    }

    const { data, error } = await supabase
      .from('sections')
      .select('id, course_code, section_number, term, created_at')
      .in('id', sectionIds)
      .order('course_code', { ascending: true })
      .order('section_number', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    sections = data ?? []
  } else if (role === 'reviewer') {
    const { data: reviewerAssignments, error: reviewerError } = await supabase
      .from('reviewer_assignments')
      .select(`
        assignment_id,
        assignments!inner(
          id,
          section_id
        )
      `)
      .eq('reviewer_id', user.id)

    if (reviewerError) {
      return NextResponse.json({ error: reviewerError.message }, { status: 500 })
    }

    const sectionIdSet = new Set<string>()
    for (const row of reviewerAssignments ?? []) {
      const sid = row.assignments?.section_id
      if (sid) sectionIdSet.add(sid)
    }

    const sectionIds = Array.from(sectionIdSet)

    if (sectionIds.length === 0) {
      return NextResponse.json({ items: [] })
    }

    const { data, error } = await supabase
      .from('sections')
      .select('id, course_code, section_number, term, created_at')
      .in('id', sectionIds)
      .order('course_code', { ascending: true })
      .order('section_number', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    sections = data ?? []
  }

  const sectionIds = sections.map((s: any) => s.id)

  if (sectionIds.length === 0) {
    return NextResponse.json({ items: [] })
  }

  const [studentSectionsRes, assignmentsRes, sessionsRes] = await Promise.all([
    supabase.from('student_sections').select('section_id').in('section_id', sectionIds),

    supabase.from('assignments').select('id, section_id').in('section_id', sectionIds),

    supabase.from('class_sessions').select('id, section_id').in('section_id', sectionIds),
  ])

  if (studentSectionsRes.error) {
    return NextResponse.json({ error: studentSectionsRes.error.message }, { status: 500 })
  }

  if (assignmentsRes.error) {
    return NextResponse.json({ error: assignmentsRes.error.message }, { status: 500 })
  }

  if (sessionsRes.error) {
    return NextResponse.json({ error: sessionsRes.error.message }, { status: 500 })
  }

  const studentCountMap = new Map<string, number>()
  for (const row of studentSectionsRes.data ?? []) {
    const key = row.section_id
    studentCountMap.set(key, (studentCountMap.get(key) ?? 0) + 1)
  }

  const assignmentCountMap = new Map<string, number>()
  for (const row of assignmentsRes.data ?? []) {
    const key = row.section_id
    assignmentCountMap.set(key, (assignmentCountMap.get(key) ?? 0) + 1)
  }

  const sessionCountMap = new Map<string, number>()
  for (const row of sessionsRes.data ?? []) {
    const key = row.section_id
    sessionCountMap.set(key, (sessionCountMap.get(key) ?? 0) + 1)
  }

  const items = sections.map((section: any) => ({
    ...section,
    schedule_day: null,
    start_time: null,
    end_time: null,
    student_count: studentCountMap.get(section.id) ?? 0,
    assignment_count: assignmentCountMap.get(section.id) ?? 0,
    session_count: sessionCountMap.get(section.id) ?? 0,
  }))

  return NextResponse.json({ items })
}