//apps/web/app/api/student/assignments/[assignmentId]/submission-file/[fileId]/url/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const BUCKET = 'submission-files'

export async function GET(
  req: Request,
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
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (meError) {
    return NextResponse.json({ error: meError.message }, { status: 500 })
  }

  if ((me?.role ?? 'student') !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: submissionFile, error: fileError } = await supabase
    .from('submission_files')
    .select(`
      id,
      submission_id,
      page_number,
      storage_path,
      created_at,
      submissions!inner(
        id,
        assignment_id,
        student_id
      )
    `)
    .eq('id', fileId)
    .eq('submissions.assignment_id', assignmentId)
    .eq('submissions.student_id', user.id)
    .maybeSingle()

  if (fileError) {
    return NextResponse.json({ error: fileError.message }, { status: 500 })
  }

  if (!submissionFile) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const url = new URL(req.url)
  const mode = url.searchParams.get('mode') ?? 'preview'

  const { data: signed, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(submissionFile.storage_path, 60 * 15, {
      download: mode === 'download' ? true : false,
    })

  if (signedError) {
    return NextResponse.json({ error: signedError.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    signed_url: signed.signedUrl,
    file: submissionFile,
  })
}