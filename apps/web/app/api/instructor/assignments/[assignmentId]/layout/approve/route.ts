//apps/web/app/api/instructor/assignments/[assignmentId]/layout/approve/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

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
  if (!['instructor', 'reviewer', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const assignmentId = params.assignmentId

  let body: { spec_id: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.spec_id) {
    return NextResponse.json({ error: 'spec_id is required' }, { status: 400 })
  }

  const { error: deactivateError } = await supabase
    .from('assignment_layout_specs')
    .update({
      is_active: false,
      layout_status: 'archived',
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
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', body.spec_id)
    .eq('assignment_id', assignmentId)
    .select('id, version, is_active, layout_status, approved_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    spec: data,
  })
}