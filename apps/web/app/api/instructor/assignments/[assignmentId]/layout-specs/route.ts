import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireInstructorAssignmentAccess } from '@/lib/instructor-permissions'

export const runtime = 'nodejs'

function validateLayoutData(layoutData: any, assignmentId: string) {
  if (!layoutData || typeof layoutData !== 'object') {
    return 'layout_data is required'
  }

  if (layoutData.schema_version !== 2) {
    return 'layout_data.schema_version must be 2'
  }

  if (layoutData.assignment_id && layoutData.assignment_id !== assignmentId) {
    return 'layout_data.assignment_id does not match assignmentId'
  }

  if (layoutData.default_coordinate_space !== 'normalized') {
    return 'layout_data.default_coordinate_space must be normalized'
  }

  if (!Array.isArray(layoutData.pages)) {
    return 'layout_data.pages must be an array'
  }

  for (const page of layoutData.pages) {
    if (typeof page.page_number !== 'number') {
      return 'each page must have page_number'
    }

    if (!Array.isArray(page.regions)) {
      return page ${page.page_number} must have regions[]
    }

    for (const region of page.regions) {
      if (!region.id) return page ${page.page_number}: region id is required
      if (!region.kind) return page ${page.page_number}: region kind is required

      const hasBBox = Array.isArray(region.bbox_norm) && region.bbox_norm.length === 4
      const hasPolygon =
        Array.isArray(region.polygon_norm) && region.polygon_norm.length >= 3

      if (!hasBBox && !hasPolygon) {
        return page ${page.page_number}: region ${region.id} must have bbox_norm or polygon_norm
      }

      if (region.kind === 'answer' && region.question_no == null) {
        return page ${page.page_number}: answer region ${region.id} must have question_no
      }

      if (hasBBox) {
        const [x, y, w, h] = region.bbox_norm
        const nums = [x, y, w, h]
        if (nums.some((n: number) => typeof n !== 'number' || n < 0 || n > 1)) {
          return page ${page.page_number}: region ${region.id} bbox_norm must be in [0,1]
        }
        if (w <= 0 || h <= 0) {
          return page ${page.page_number}: region ${region.id} bbox_norm width/height must be > 0
        }
      }
    }
  }

  return null
}

export async function POST(
  req: Request,
  context: { params: Promise<{ assignmentId: string }> }
) {
  const { assignmentId } = await context.params

  const access = await requireInstructorAssignmentAccess(assignmentId)
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const userId = access.userId!
  const supabase = await createClient()

  const body = await req.json()
  const specName = String(body.spec_name ?? '').trim()
  const notes = body.notes ? String(body.notes) : null
  const layoutData = body.layout_data

  if (!specName) {
    return NextResponse.json({ error: 'spec_name is required' }, { status: 400 })
  }

  const validationError = validateLayoutData(layoutData, assignmentId)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const { data: latest, error: latestError } = await supabase
    .from('assignment_layout_specs')
    .select('version')
    .eq('assignment_id', assignmentId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestError) {
    return NextResponse.json({ error: latestError.message }, { status: 500 })
  }

  const nextVersion = Number(latest?.version ?? 0) + 1

  const { data: created, error: createError } = await supabase
    .from('assignment_layout_specs')
    .insert({
      assignment_id: assignmentId,
      version: nextVersion,
      is_active: false,
      layout_data: layoutData,
      created_by: userId,
      schema_version: 2,
      spec_name: specName,
      page_count: Number(layoutData.page_count ?? layoutData.pages?.length ?? 1),
      layout_status: 'draft',
      approved_by: null,
      approved_at: null,
      notes,
    })
    .select(`
      id,
      assignment_id,
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
    .single()

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    layout_spec: created,
  })
}