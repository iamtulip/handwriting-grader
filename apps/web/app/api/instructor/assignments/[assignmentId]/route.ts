import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireInstructorAssignmentAccess } from '@/lib/instructor-permissions'

export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  context: { params: Promise<{ assignmentId: string }> }
) {
  const { assignmentId } = await context.params

  const access = await requireInstructorAssignmentAccess(assignmentId)
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const supabase = await createClient()

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
      created_by_user_id,
      created_by,
      created_at,
      updated_at
    `)
    .eq('id', assignmentId)
    .maybeSingle()

  if (assignmentError) {
    return NextResponse.json({ error: assignmentError.message }, { status: 500 })
  }

  if (!assignment) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  }

  const { data: section, error: sectionError } = assignment.section_id
    ? await supabase
        .from('sections')
        .select('id, course_code, section_number, term')
        .eq('id', assignment.section_id)
        .maybeSingle()
    : { data: null, error: null as any }

  if (sectionError) {
    return NextResponse.json({ error: sectionError.message }, { status: 500 })
  }

  const { data: sourcePdfRow, error: sourcePdfError } = await supabase
    .from('assignment_source_files')
    .select(`
      id,
      assignment_id,
      file_kind,
      storage_path,
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

  if (sourcePdfError) {
    return NextResponse.json({ error: sourcePdfError.message }, { status: 500 })
  }

  const { data: latestLayout, error: latestLayoutError } = await supabase
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
      notes,
      created_at
    `)
    .eq('assignment_id', assignmentId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestLayoutError) {
    return NextResponse.json({ error: latestLayoutError.message }, { status: 500 })
  }

  const { data: activeLayout, error: activeLayoutError } = await supabase
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
      notes,
      created_at
    `)
    .eq('assignment_id', assignmentId)
    .eq('is_active', true)
    .maybeSingle()

  if (activeLayoutError) {
    return NextResponse.json({ error: activeLayoutError.message }, { status: 500 })
  }

  const { data: layoutVersions, error: versionsError } = await supabase
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
      notes,
      created_at
    `)
    .eq('assignment_id', assignmentId)
    .order('version', { ascending: false })

  if (versionsError) {
    return NextResponse.json({ error: versionsError.message }, { status: 500 })
  }

  const { data: answerKey, error: answerKeyError } = await supabase
    .from('assignment_answer_keys')
    .select(`
      assignment_id,
      updated_at,
      source_pdf_path,
      generation_status,
      generated_by_ai,
      approved_by,
      approved_at,
      approval_status,
      source_file_id,
      ai_model,
      generation_notes,
      last_generation_error,
      grading_config,
      answer_key
    `)
    .eq('assignment_id', assignmentId)
    .maybeSingle()

  if (answerKeyError) {
    return NextResponse.json({ error: answerKeyError.message }, { status: 500 })
  }

  const { data: summaryView, error: summaryViewError } = await supabase
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

  if (summaryViewError) {
    return NextResponse.json({ error: summaryViewError.message }, { status: 500 })
  }

  const { data: submissions, error: submissionsError } = await supabase
    .from('submissions')
    .select('id, status, total_score')
    .eq('assignment_id', assignmentId)

  if (submissionsError) {
    return NextResponse.json({ error: submissionsError.message }, { status: 500 })
  }

  const rows = submissions ?? []
  const fallbackSubmissionCount = rows.length
  const fallbackNeedsReviewCount = rows.filter((r: any) => r.status === 'needs_review').length
  const fallbackGradedCount = rows.filter((r: any) => r.status === 'graded').length
  const fallbackAvgTotalScore =
    fallbackSubmissionCount > 0
      ? rows.reduce((sum: number, r: any) => sum + Number(r.total_score ?? 0), 0) /
        fallbackSubmissionCount
      : 0

  const summary = {
    submission_count: summaryView?.submission_count ?? fallbackSubmissionCount,
    needs_review_count: summaryView?.needs_review_count ?? fallbackNeedsReviewCount,
    graded_count: summaryView?.graded_count ?? fallbackGradedCount,
    uploaded_count: summaryView?.uploaded_count ?? 0,
    ocr_pending_count: summaryView?.ocr_pending_count ?? 0,
    extract_pending_count: summaryView?.extract_pending_count ?? 0,
    grade_pending_count: summaryView?.grade_pending_count ?? 0,
    avg_total_score: Number(
      Number(summaryView?.avg_total_score ?? fallbackAvgTotalScore).toFixed(2)
    ),
  }

  return NextResponse.json({
    assignment,
    section: section ?? null,
    sourcePdf: sourcePdfRow
      ? {
          exists: true,
          id: sourcePdfRow.id,
          assignment_id: sourcePdfRow.assignment_id,
          file_kind: sourcePdfRow.file_kind,
          storage_path: sourcePdfRow.storage_path,
          original_filename: sourcePdfRow.original_filename,
          mime_type: sourcePdfRow.mime_type,
          file_size_bytes: sourcePdfRow.file_size_bytes,
          uploaded_at: sourcePdfRow.uploaded_at,
          is_active: sourcePdfRow.is_active,
        }
      : {
          exists: false,
          id: null,
          assignment_id: null,
          file_kind: null,
          storage_path: null,
          original_filename: null,
          mime_type: null,
          file_size_bytes: null,
          uploaded_at: null,
          is_active: false,
        },
    layoutSpec: activeLayout ?? latestLayout ?? null,
    activeLayoutSpec: activeLayout ?? null,
    latestLayoutSpec: latestLayout ?? null,
    layoutVersions: layoutVersions ?? [],
    answerKey: answerKey
      ? {
          exists: true,
          updated_at: answerKey.updated_at,
          source_pdf_path: answerKey.source_pdf_path,
          source_file_id: answerKey.source_file_id,
          generation_status: answerKey.generation_status,
          generated_by_ai: answerKey.generated_by_ai,
          ai_model: answerKey.ai_model,
          approval_status: answerKey.approval_status,
          approved_by: answerKey.approved_by,
          approved_at: answerKey.approved_at,
          generation_notes: answerKey.generation_notes,
          last_generation_error: answerKey.last_generation_error,
          grading_config: answerKey.grading_config ?? null,
          item_count: Array.isArray((answerKey as any).answer_key?.items)
            ? (answerKey as any).answer_key.items.length
            : 0,
        }
      : {
          exists: false,
          updated_at: null,
          source_pdf_path: null,
          source_file_id: null,
          generation_status: 'not_started',
          generated_by_ai: false,
          ai_model: null,
          approval_status: 'draft',
          approved_by: null,
          approved_at: null,
          generation_notes: null,
          last_generation_error: null,
          grading_config: null,
          item_count: 0,
        },
    summary,
  })
}