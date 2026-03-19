//apps/web/app/api/instructor/assignments/[assignmentId]/answer-key/route.ts
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
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase
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

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ item: data ?? null })
}

export async function PATCH(
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
  const allowed = await canManageAssignment(supabase, user.id, role, assignmentId)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: {
    action: 'approve' | 'reject' | 'manual_replace'
    answer_key?: any
    grading_config?: any
    generation_notes?: string | null
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 })
  }

  if (body.action === 'approve') {
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
        approval_status,
        approved_by,
        approved_at,
        updated_at
      `)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, item: data })
  }

  if (body.action === 'reject') {
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
        approval_status,
        generation_notes,
        updated_at
      `)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, item: data })
  }

  if (body.action === 'manual_replace') {
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
        generation_status,
        generated_by_ai,
        approval_status,
        generation_notes,
        updated_at
      `)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, item: data })
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
}