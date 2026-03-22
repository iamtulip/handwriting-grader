import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireInstructorAssignmentAccess } from '@/lib/instructor-permissions'

export const runtime = 'nodejs'

const BUCKET = 'assignment-source-files'
const FILE_KIND = 'source_pdf'

function wantsJson(req: Request, url: URL) {
  const format = url.searchParams.get('format')
  if (format === 'json') return true

  const accept = req.headers.get('accept') ?? ''
  return accept.includes('application/json')
}

export async function GET(
  req: Request,
  context: { params: Promise<{ assignmentId: string }> }
) {
  const { assignmentId } = await context.params

  const access = await requireInstructorAssignmentAccess(assignmentId)
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error ?? 'Forbidden' },
      { status: access.status }
    )
  }

  const url = new URL(req.url)
  const mode = url.searchParams.get('mode') ?? 'preview'
  const jsonMode = wantsJson(req, url)

  const supabase = await createClient()

  const { data: fileRow, error: fileError } = await supabase
    .from('assignment_source_files')
    .select('id, storage_path, original_filename, mime_type')
    .eq('assignment_id', assignmentId)
    .eq('file_kind', FILE_KIND)
    .eq('is_active', true)
    .maybeSingle()

  if (fileError) {
    return NextResponse.json({ error: fileError.message }, { status: 500 })
  }

  if (!fileRow) {
    return NextResponse.json({ error: 'No active source PDF found' }, { status: 404 })
  }

  const expiresIn = 60 * 10

  const { data: signed, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(fileRow.storage_path, expiresIn, {
      download: mode === 'download' ? fileRow.original_filename ?? 'source.pdf' : undefined,
    })

  if (signedError) {
    return NextResponse.json({ error: signedError.message }, { status: 500 })
  }

  const signedUrl = signed.signedUrl

  if (!jsonMode) {
    return NextResponse.redirect(signedUrl)
  }

  return NextResponse.json({
    ok: true,
    url: signedUrl,
    signed_url: signedUrl,
    file: {
      id: fileRow.id,
      original_filename: fileRow.original_filename,
      mime_type: fileRow.mime_type,
      mode,
    },
  })
}