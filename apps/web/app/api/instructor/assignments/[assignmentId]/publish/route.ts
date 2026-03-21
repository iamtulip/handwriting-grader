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

  if (assignment.created_by_user_id === userId || assignment.created_by === userId) {
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

  return false
}

export async function POST(
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

  const myRole = me?.role ?? 'student'
  if (!['instructor', 'admin'].includes(myRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const allowed = await canManageAssignment(supabase, user.id, myRole, assignmentId)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: updated, error } = await supabase
    .from('submissions')
    .update({
      status: 'published',
      current_stage: 'published_to_student',
      updated_at: new Date().toISOString(),
    })
    .eq('assignment_id', assignmentId)
    .in('status', ['graded', 'published'])
    .select('id, assignment_id, student_id, status, current_stage, total_score')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    published_count: (updated ?? []).length,
    items: updated ?? [],
  })
}