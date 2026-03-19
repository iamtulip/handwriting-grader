//apps/web/app/api/instructor/assignments/[assignmentId]/source-pdf/route.ts
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

  const { data: access } = await supabase
    .from('instructor_sections')
    .select('id')
    .eq('instructor_id', userId)
    .eq('section_id', assignment.section_id)
    .maybeSingle()

  return !!access
}

export async function POST(
  req: Request,
  { params }: { params: { assignmentId: string } }
) {
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

  const assignmentId = params.assignmentId
  const allowed = await canManageAssignment(supabase, user.id, role, assignmentId)

  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }

  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 })
  }

  if (file.size <= 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 })
  }

  const maxBytes = 25 * 1024 * 1024
  if (file.size > maxBytes) {
    return NextResponse.json({ error: 'File too large (max 25 MB)' }, { status: 400 })
  }

  const timestamp = Date.now()
  const safeName = file.name.replace(/[^\w.\-]+/g, '_')
  const storagePath = `assignments/${assignmentId}/source/${timestamp}_${safeName}`

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error: uploadError } = await supabase.storage
    .from('exam-papers')
    .upload(storagePath, buffer, {
      contentType: 'application/pdf',
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

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

  const { data: row, error: insertError } = await supabase
    .from('assignment_source_files')
    .insert({
      assignment_id: assignmentId,
      file_kind: 'source_pdf',
      storage_path: storagePath,
      original_filename: file.name,
      mime_type: file.type,
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
      is_active,
      uploaded_at
    `)
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    file: row,
  })
}

export async function DELETE(
  req: Request,
  { params }: { params: { assignmentId: string } }
) {
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

  const assignmentId = params.assignmentId
  const allowed = await canManageAssignment(supabase, user.id, role, assignmentId)

  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: activeFile, error: fetchError } = await supabase
    .from('assignment_source_files')
    .select('id, storage_path')
    .eq('assignment_id', assignmentId)
    .eq('file_kind', 'source_pdf')
    .eq('is_active', true)
    .maybeSingle()

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  if (!activeFile) {
    return NextResponse.json({ error: 'No active source PDF found' }, { status: 404 })
  }

  const { error: storageError } = await supabase.storage
    .from('exam-papers')
    .remove([activeFile.storage_path])

  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 500 })
  }

  const { error: updateError } = await supabase
    .from('assignment_source_files')
    .update({
      is_active: false,
      replaced_at: new Date().toISOString(),
    })
    .eq('id', activeFile.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}