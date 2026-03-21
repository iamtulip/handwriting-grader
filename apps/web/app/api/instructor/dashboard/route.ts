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
    .select('id, full_name, role')
    .eq('id', user.id)
    .maybeSingle()

  if (meError) {
    return NextResponse.json({ error: meError.message }, { status: 500 })
  }

  const role = me?.role ?? 'student'
  if (!['instructor', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let allowedSectionIds: string[] = []

  if (role === 'admin') {
    const { data: sections, error } = await supabase
      .from('sections')
      .select('id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    allowedSectionIds = (sections ?? []).map((s) => s.id)
  } else {
    const { data: links, error } = await supabase
      .from('instructor_sections')
      .select('section_id')
      .eq('instructor_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    allowedSectionIds = (links ?? []).map((x) => x.section_id).filter(Boolean)
  }

  if (allowedSectionIds.length === 0) {
    return NextResponse.json({
      profile: {
        full_name: me?.full_name ?? 'Instructor',
        role,
      },
      stats: {
        section_count: 0,
        assignment_count: 0,
        active_assignment_count: 0,
        source_pdf_count: 0,
        answer_key_approved_count: 0,
        layout_approved_count: 0,
        needs_review_submission_count: 0,
        open_appeal_count: 0,
      },
      recent_assignments: [],
    })
  }

  const { data: sections, error: sectionsError } = await supabase
    .from('sections')
    .select('id, course_code, section_number, term')
    .in('id', allowedSectionIds)
    .order('course_code', { ascending: true })
    .order('section_number', { ascending: true })

  if (sectionsError) {
    return NextResponse.json({ error: sectionsError.message }, { status: 500 })
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from('assignments')
    .select(`
      id,
      title,
      assignment_type,
      section_id,
      week_number,
      class_date,
      due_at,
      close_at,
      created_at
    `)
    .in('section_id', allowedSectionIds)
    .order('created_at', { ascending: false })

  if (assignmentsError) {
    return NextResponse.json({ error: assignmentsError.message }, { status: 500 })
  }

  const assignmentList = assignments ?? []
  const assignmentIds = assignmentList.map((a) => a.id)

  let sourceFiles: any[] = []
  let answerKeys: any[] = []
  let layouts: any[] = []
  let submissions: any[] = []
  let appeals: any[] = []

  if (assignmentIds.length > 0) {
    const [
      sourceFilesRes,
      answerKeysRes,
      layoutsRes,
      submissionsRes,
      appealsRes,
    ] = await Promise.all([
      supabase
        .from('assignment_source_files')
        .select('assignment_id, is_active, file_kind')
        .in('assignment_id', assignmentIds)
        .eq('file_kind', 'source_pdf')
        .eq('is_active', true),

      supabase
        .from('assignment_answer_keys')
        .select('assignment_id, approval_status, generation_status')
        .in('assignment_id', assignmentIds),

      supabase
        .from('assignment_layout_specs')
        .select('assignment_id, layout_status, is_active')
        .in('assignment_id', assignmentIds)
        .eq('is_active', true),

      supabase
        .from('submissions')
        .select('id, assignment_id, status')
        .in('assignment_id', assignmentIds),

      supabase
        .from('appeals')
        .select(`
          id,
          status,
          submission_id,
          submissions!inner(assignment_id)
        `)
        .in('submissions.assignment_id', assignmentIds),
    ])

    if (sourceFilesRes.error) {
      return NextResponse.json({ error: sourceFilesRes.error.message }, { status: 500 })
    }
    if (answerKeysRes.error) {
      return NextResponse.json({ error: answerKeysRes.error.message }, { status: 500 })
    }
    if (layoutsRes.error) {
      return NextResponse.json({ error: layoutsRes.error.message }, { status: 500 })
    }
    if (submissionsRes.error) {
      return NextResponse.json({ error: submissionsRes.error.message }, { status: 500 })
    }
    if (appealsRes.error) {
      return NextResponse.json({ error: appealsRes.error.message }, { status: 500 })
    }

    sourceFiles = sourceFilesRes.data ?? []
    answerKeys = answerKeysRes.data ?? []
    layouts = layoutsRes.data ?? []
    submissions = submissionsRes.data ?? []
    appeals = appealsRes.data ?? []
  }

  const sectionMap = new Map<string, any>()
  for (const section of sections ?? []) {
    sectionMap.set(section.id, section)
  }

  const sourcePdfAssignmentIds = new Set(sourceFiles.map((x) => x.assignment_id))
  const answerKeyApprovedAssignmentIds = new Set(
    answerKeys
      .filter((x) => x.approval_status === 'approved')
      .map((x) => x.assignment_id)
  )
  const layoutApprovedAssignmentIds = new Set(
    layouts
      .filter((x) => x.layout_status === 'approved')
      .map((x) => x.assignment_id)
  )

  const needsReviewSubmissionCount = submissions.filter(
    (x) => x.status === 'needs_review'
  ).length

  const openAppealCount = appeals.filter((x) =>
    ['open', 'in_review'].includes(x.status)
  ).length

  const recentAssignments = assignmentList.slice(0, 8).map((a) => {
    const section = sectionMap.get(a.section_id)
    const submissionCount = submissions.filter((s) => s.assignment_id === a.id).length
    const needsReviewCount = submissions.filter(
      (s) => s.assignment_id === a.id && s.status === 'needs_review'
    ).length

    return {
      id: a.id,
      title: a.title,
      assignment_type: a.assignment_type,
      week_number: a.week_number,
      class_date: a.class_date,
      due_at: a.due_at,
      close_at: a.close_at,
      created_at: a.created_at,
      course_code: section?.course_code ?? null,
      section_number: section?.section_number ?? null,
      term: section?.term ?? null,
      has_source_pdf: sourcePdfAssignmentIds.has(a.id),
      answer_key_approved: answerKeyApprovedAssignmentIds.has(a.id),
      layout_approved: layoutApprovedAssignmentIds.has(a.id),
      submission_count: submissionCount,
      needs_review_count: needsReviewCount,
    }
  })

  return NextResponse.json({
    profile: {
      full_name: me?.full_name ?? 'Instructor',
      role,
    },
    stats: {
      section_count: allowedSectionIds.length,
      assignment_count: assignmentList.length,
      active_assignment_count: assignmentList.length,
      source_pdf_count: sourcePdfAssignmentIds.size,
      answer_key_approved_count: answerKeyApprovedAssignmentIds.size,
      layout_approved_count: layoutApprovedAssignmentIds.size,
      needs_review_submission_count: needsReviewSubmissionCount,
      open_appeal_count: openAppealCount,
    },
    recent_assignments: recentAssignments,
  })
}