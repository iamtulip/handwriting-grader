//apps/web/app/api/instructor/overview/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: me } = await supabase
    .from('user_profiles')
    .select('id, full_name, role')
    .eq('id', user.id)
    .maybeSingle()

  const myRole = me?.role ?? 'student'
  if (!['instructor', 'admin'].includes(myRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let sectionIds: string[] = []

  if (myRole === 'admin') {
    const { data: allSections } = await supabase
      .from('sections')
      .select('id')
      .limit(500)

    sectionIds = (allSections ?? []).map((s) => s.id)
  } else {
    const { data: mine } = await supabase
      .from('instructor_sections')
      .select('section_id')
      .eq('instructor_id', user.id)

    sectionIds = (mine ?? []).map((x) => x.section_id)
  }

  const sectionCount = sectionIds.length

  let sections: any[] = []
  let assignments: any[] = []
  let todaySubmissionCount = 0
  let needsReviewCount = 0

  if (sectionIds.length > 0) {
    const { data: sectionRows } = await supabase
      .from('v_instructor_sections')
      .select('section_id, course_code, section_number, term')
      .in('section_id', sectionIds)
      .order('term', { ascending: false })

    sections = sectionRows ?? []

    const { data: assignmentRows } = await supabase
      .from('v_instructor_assignment_summary')
      .select(`
        assignment_id,
        section_id,
        title,
        assignment_type,
        week_number,
        class_date,
        submission_count,
        needs_review_count,
        graded_count,
        uploaded_count,
        ocr_pending_count,
        extract_pending_count,
        grade_pending_count,
        avg_total_score
      `)
      .in('section_id', sectionIds)
      .order('class_date', { ascending: false })
      .limit(20)

    assignments = assignmentRows ?? []

    needsReviewCount = assignments.reduce(
      (sum, a) => sum + Number(a.needs_review_count ?? 0),
      0
    )

    const today = new Date().toISOString().slice(0, 10)

    const { data: todaysAssignments } = await supabase
      .from('assignments')
      .select('id')
      .in('section_id', sectionIds)
      .eq('class_date', today)

    const todayAssignmentIds = (todaysAssignments ?? []).map((a) => a.id)

    if (todayAssignmentIds.length > 0) {
      const { count } = await supabase
        .from('submissions')
        .select('*', { count: 'exact', head: true })
        .in('assignment_id', todayAssignmentIds)

      todaySubmissionCount = count ?? 0
    }
  }

  return NextResponse.json({
    profile: {
      id: me?.id ?? user.id,
      full_name: me?.full_name ?? 'Instructor',
      role: myRole,
    },
    stats: {
      sectionCount,
      assignmentCount: assignments.length,
      todaySubmissionCount,
      needsReviewCount,
    },
    sections,
    recentAssignments: assignments.slice(0, 10),
  })
}