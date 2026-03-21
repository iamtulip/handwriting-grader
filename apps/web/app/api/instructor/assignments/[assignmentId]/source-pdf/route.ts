//apps/web/app/api/instructor/assignments/[assignmentId]/source-pdf/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireInstructorAssignmentAccess } from '@/lib/instructor-permissions'

export const runtime = 'nodejs'

const BUCKET = 'assignment-source-files'
const FILE_KIND = 'source_pdf'
const MAX_BYTES = 20 * 1024 * 1024

export async function POST(
  req: Request,
  context: { params: Promise<{ assignmentId: string }> }
) {
  const { assignmentId } = await context.params

  const access = await requireInstructorAssignmentAccess(assignmentId)
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const userId = access.userId!
  const supabase = await createClient()

  const formData = await req.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }

  if (file.size <= 0) {
    return NextResponse.json({ error: 'Uploaded PDF is empty' }, { status: 400 })
  }

  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 })
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'PDF file is too large (max 20 MB)' },
      { status: 400 }
    )
  }

  const { data: activeFiles, error: activeFilesError } = await supabase
    .from('assignment_source_files')
    .select('id, storage_path, original_filename')
    .eq('assignment_id', assignmentId)
    .eq('file_kind', FILE_KIND)
    .eq('is_active', true)

  if (activeFilesError) {
    return NextResponse.json({ error: activeFilesError.message }, { status: 500 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const safeName = (file.name || 'source.pdf').replace(/[^\w.\-]+/g, '_')
  const storagePath = `assignments/${assignmentId}/source/${Date.now()}_${safeName}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType: 'application/pdf',
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const now = new Date().toISOString()

  const { data: insertedRow, error: insertError } = await supabase
    .from('assignment_source_files')
    .insert({
      assignment_id: assignmentId,
      file_kind: FILE_KIND,
      storage_path: storagePath,
      original_filename: file.name,
      mime_type: file.type,
      file_size_bytes: file.size,
      uploaded_by: userId,
      is_active: true,
      uploaded_at: now,
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
    await supabase.storage.from(BUCKET).remove([storagePath])
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  if ((activeFiles ?? []).length > 0) {
    const activeIds = activeFiles.map((row) => row.id)

    const { error: deactivateError } = await supabase
      .from('assignment_source_files')
      .update({
        is_active: false,
        replaced_at: now,
      })
      .in('id', activeIds)

    if (deactivateError) {
      return NextResponse.json(
        {
          error: deactivateError.message,
          warning:
            'New source PDF uploaded successfully, but previous active rows could not be deactivated automatically.',
          file: insertedRow,
        },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({
    ok: true,
    file: insertedRow,
    replaced_count: activeFiles?.length ?? 0,
  })
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ assignmentId: string }> }
) {
  const { assignmentId } = await context.params

  const access = await requireInstructorAssignmentAccess(assignmentId)
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const supabase = await createClient()

  const { data: activeFile, error: activeError } = await supabase
    .from('assignment_source_files')
    .select('id, storage_path, original_filename')
    .eq('assignment_id', assignmentId)
    .eq('file_kind', FILE_KIND)
    .eq('is_active', true)
    .maybeSingle()

  if (activeError) {
    return NextResponse.json({ error: activeError.message }, { status: 500 })
  }

  if (!activeFile) {
    return NextResponse.json({ error: 'No active source PDF found' }, { status: 404 })
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

  return NextResponse.json({
    ok: true,
    removed: {
      id: activeFile.id,
      original_filename: activeFile.original_filename,
    },
  })
}