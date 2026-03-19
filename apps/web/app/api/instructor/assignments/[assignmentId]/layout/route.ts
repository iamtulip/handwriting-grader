import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { AssignmentLayoutDataV2 } from '@/types/layout-spec'

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

  const { data: access } = await supabase
    .from('instructor_sections')
    .select('id')
    .eq('instructor_id', userId)
    .eq('section_id', assignment.section_id)
    .maybeSingle()

  return !!access
}

function validateLayoutData(layout: AssignmentLayoutDataV2) {
  if (!layout) return 'Missing layout_data'
  if (layout.schema_version !== 2) return 'schema_version must be 2'
  if (!Array.isArray(layout.pages)) return 'pages must be an array'

  const regionIds = new Set<string>()

  for (const page of layout.pages) {
    if (typeof page.page_number !== 'number') return 'Invalid page_number'
    if (!Array.isArray(page.regions)) return 'regions must be an array'

    for (const region of page.regions) {
      if (!region.id?.trim()) return 'Each region must have id'
      if (regionIds.has(region.id)) return `Duplicate region id: ${region.id}`
      regionIds.add(region.id)

      if (!region.kind) return `Region ${region.id} missing kind`

      if (!region.bbox_norm && !region.polygon_norm) {
        return `Region ${region.id} must have bbox_norm or polygon_norm`
      }

      if (region.bbox_norm) {
        const [x1, y1, x2, y2] = region.bbox_norm
        if ([x1, y1, x2, y2].some((v) => typeof v !== 'number' || v < 0 || v > 1)) {
          return `Region ${region.id} has invalid bbox_norm`
        }
      }

      if (region.kind === 'identity' && !region.identity_type) {
        return `Identity region ${region.id} must have identity_type`
      }

      if ((region.kind === 'answer' || region.kind === 'table_cell') && !region.question_no) {
        return `Answer region ${region.id} must have question_no`
      }
    }
  }

  return null
}

export async function GET(
  _: Request,
  { params }: { params: { assignmentId: string } }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  if (!allowed && role !== 'reviewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, title, section_id, assignment_type')
    .eq('id', assignmentId)
    .maybeSingle()

  if (!assignment) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  }

  const { data: spec } = await supabase
    .from('assignment_layout_specs')
    .select(`
      id,
      assignment_id,
      version,
      is_active,
      schema_version,
      spec_name,
      page_count,
      layout_status,
      layout_data,
      approved_by,
      approved_at,
      notes,
      created_at
    `)
    .eq('assignment_id', assignmentId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    assignment,
    spec: spec ?? null,
  })
}

export async function POST(
  req: Request,
  { params }: { params: { assignmentId: string } }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const role = me?.role ?? 'student'
  if (!['instructor', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const assignmentId = params.assignmentId
  const allowed = await canManageAssignment(supabase, user.id, role, assignmentId)

  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: {
    layout_data: AssignmentLayoutDataV2
    spec_name?: string
    notes?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const errorMessage = validateLayoutData(body.layout_data)
  if (errorMessage) {
    return NextResponse.json({ error: errorMessage }, { status: 400 })
  }

  const { data: latest } = await supabase
    .from('assignment_layout_specs')
    .select('version')
    .eq('assignment_id', assignmentId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextVersion = (latest?.version ?? 0) + 1

  const { data, error } = await supabase
    .from('assignment_layout_specs')
    .insert({
      assignment_id: assignmentId,
      version: nextVersion,
      is_active: false,
      schema_version: 2,
      spec_name: body.spec_name ?? `Spec v${nextVersion}`,
      page_count: body.layout_data.page_count ?? body.layout_data.pages.length,
      layout_status: 'staff_defined',
      layout_data: body.layout_data,
      created_by: user.id,
      notes: body.notes ?? null,
    })
    .select(`
      id,
      assignment_id,
      version,
      is_active,
      schema_version,
      spec_name,
      page_count,
      layout_status
    `)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    spec: data,
  })
}