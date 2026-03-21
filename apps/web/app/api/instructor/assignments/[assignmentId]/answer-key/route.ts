import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

async function canManageAssignment(
  supabase: any,
  userId: string,
  role: string,
  assignmentId: string
) {
  if (role === 'admin') return true

  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, section_id, created_by_user_id, created_by')
    .eq('id', assignmentId)
    .maybeSingle()

  if (!assignment) return false

  if (
    assignment.created_by_user_id === userId ||
    assignment.created_by === userId
  ) {
    return true
  }

  if (role === 'instructor') {
    const { data: access } = await supabase
      .from('instructor_sections')
      .select('section_id')
      .eq('instructor_id', userId)
      .eq('section_id', assignment.section_id)
      .maybeSingle()

    return !!access
  }

  if (role === 'reviewer') {
    const { data: access } = await supabase
      .from('reviewer_assignments')
      .select('assignment_id')
      .eq('reviewer_user_id', userId)
      .eq('assignment_id', assignmentId)
      .maybeSingle()

    return !!access
  }

  return false
}

function buildAnswerKeyFromLayout(layoutData: any) {
  const items: any[] = []

  for (const page of layoutData?.pages ?? []) {
    const pageNumber = page?.page_number ?? page?.page ?? 1
    const rois = page?.regions ?? page?.rois ?? []

    for (const region of rois) {
      const kind = region?.kind ?? 'answer'
      if (!['answer', 'table_cell'].includes(kind)) continue

      items.push({
        roi_id: region.id,
        question_no: region.question_no ?? null,
        subquestion_no: region.subquestion_no ?? null,
        part_no: region.part_no ?? null,
        group_id: region.group_id ?? null,
        page_number: pageNumber,
        expected_value: null,
        points: Number(region.score_weight ?? 1),
        answer_type: region.answer_type ?? 'number',
        grader: region.grader ?? {
          mode: 'deterministic',
          tolerance: { abs_tol: 0, rel_tol: 0 },
        },
        source: 'layout_scaffold',
      })
    }
  }

  return {
    schema_version: 1,
    generated_mode: 'layout_scaffold',
    generated_at: new Date().toISOString(),
    items,
  }
}

function buildGradingConfig(layoutData: any) {
  return {
    schema_version: 1,
    document_type: layoutData?.document_type ?? 'worksheet',
    page_count: layoutData?.page_count ?? 1,
    allow_multi_roi_per_question:
      layoutData?.settings?.allow_multi_roi_per_question ?? true,
    enable_identity_verification:
      layoutData?.settings?.enable_identity_verification ?? true,
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
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (meError) {
    return NextResponse.json({ error: meError.message }, { status: 500 })
  }

  const role = me?.role ?? 'student'
  if (!['instructor', 'reviewer', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const allowed = await canManageAssignment(supabase, user.id, role, assignmentId)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('assignment_answer_keys')
    .select(`
      assignment_id,
      answer_key,
      grading_config,
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
      last_generation_error
    `)
    .eq('assignment_id', assignmentId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ item: data ?? null })
}

export async function POST(
  req: Request,
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
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (meError) {
    return NextResponse.json({ error: meError.message }, { status: 500 })
  }

  const role = me?.role ?? 'student'
  if (!['instructor', 'reviewer', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const allowed = await canManageAssignment(supabase, user.id, role, assignmentId)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: any = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const action = body.action ?? 'generate'

  if (action === 'generate') {
    const { data: sourcePdf } = await supabase
      .from('assignment_source_files')
      .select('id, storage_path')
      .eq('assignment_id', assignmentId)
      .eq('file_kind', 'source_pdf')
      .eq('is_active', true)
      .maybeSingle()

    if (!sourcePdf) {
      return NextResponse.json(
        { error: 'Source PDF is required before generating answer key' },
        { status: 400 }
      )
    }

    const { data: activeSpec } = await supabase
      .from('assignment_layout_specs')
      .select('id, layout_data')
      .eq('assignment_id', assignmentId)
      .eq('is_active', true)
      .maybeSingle()

    if (!activeSpec) {
      return NextResponse.json(
        { error: 'Active layout spec is required before generating answer key' },
        { status: 400 }
      )
    }

    const answerKey = buildAnswerKeyFromLayout(activeSpec.layout_data)
    const gradingConfig = buildGradingConfig(activeSpec.layout_data)

    const { data, error } = await supabase
      .from('assignment_answer_keys')
      .upsert(
        {
          assignment_id: assignmentId,
          answer_key: answerKey,
          grading_config: gradingConfig,
          source_file_id: sourcePdf.id,
          source_pdf_path: sourcePdf.storage_path,
          generation_status: 'generated',
          generated_by_ai: true,
          ai_model: 'layout_scaffold_v1',
          approval_status: 'ai_generated',
          generation_notes:
            'MVP scaffold generated from active layout spec.',
          last_generation_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'assignment_id' }
      )
      .select(`
        assignment_id,
        answer_key,
        grading_config,
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
        last_generation_error
      `)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, item: data })
  }

  if (action === 'approve') {
    const { data, error } = await supabase
      .from('assignment_answer_keys')
      .update({
        approval_status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('assignment_id', assignmentId)
      .select(`
        assignment_id,
        answer_key,
        grading_config,
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
        last_generation_error
      `)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, item: data })
  }

  if (action === 'reject') {
    const { data, error } = await supabase
      .from('assignment_answer_keys')
      .update({
        approval_status: 'rejected',
        approved_by: null,
        approved_at: null,
        generation_notes: body.generation_notes ?? 'Rejected by staff',
        updated_at: new Date().toISOString(),
      })
      .eq('assignment_id', assignmentId)
      .select(`
        assignment_id,
        answer_key,
        grading_config,
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
        last_generation_error
      `)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, item: data })
  }

  if (action === 'manual_replace') {
    if (!body.answer_key || typeof body.answer_key !== 'object') {
      return NextResponse.json({ error: 'answer_key object is required' }, { status: 400 })
    }

    const items = Array.isArray(body.answer_key?.items) ? body.answer_key.items : null
    if (!items) {
      return NextResponse.json(
        { error: 'answer_key.items must be an array' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('assignment_answer_keys')
      .upsert(
        {
          assignment_id: assignmentId,
          answer_key: body.answer_key,
          grading_config: body.grading_config ?? {},
          generation_status: 'generated',
          generated_by_ai: false,
          ai_model: null,
          approval_status: 'manual_uploaded',
          approved_by: null,
          approved_at: null,
          generation_notes: body.generation_notes ?? 'Manual answer key uploaded',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'assignment_id' }
      )
      .select(`
        assignment_id,
        answer_key,
        grading_config,
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
        last_generation_error
      `)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, item: data })
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
}