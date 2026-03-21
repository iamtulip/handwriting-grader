import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

async function canReviewSubmission(
  supabase: any,
  userId: string,
  role: string,
  submissionId: string
) {
  if (role === 'admin') {
    return { allowed: true, assignmentId: null as string | null }
  }

  const { data: submission } = await supabase
    .from('submissions')
    .select('id, assignment_id')
    .eq('id', submissionId)
    .maybeSingle()

  if (!submission) {
    return { allowed: false, assignmentId: null }
  }

  const { data: access } = await supabase
    .from('reviewer_assignments')
    .select('assignment_id')
    .eq('reviewer_user_id', userId)
    .eq('assignment_id', submission.assignment_id)
    .maybeSingle()

  return {
    allowed: !!access,
    assignmentId: submission.assignment_id,
  }
}

export async function GET(
  _: Request,
  context: { params: Promise<{ submissionId: string }> }
) {
  const { submissionId } = await context.params
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

  const myRole = me?.role ?? 'student'
  if (!['reviewer', 'admin'].includes(myRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const access = await canReviewSubmission(supabase, user.id, myRole, submissionId)
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
      layout_spec_version,
      layout_spec_id,
      pipeline_version,
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
        section_id,
        sections!inner(
          id,
          course_code,
          section_number,
          term
        )
      )
    `)
    .eq('id', submissionId)
    .single()

  if (submissionError) {
    return NextResponse.json({ error: submissionError.message }, { status: 500 })
  }

  const { data: studentProfile } = await supabase
    .from('user_profiles')
    .select('id, full_name, student_id_number, email')
    .eq('id', submission.student_id)
    .maybeSingle()

  const { data: files, error: filesError } = await supabase
    .from('submission_files')
    .select('id, submission_id, page_number, storage_path, created_at')
    .eq('submission_id', submissionId)
    .order('page_number', { ascending: true })

  if (filesError) {
    return NextResponse.json({ error: filesError.message }, { status: 500 })
  }

  let layoutSpec: any = null
  if (submission.layout_spec_id) {
    const { data } = await supabase
      .from('assignment_layout_specs')
      .select(`
        id,
        assignment_id,
        version,
        is_active,
        layout_data,
        schema_version,
        spec_name,
        page_count,
        layout_status,
        approved_by,
        approved_at,
        notes
      `)
      .eq('id', submission.layout_spec_id)
      .maybeSingle()

    layoutSpec = data ?? null
  } else {
    const { data } = await supabase
      .from('assignment_layout_specs')
      .select(`
        id,
        assignment_id,
        version,
        is_active,
        layout_data,
        schema_version,
        spec_name,
        page_count,
        layout_status,
        approved_by,
        approved_at,
        notes
      `)
      .eq('assignment_id', submission.assignment_id)
      .eq('is_active', true)
      .maybeSingle()

    layoutSpec = data ?? null
  }

  const { data: results, error: resultsError } = await supabase
    .from('grading_results')
    .select(`
      id,
      submission_id,
      item_no,
      extracted_raw,
      extracted_normalized,
      ai_confidence,
      auto_score,
      final_score,
      is_overridden,
      reviewer_notes,
      created_at,
      updated_at,
      page_number,
      roi_id,
      layout_spec_version,
      selected_candidate_id,
      evidence_map,
      is_human_override,
      manual_reason,
      confidence_score,
      meta_score_attendance,
      meta_score_punctuality,
      meta_score_accuracy,
      final_meta_score,
      is_blank
    `)
    .eq('submission_id', submissionId)
    .order('page_number', { ascending: true })
    .order('item_no', { ascending: true })

  if (resultsError) {
    return NextResponse.json({ error: resultsError.message }, { status: 500 })
  }

  const { data: candidates, error: candidatesError } = await supabase
    .from('grading_candidates')
    .select(`
      id,
      submission_id,
      roi_id,
      rank,
      raw_text,
      normalized_value,
      confidence_score,
      engine_source,
      created_at,
      page_number,
      candidate_hash,
      layout_spec_version
    `)
    .eq('submission_id', submissionId)
    .order('page_number', { ascending: true })
    .order('roi_id', { ascending: true })
    .order('rank', { ascending: true })

  if (candidatesError) {
    return NextResponse.json({ error: candidatesError.message }, { status: 500 })
  }

  const { data: events, error: eventsError } = await supabase
    .from('grading_events')
    .select(`
      id,
      submission_id,
      roi_id,
      page_number,
      layout_spec_version,
      actor_id,
      action_type,
      before_data,
      after_data,
      manual_reason,
      created_at,
      actor_user_id
    `)
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 })
  }

  const { data: claim } = await supabase
    .from('review_claims')
    .select(`
      id,
      submission_id,
      reviewer_id,
      claimed_at,
      expires_at,
      reviewer_user_id
    `)
    .eq('submission_id', submissionId)
    .maybeSingle()

  return NextResponse.json({
    reviewer: {
      id: me?.id ?? user.id,
      full_name: me?.full_name ?? 'Reviewer',
      role: myRole,
    },
    submission,
    student: studentProfile ?? {
      id: submission.student_id,
      full_name: null,
      student_id_number: null,
      email: null,
    },
    files: files ?? [],
    layout_spec: layoutSpec,
    grading_results: results ?? [],
    grading_candidates: candidates ?? [],
    grading_events: events ?? [],
    claim: claim ?? null,
  })
}