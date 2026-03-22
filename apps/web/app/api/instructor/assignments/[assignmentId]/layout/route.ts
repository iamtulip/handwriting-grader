import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireInstructorAssignmentAccess } from '@/lib/instructor-permissions'
import { validateLayoutDataV2, normalizeLayoutData } from '@/lib/layout-schema'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{
    assignmentId: string
  }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { assignmentId } = await context.params

  const access = await requireInstructorAssignmentAccess(assignmentId)
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error ?? 'Forbidden' },
      { status: access.status }
    )
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('assignment_layout_specs')
    .select('*')
    .eq('assignment_id', assignmentId)
    .order('version', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const items = (data ?? []).map((item) => {
    const { normalized, warnings } = normalizeLayoutData(
      item.layout_data,
      Number(item.page_count ?? 1)
    )

    return {
      ...item,
      layout_data: normalized,
      _normalization_warnings: warnings,
    }
  })

  const active = items.find((item) => item.is_active) ?? null

  return NextResponse.json({
    items,
    active,
  })
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { assignmentId } = await context.params

  const access = await requireInstructorAssignmentAccess(assignmentId)
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error ?? 'Forbidden' },
      { status: access.status }
    )
  }

  const userId = access.userId
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = String(body.action ?? '').trim()

  if (!action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 })
  }

  if (action === 'create') {
    const specName =
      typeof body.spec_name === 'string' && body.spec_name.trim()
        ? body.spec_name.trim()
        : 'Layout Draft'

    const pageCount = Math.max(1, Number(body.page_count ?? 1))
    const validation = validateLayoutDataV2(body.layout_data, {
      pageCountHint: pageCount,
    })

    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const { data: latestSpec, error: latestSpecError } = await supabase
      .from('assignment_layout_specs')
      .select('version')
      .eq('assignment_id', assignmentId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestSpecError) {
      return NextResponse.json({ error: latestSpecError.message }, { status: 500 })
    }

    const nextVersion = Number(latestSpec?.version ?? 0) + 1

    const { data, error } = await supabase
      .from('assignment_layout_specs')
      .insert({
        assignment_id: assignmentId,
        version: nextVersion,
        is_active: false,
        layout_data: validation.normalized,
        created_by: userId,
        schema_version: 2,
        spec_name: specName,
        page_count: pageCount,
        layout_status: 'draft',
        notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
      })
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      item: data,
      warnings: validation.warnings,
    })
  }

  if (action === 'save') {
    const specId = String(body.spec_id ?? '').trim()
    if (!specId) {
      return NextResponse.json({ error: 'spec_id is required' }, { status: 400 })
    }

    const pageCount = Math.max(1, Number(body.page_count ?? 1))
    const validation = validateLayoutDataV2(body.layout_data, {
      pageCountHint: pageCount,
    })

    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const patch: Record<string, any> = {
      layout_data: validation.normalized,
      page_count: pageCount,
      schema_version: 2,
    }

    if (typeof body.spec_name === 'string') {
      patch.spec_name = body.spec_name.trim() || null
    }

    if (typeof body.notes === 'string') {
      patch.notes = body.notes.trim() || null
    }

    if (typeof body.layout_status === 'string' && body.layout_status.trim()) {
      patch.layout_status = body.layout_status.trim()
    }

    const { data, error } = await supabase
      .from('assignment_layout_specs')
      .update(patch)
      .eq('id', specId)
      .eq('assignment_id', assignmentId)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      item: data,
      warnings: validation.warnings,
    })
  }

  if (action === 'approve') {
    const specId = String(body.spec_id ?? '').trim()
    if (!specId) {
      return NextResponse.json({ error: 'spec_id is required' }, { status: 400 })
    }

    const { data: existing, error: existingError } = await supabase
      .from('assignment_layout_specs')
      .select('*')
      .eq('id', specId)
      .eq('assignment_id', assignmentId)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 })
    }

    if (!existing) {
      return NextResponse.json({ error: 'Layout spec not found' }, { status: 404 })
    }

    const validation = validateLayoutDataV2(existing.layout_data, {
      pageCountHint: Number(existing.page_count ?? 1),
    })

    if (!validation.ok) {
      return NextResponse.json(
        { error: `Cannot approve invalid layout: ${validation.error}` },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('assignment_layout_specs')
      .update({
        layout_data: validation.normalized,
        layout_status: 'approved',
        approved_by: userId,
        approved_at: new Date().toISOString(),
        schema_version: 2,
      })
      .eq('id', specId)
      .eq('assignment_id', assignmentId)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      item: data,
      warnings: validation.warnings,
    })
  }

  if (action === 'set_active') {
    const specId = String(body.spec_id ?? '').trim()
    if (!specId) {
      return NextResponse.json({ error: 'spec_id is required' }, { status: 400 })
    }

    const { data: existing, error: existingError } = await supabase
      .from('assignment_layout_specs')
      .select('*')
      .eq('id', specId)
      .eq('assignment_id', assignmentId)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 })
    }

    if (!existing) {
      return NextResponse.json({ error: 'Layout spec not found' }, { status: 404 })
    }

    const validation = validateLayoutDataV2(existing.layout_data, {
      pageCountHint: Number(existing.page_count ?? 1),
    })

    if (!validation.ok) {
      return NextResponse.json(
        { error: `Cannot activate invalid layout: ${validation.error}` },
        { status: 400 }
      )
    }

    if (existing.layout_status !== 'approved') {
      return NextResponse.json(
        { error: 'Only approved layout specs can be activated' },
        { status: 400 }
      )
    }

    const { error: deactivateError } = await supabase
      .from('assignment_layout_specs')
      .update({
        is_active: false,
      })
      .eq('assignment_id', assignmentId)
      .eq('is_active', true)

    if (deactivateError) {
      return NextResponse.json({ error: deactivateError.message }, { status: 500 })
    }

    const { data, error } = await supabase
      .from('assignment_layout_specs')
      .update({
        is_active: true,
        layout_status: 'approved',
        layout_data: validation.normalized,
        schema_version: 2,
      })
      .eq('id', specId)
      .eq('assignment_id', assignmentId)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      item: data,
      warnings: validation.warnings,
    })
  }

  return NextResponse.json(
    { error: `Unsupported action: ${action}` },
    { status: 400 }
  )
}