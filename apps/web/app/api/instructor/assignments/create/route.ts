import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

async function canCreateInSection(
  supabase: any,
  userId: string,
  role: string,
  sectionId: string
) {
  if (role === 'admin') return true

  if (role === 'instructor') {
    const { data } = await supabase
      .from('instructor_sections')
      .select('section_id')
      .eq('instructor_id', userId)
      .eq('section_id', sectionId)
      .maybeSingle()

    return !!data
  }

  return false
}

export async function POST(req: Request) {
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

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.section_id) {
    return NextResponse.json({ error: 'section_id is required' }, { status: 400 })
  }

  if (!body.title || String(body.title).trim().length === 0) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const allowed = await canCreateInSection(supabase, user.id, role, body.section_id)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const payload = {
    section_id: body.section_id,
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
    created_by: user.id,
    is_archived: false,
  }

  const { data, error } = await supabase
    .from('assignments')
    .insert(payload)
    .select(`
      id,
      section_id,
      title,
      assignment_type,
      week_number,
      class_date,
      open_at,
      due_at,
      close_at,
      end_of_friday_at,
      created_by,
      is_archived,
      created_at
    `)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, item: data })
}