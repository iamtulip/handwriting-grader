//apps/web/app/api/instructor/assignments/[assignmentId]/manage/route.ts
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
    .select('id, section_id, created_by')
    .eq('id', assignmentId)
    .maybeSingle()

  if (!assignment) return false

  if (assignment.created_by === userId) return true

  if (role === 'instructor') {
    const { data: access } = await supabase
      .from('instructor_sections')
      .select('section_id')
      .eq('instructor_id', userId)
      .eq('section_id', assignment.section_id)
      .maybeSingle()

    return !!access
  }

  return false
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ assignmentId: string }> }
) {
  const { assignmentId } = await context.params
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
  if (!['instructor', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const allowed = await canManageAssignment(supabase, user.id, role, assignmentId)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body.action === 'archive') {
    const { data, error } = await supabase
      .from('assignments')
      .update({
        is_archived: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assignmentId)
      .select('id, is_archived, updated_at')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, item: data })
  }

  if (body.action === 'unarchive') {
    const { data, error } = await supabase
      .from('assignments')
      .update({
        is_archived: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assignmentId)
      .select('id, is_archived, updated_at')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, item: data })
  }

  if (!body.title || String(body.title).trim().length === 0) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const payload = {
    title: String(body.title).trim(),
    description: body.description ? String(body.description) : null,
    assignment_type: body.assignment_type ?? 'weekly_exercise',
    week_number:
      body.week_number === null || body.week_number === '' || body.week_number === undefined
        ? null
        : Number(body.week_number),
    class_date: body.class_date || null,
    open_at: body.open_at || null,
    due_at: body.due_at || null,
    close_at: body.close_at || null,
    end_of_friday_at: body.end_of_friday_at || null,
    updated_at: new Date().toISOString(),
    is_online_class: Boolean(body.is_online_class ?? false),
  }

  const { data, error } = await supabase
    .from('assignments')
    .update(payload)
    .eq('id', assignmentId)
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
      is_archived,
      updated_at,
      is_online_class,
    `)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, item: data })
}

export async function DELETE(
  _: Request,
  context: { params: Promise<{ assignmentId: string }> }
) {
  const { assignmentId } = await context.params
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
  if (!['instructor', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const allowed = await canManageAssignment(supabase, user.id, role, assignmentId)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { count: submissionCount, error: submissionCountError } = await supabase
    .from('submissions')
    .select('id', { count: 'exact', head: true })
    .eq('assignment_id', assignmentId)

  if (submissionCountError) {
    return NextResponse.json({ error: submissionCountError.message }, { status: 500 })
  }

  if ((submissionCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          'ไม่สามารถลบ assignment นี้ได้ เพราะมี submissions อยู่แล้ว กรุณาใช้ archive แทน',
      },
      { status: 400 }
    )
  }

  await supabase.from('assignment_source_files').delete().eq('assignment_id', assignmentId)
  await supabase.from('assignment_answer_keys').delete().eq('assignment_id', assignmentId)
  await supabase.from('assignment_layout_specs').delete().eq('assignment_id', assignmentId)

  const { error } = await supabase.from('assignments').delete().eq('id', assignmentId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}