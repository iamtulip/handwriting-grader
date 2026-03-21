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

function defaultLayoutData() {
  return {
    schema_version: 2,
    document_type: 'worksheet',
    page_count: 1,
    settings: {
      allow_multi_roi_per_question: true,
      enable_identity_verification: true,
    },
    pages: [
      {
        page_number: 1,
        rois: [],
      },
    ],
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

  const { data: specs, error } = await supabase
    .from('assignment_layout_specs')
    .select(`
      id,
      assignment_id,
      version,
      is_active,
      layout_data,
      created_by,
      created_at,
      schema_version,
      spec_name,
      page_count,
      layout_status,
      approved_by,
      approved_at,
      notes
    `)
    .eq('assignment_id', assignmentId)
    .order('version', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const items = specs ?? []
  const active = items.find((x) => x.is_active) ?? items[0] ?? null

  return NextResponse.json({
    items,
    active,
  })
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

  const action = body.action ?? 'create'

  if (action === 'create') {
    const { data: latest } = await supabase
      .from('assignment_layout_specs')
      .select('version')
      .eq('assignment_id', assignmentId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextVersion = Number(latest?.version ?? 0) + 1
    const layoutData = body.layout_data ?? defaultLayoutData()
    const pageCount =
      body.page_count ??
      layoutData?.page_count ??
      (Array.isArray(layoutData?.pages) ? layoutData.pages.length : 1)

    const { data, error } = await supabase
      .from('assignment_layout_specs')
      .insert({
        assignment_id: assignmentId,
        version: nextVersion,
        is_active: false,
        layout_data: layoutData,
        created_by: user.id,
        schema_version: 2,
        spec_name: body.spec_name ?? `Layout v${nextVersion}`,
        page_count: pageCount,
        layout_status: 'draft',
        notes: body.notes ?? null,
      })
      .select(`
        id,
        assignment_id,
        version,
        is_active,
        layout_data,
        created_by,
        created_at,
        schema_version,
        spec_name,
        page_count,
        layout_status,
        approved_by,
        approved_at,
        notes
      `)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, item: data })
  }

  if (action === 'save') {
    if (!body.spec_id) {
      return NextResponse.json({ error: 'spec_id is required' }, { status: 400 })
    }

    if (!body.layout_data || typeof body.layout_data !== 'object') {
      return NextResponse.json({ error: 'layout_data object is required' }, { status: 400 })
    }

    const pageCount =
      body.page_count ??
      body.layout_data?.page_count ??
      (Array.isArray(body.layout_data?.pages) ? body.layout_data.pages.length : 1)

    const { data, error } = await supabase
      .from('assignment_layout_specs')
      .update({
        layout_data: body.layout_data,
        spec_name: body.spec_name ?? null,
        page_count: pageCount,
        notes: body.notes ?? null,
        layout_status: body.layout_status ?? 'draft',
      })
      .eq('id', body.spec_id)
      .eq('assignment_id', assignmentId)
      .select(`
        id,
        assignment_id,
        version,
        is_active,
        layout_data,
        created_by,
        created_at,
        schema_version,
        spec_name,
        page_count,
        layout_status,
        approved_by,
        approved_at,
        notes
      `)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, item: data })
  }

  if (action === 'approve') {
    if (!body.spec_id) {
      return NextResponse.json({ error: 'spec_id is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('assignment_layout_specs')
      .update({
        layout_status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', body.spec_id)
      .eq('assignment_id', assignmentId)
      .select(`
        id,
        assignment_id,
        version,
        is_active,
        layout_data,
        created_by,
        created_at,
        schema_version,
        spec_name,
        page_count,
        layout_status,
        approved_by,
        approved_at,
        notes
      `)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, item: data })
  }

  if (action === 'set_active') {
    if (!body.spec_id) {
      return NextResponse.json({ error: 'spec_id is required' }, { status: 400 })
    }

    const { error: deactivateError } = await supabase
      .from('assignment_layout_specs')
      .update({ is_active: false })
      .eq('assignment_id', assignmentId)

    if (deactivateError) {
      return NextResponse.json({ error: deactivateError.message }, { status: 500 })
    }

    const { data, error } = await supabase
      .from('assignment_layout_specs')
      .update({ is_active: true })
      .eq('id', body.spec_id)
      .eq('assignment_id', assignmentId)
      .select(`
        id,
        assignment_id,
        version,
        is_active,
        layout_data,
        created_by,
        created_at,
        schema_version,
        spec_name,
        page_count,
        layout_status,
        approved_by,
        approved_at,
        notes
      `)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, item: data })
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
}