//apps/web/app/api/reviewer/submissions/[submissionId]/files/[fileId]/url/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const BUCKET = 'submission-files'

async function canReviewSubmission(
  supabase: any,
  userId: string,
  role: string,
  submissionId: string
) {
  if (role === 'admin') return true

  const { data: submission } = await supabase
    .from('submissions')
    .select('id, assignment_id')
    .eq('id', submissionId)
    .maybeSingle()

  if (!submission) return false

  const { data: access } = await supabase
    .from('reviewer_assignments')
    .select('assignment_id')
    .eq('reviewer_user_id', userId)
    .eq('assignment_id', submission.assignment_id)
    .maybeSingle()

  return !!access
}

export async function GET(
  req: Request,
  context: { params: Promise<{ submissionId: string; fileId: string }> }
) {
  const { submissionId, fileId } = await context.params
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
  if (!['reviewer', 'admin'].includes(myRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const allowed = await canReviewSubmission(supabase, user.id, myRole, submissionId)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: fileRow, error: fileError } = await supabase
    .from('submission_files')
    .select('id, submission_id, page_number, storage_path, created_at')
    .eq('id', fileId)
    .eq('submission_id', submissionId)
    .maybeSingle()

  if (fileError) {
    return NextResponse.json({ error: fileError.message }, { status: 500 })
  }

  if (!fileRow) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const url = new URL(req.url)
  const mode = url.searchParams.get('mode') ?? 'preview'

  const { data: signed, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(fileRow.storage_path, 60 * 15, {
      download: mode === 'download' ? true : false,
    })

  if (signedError) {
    return NextResponse.json({ error: signedError.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    signed_url: signed.signedUrl,
    file: fileRow,
  })
}