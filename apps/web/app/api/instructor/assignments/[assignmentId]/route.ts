import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

async function canAccessAssignment(
  supabase: any,
  userId: string,
  role: string,
  assignmentId: string
) {
  if (role === 'admin') return true

  const { data: assignment } = await supabase
    .from('assignments')
    .select('section_id')
    .eq('id', assignmentId)
    .maybeSingle()

  if (!assignment?.section_id) return false

  if (role === 'instructor') {
    const { data: access } = await supabase
      .from('instructor_sections')
      .select('id')
      .eq('instructor_id', userId)
      .eq('section_id', assignment.section_id)
      .maybeSingle()

    return !!access
  }

  if (role === 'reviewer') {
    const { data: access } = await supabase
      .from('reviewer_assignments')
      .select('assignment_id')
      .eq('reviewer_id', userId)
      .eq('assignment_id', assignmentId)
      .maybeSingle()

    return !!access
  }

  return false
}

export async function GET(
  _: Request,
  { params }: { params: { assignmentId: string } }
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: me } = await supabase
    .from('user_profiles')
    .select('id, role, full_name')
    .eq('id', user.id)
    .maybeSingle()

  const role = me?.role ?? 'student'
  if (!['instructor', 'reviewer', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const assignmentId = params.assignmentId
  const allowed = await canAccessAssignment(supabase, user.id, role, assignmentId)

  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from('assignments')
    .select(`
      id,
      title,
      description,
      section_id,
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
    .eq('id', assignmentId)
    .maybeSingle()

  if (assignmentError || !assignment) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  }

  const { data: section } = await supabase
    .from('sections')
    .select('id, course_code, section_number, term')
    .eq('id', assignment.section_id)
    .maybeSingle()

  const { data: layoutSpec } = await supabase
    .from('assignment_layout_specs')
    .select(`
      id,
      version,
      is_active,
      schema_version,
      spec_name,
      page_count,
      layout_status,
      approved_by,
      approved_at,
      created_at
    `)
    .eq('assignment_id', assignmentId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

    const { data: answerKey } = await supabase
    .from('assignment_answer_keys')
    .select(`
      assignment_id,
      answer_key,
      grading_config,
      updated_at,
      generation_status,
      generated_by_ai,
      ai_model,
      approval_status,
      approved_by,
      approved_at,
      generation_notes,
      last_generation_error
    `)
    .eq('assignment_id', assignmentId)
    .maybeSingle()

  const { data: summary } = await supabase
    .from('v_instructor_assignment_summary')
    .select(`
      assignment_id,
      submission_count,
      needs_review_count,
      graded_count,
      uploaded_count,
      ocr_pending_count,
      extract_pending_count,
      grade_pending_count,
      avg_total_score
    `)
    .eq('assignment_id', assignmentId)
    .maybeSingle()

  const { count: submissionCount } = await supabase
    .from('submissions')
    .select('*', { count: 'exact', head: true })
    .eq('assignment_id', assignmentId)

const { data: sourcePdf } = await supabase
    .from('assignment_source_files')
    .select(`
      id,
      original_filename,
      mime_type,
      file_size_bytes,
      uploaded_at,
      is_active
    `)
    .eq('assignment_id', assignmentId)
    .eq('file_kind', 'source_pdf')
    .eq('is_active', true)
    .maybeSingle()

  return NextResponse.json({
    assignment,
    section: section ?? null,
    layoutSpec: layoutSpec ?? null,
    sourcePdf: sourcePdf
      ? {
          exists: true,
          id: sourcePdf.id,
          original_filename: sourcePdf.original_filename,
          mime_type: sourcePdf.mime_type,
          file_size_bytes: sourcePdf.file_size_bytes,
          uploaded_at: sourcePdf.uploaded_at,
        }
      : {
          exists: false,
          id: null,
          original_filename: null,
          mime_type: null,
          file_size_bytes: null,
          uploaded_at: null,
        },
     answerKey: answerKey
      ? {
          exists: true,
          updated_at: answerKey.updated_at,
          item_count: Array.isArray(answerKey.answer_key?.items)
            ? answerKey.answer_key.items.length
            : 0,
          generation_status: answerKey.generation_status,
          generated_by_ai: answerKey.generated_by_ai,
          ai_model: answerKey.ai_model,
          approval_status: answerKey.approval_status,
          approved_at: answerKey.approved_at,
          generation_notes: answerKey.generation_notes,
          last_generation_error: answerKey.last_generation_error,
        }
      : {
          exists: false,
          updated_at: null,
          item_count: 0,
          generation_status: 'not_started',
          generated_by_ai: false,
          ai_model: null,
          approval_status: 'draft',
          approved_at: null,
          generation_notes: null,
          last_generation_error: null,
        },
    summary: {
      submission_count: summary?.submission_count ?? submissionCount ?? 0,
      needs_review_count: summary?.needs_review_count ?? 0,
      graded_count: summary?.graded_count ?? 0,
      uploaded_count: summary?.uploaded_count ?? 0,
      ocr_pending_count: summary?.ocr_pending_count ?? 0,
      extract_pending_count: summary?.extract_pending_count ?? 0,
      grade_pending_count: summary?.grade_pending_count ?? 0,
      avg_total_score: Number(summary?.avg_total_score ?? 0),
    },
  })
}