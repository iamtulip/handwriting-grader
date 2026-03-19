//apps/web/app/api/instructor/assignments/[assignmentId]/generate-answer-key/route.ts
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

function buildAnswerKeyFromLayout(layoutData: any) {
  const items: any[] = []

  for (const page of layoutData?.pages ?? []) {
    for (const region of page?.regions ?? []) {
      if (!['answer', 'table_cell'].includes(region.kind)) continue

      items.push({
        roi_id: region.id,
        question_no: region.question_no ?? null,
        subquestion_no: region.subquestion_no ?? null,
        part_no: region.part_no ?? null,
        group_id: region.group_id ?? null,
        page_number: page.page_number,
        expected_value: null,
        points: Number(region.score_weight ?? 1),
        answer_type: region.answer_type ?? layoutData?.settings?.default_answer_type ?? 'number',
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

export async function POST(
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
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const role = me?.role ?? 'student'
  if (!['instructor', 'reviewer', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const assignmentId = params.assignmentId
  const allowed = await canManageAssignment(supabase, user.id, role, assignmentId)

  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: activePdf } = await supabase
    .from('assignment_source_files')
    .select('id, original_filename, storage_path')
    .eq('assignment_id', assignmentId)
    .eq('file_kind', 'source_pdf')
    .eq('is_active', true)
    .maybeSingle()

  if (!activePdf) {
    return NextResponse.json(
      { error: 'Source PDF is required before generating answer key' },
      { status: 400 }
    )
  }

  const { data: activeSpec } = await supabase
    .from('assignment_layout_specs')
    .select('id, version, layout_status, layout_data')
    .eq('assignment_id', assignmentId)
    .eq('is_active', true)
    .maybeSingle()

  if (!activeSpec) {
    return NextResponse.json(
      { error: 'Approved/active layout spec is required before generating answer key' },
      { status: 400 }
    )
  }

  const answerKey = buildAnswerKeyFromLayout(activeSpec.layout_data)
  const gradingConfig = buildGradingConfig(activeSpec.layout_data)

  const payload = {
    assignment_id: assignmentId,
    answer_key: answerKey,
    grading_config: gradingConfig,
    source_file_id: activePdf.id,
    generation_status: 'generated',
    generated_by_ai: true,
    ai_model: 'layout_scaffold_v1',
    approval_status: 'ai_generated',
    generation_notes:
      'MVP scaffold generated from active layout spec. expected_value fields are placeholders until AI solving/manual fill.',
    last_generation_error: null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('assignment_answer_keys')
    .upsert(payload, { onConflict: 'assignment_id' })
    .select(`
      assignment_id,
      updated_at,
      generation_status,
      generated_by_ai,
      ai_model,
      approval_status,
      generation_notes
    `)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    answerKey: data,
    preview: {
      item_count: Array.isArray(answerKey.items) ? answerKey.items.length : 0,
      first_items: answerKey.items.slice(0, 5),
    },
  })
}