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
    .select('id, section_id, title')
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
    .select('id, full_name, role, student_id_number, registration_status')
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

  const { data: assignment, error: assignmentError } = await supabase
    .from('assignments')
    .select(`
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
      section_id,
      sections!inner(
        id,
        course_code,
        section_number,
        term
      )
    `)
    .eq('id', assignmentId)
    .single()

  if (assignmentError) {
    return NextResponse.json({ error: assignmentError.message }, { status: 500 })
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
      extracted_paper_student_id
    `)
    .eq('assignment_id', assignmentId)
    .eq('student_id', user.id)
    .maybeSingle()

  if (submissionError) {
    return NextResponse.json({ error: submissionError.message }, { status: 500 })
  }

  let files: any[] = []
  if (submission?.id) {
    const { data: submissionFiles, error: filesError } = await supabase
      .from('submission_files')
      .select(`
        id,
        submission_id,
        page_number,
        storage_path,
        created_at
      `)
      .eq('submission_id', submission.id)
      .order('page_number', { ascending: true })

    if (filesError) {
      return NextResponse.json({ error: filesError.message }, { status: 500 })
    }

    files = submissionFiles ?? []
  }

  return NextResponse.json({
    profile: {
      full_name: me?.full_name ?? 'Student',
      student_id_number: me?.student_id_number ?? null,
      registration_status: me?.registration_status ?? null,
    },
    assignment,
    submission: submission ?? null,
    files,
  })
}