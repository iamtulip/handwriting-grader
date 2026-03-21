//apps/web/app/api/instructor/assignments/[assignmentId]/files/[fileId]/route.ts
//apps/web/app/api/instructor/assignments/[assignmentId]/files/[fileId]/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const BUCKET = 'assignment-source-files'

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

  if (
    assignment.created_by_user_id === userId ||
    assignment.created_by === userId
  ) {
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

export async function DELETE(
  _: Request,
  context: { params: Promise<{ assignmentId: string; fileId: string }> }
) {
  const { assignmentId, fileId } = await context.params
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

  const role = me?.role ?? 'student'
  if (!['instructor', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const allowed = await canManageAssignment(supabase, user.id, role, assignmentId)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: fileRow, error: fetchError } = await supabase
    .from('assignment_source_files')
    .select('id, assignment_id, storage_path')
    .eq('id', fileId)
    .eq('assignment_id', assignmentId)
    .maybeSingle()

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  if (!fileRow) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([fileRow.storage_path])

  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 500 })
  }

  const { error: deleteError } = await supabase
    .from('assignment_source_files')
    .delete()
    .eq('id', fileId)
    .eq('assignment_id', assignmentId)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}