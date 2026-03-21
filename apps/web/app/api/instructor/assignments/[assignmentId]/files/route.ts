//apps/web/app/api/instructor/assignments/[assignmentId]/files/route.ts
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

export async function GET(
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

  const role = me?.role ?? 'student'
  if (!['instructor', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const allowed = await canManageAssignment(supabase, user.id, role, assignmentId)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: files, error } = await supabase
    .from('assignment_source_files')
    .select(`
      id,
      assignment_id,
      file_kind,
      storage_path,
      original_filename,
      mime_type,
      file_size_bytes,
      uploaded_by,
      is_active,
      uploaded_at,
      replaced_at
    `)
    .eq('assignment_id', assignmentId)
    .order('uploaded_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: files ?? [] })
}

export async function POST(
  req: Request,
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

  const role = me?.role ?? 'student'
  if (!['instructor', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const allowed = await canManageAssignment(supabase, user.id, role, assignmentId)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file')
  const fileKind = String(formData.get('file_kind') ?? 'source_pdf')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }

  const allowedKinds = ['source_pdf', 'answer_key_pdf', 'supporting_doc']
  if (!allowedKinds.includes(fileKind)) {
    return NextResponse.json({ error: 'Invalid file_kind' }, { status: 400 })
  }

  if (file.size <= 0) {
    return NextResponse.json({ error: 'Empty file is not allowed' }, { status: 400 })
  }

  const ext =
    file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() ?? 'bin' : 'bin'

  const safeName = file.name.replace(/[^\w.\-ก-๙ ]/g, '_')
  const storagePath = `${assignmentId}/${fileKind}/${Date.now()}-${safeName}`

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  if (fileKind === 'source_pdf') {
    const { error: deactivateError } = await supabase
      .from('assignment_source_files')
      .update({
        is_active: false,
        replaced_at: new Date().toISOString(),
      })
      .eq('assignment_id', assignmentId)
      .eq('file_kind', 'source_pdf')
      .eq('is_active', true)

    if (deactivateError) {
      return NextResponse.json({ error: deactivateError.message }, { status: 500 })
    }
  }

  const { data, error: insertError } = await supabase
    .from('assignment_source_files')
    .insert({
      assignment_id: assignmentId,
      file_kind: fileKind,
      storage_path: storagePath,
      original_filename: file.name,
      mime_type: file.type || `application/${ext}`,
      file_size_bytes: file.size,
      uploaded_by: user.id,
      is_active: true,
    })
    .select(`
      id,
      assignment_id,
      file_kind,
      storage_path,
      original_filename,
      mime_type,
      file_size_bytes,
      uploaded_by,
      is_active,
      uploaded_at,
      replaced_at
    `)
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, item: data })
}