import { createClient } from '@/lib/supabase/server'

export type InstructorAccessResult = {
  ok: boolean
  status: number
  error?: string
  userId?: string
  role?: string
  assignment?: {
    id: string
    section_id: string | null
    created_by_user_id: string | null
    title?: string | null
  }
}

export async function requireInstructorAssignmentAccess(
  assignmentId: string
): Promise<InstructorAccessResult> {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  const { data: me, error: meError } = await supabase
    .from('user_profiles')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (meError) {
    return { ok: false, status: 500, error: meError.message }
  }

  const role = me?.role ?? 'student'
  if (!['instructor', 'admin'].includes(role)) {
    return { ok: false, status: 403, error: 'Forbidden' }
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from('assignments')
    .select('id, section_id, created_by_user_id, title')
    .eq('id', assignmentId)
    .maybeSingle()

  if (assignmentError) {
    return { ok: false, status: 500, error: assignmentError.message }
  }

  if (!assignment) {
    return { ok: false, status: 404, error: 'Assignment not found' }
  }

  if (role === 'admin') {
    return {
      ok: true,
      status: 200,
      userId: user.id,
      role,
      assignment,
    }
  }

  if (!assignment.section_id) {
    return { ok: false, status: 403, error: 'Assignment has no section' }
  }

  const { data: link, error: linkError } = await supabase
    .from('instructor_sections')
    .select('id')
    .eq('instructor_id', user.id)
    .eq('section_id', assignment.section_id)
    .maybeSingle()

  if (linkError) {
    return { ok: false, status: 500, error: linkError.message }
  }

  if (!link) {
    return { ok: false, status: 403, error: 'You do not have access to this assignment' }
  }

  return {
    ok: true,
    status: 200,
    userId: user.id,
    role,
    assignment,
  }
}