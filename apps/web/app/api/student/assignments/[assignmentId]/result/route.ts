//apps/web/app/api/student/assignments/[assignmentId]/result/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

async function canStudentAccessAssignment(
  supabase: any,
  userId: string,
  assignmentId: string
) {
  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, section_id')
    .eq('id', assignmentId)
    .maybeSingle()

  if (!assignment) {
    return { allowed: false, assignment: null }
  }

  const { data: membership } = await supabase
    .from('student_sections')
    .select('id')
    .eq('student_id', userId)
    .eq('section_id', assignment.section_id)
    .maybeSingle()

  return {
    allowed: !!membership,
    assignment,
  }
}

export async function GET(
  _: Request,
  context: { params: Promise<{ assignmentId: string }> }
) {
  const { assignmentId } = await context.params
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
    .select('id, full_name, role, student_id_number')
    .eq('id', user.id)
    .maybeSingle()

  if (meError) {
    return NextResponse.json({ error: meError.message }, { status: 500 })
  }

  if ((me?.role ?? 'student') !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const access = await canStudentAccessAssignment(supabase, user.id, assignmentId)
  if (!access.allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: submission, error: submissionError } = await supabase
    .from('submissions')
    .select(`
      id,
      assignment_id,
      student_id,
      status,
      total_score,
      max_score,
      submitted_at,
      updated_at,
      current_stage,
      fraud_flag,
      extracted_paper_student_id,
      assignments!inner(
        id,
        title,
        description,
        assignment_type,
        week_number,
        class_date,
        open_at,
        due_at,
        close_at,
        end_of_friday_at,
        sections!inner(
          id,
          course_code,
          section_number,
          term
        )
      )
    `)
    .eq('assignment_id', assignmentId)
    .eq('student_id', user.id)
    .maybeSingle()

  if (submissionError) {
    return NextResponse.json({ error: submissionError.message }, { status: 500 })
  }

  if (!submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  if (submission.status !== 'published') {
    return NextResponse.json({ error: 'Result not published yet' }, { status: 403 })
  }

  const { data: results, error: resultsError } = await supabase
    .from('grading_results')
    .select(`
      id,
      item_no,
      extracted_normalized,
      auto_score,
      final_score,
      reviewer_notes,
      page_number,
      roi_id,
      is_human_override,
      manual_reason,
      final_meta_score,
      is_blank
    `)
    .eq('submission_id', submission.id)
    .order('page_number', { ascending: true })
    .order('item_no', { ascending: true })

  if (resultsError) {
    return NextResponse.json({ error: resultsError.message }, { status: 500 })
  }

  const { data: appeals, error: appealsError } = await supabase
    .from('appeals')
    .select(`
      id,
      submission_id,
      reason,
      status,
      resolution_notes,
      created_at,
      updated_at
    `)
    .eq('submission_id', submission.id)
    .order('created_at', { ascending: false })

  if (appealsError) {
    return NextResponse.json({ error: appealsError.message }, { status: 500 })
  }

  return NextResponse.json({
    profile: {
      full_name: me?.full_name ?? 'Student',
      student_id_number: me?.student_id_number ?? null,
    },
    submission,
    results: results ?? [],
    appeals: appeals ?? [],
  })
}