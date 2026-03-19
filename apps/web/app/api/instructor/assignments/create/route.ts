import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type CreateAssignmentBody = {
  section_id: string
  title: string
  assignment_type: 'weekly_exercise' | 'quiz' | 'midterm' | 'final'
  week_number?: number | null
  class_date?: string | null
  open_at?: string | null
  due_at?: string | null
  close_at?: string | null
  end_of_friday_at?: string | null
  description?: string | null
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
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle()

  const myRole = me?.role ?? 'student'
  if (!['instructor', 'admin'].includes(myRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: CreateAssignmentBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    section_id,
    title,
    assignment_type,
    week_number,
    class_date,
    open_at,
    due_at,
    close_at,
    end_of_friday_at,
    description,
  } = body

  if (!section_id?.trim()) {
    return NextResponse.json({ error: 'section_id is required' }, { status: 400 })
  }

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const allowedTypes = ['weekly_exercise', 'quiz', 'midterm', 'final']
  if (!allowedTypes.includes(assignment_type)) {
    return NextResponse.json({ error: 'Invalid assignment_type' }, { status: 400 })
  }

  if (myRole !== 'admin') {
    const { data: access } = await supabase
      .from('instructor_sections')
      .select('id')
      .eq('instructor_id', user.id)
      .eq('section_id', section_id)
      .maybeSingle()

    if (!access) {
      return NextResponse.json(
        { error: 'You do not have permission for this section' },
        { status: 403 }
      )
    }
  }

  const payload = {
    section_id,
    title: title.trim(),
    description: description?.trim() || null,
    assignment_type,
    week_number: week_number ?? null,
    class_date: class_date || null,
    open_at: open_at || null,
    due_at: due_at || null,
    close_at: close_at || null,
    end_of_friday_at: end_of_friday_at || null,
    created_by: user.id,
  }

  const { data, error } = await supabase
    .from('assignments')
    .insert(payload)
    .select('id, title, section_id, assignment_type, week_number, class_date')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    item: data,
  })
}