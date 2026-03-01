// apps/web/app/api/submissions/finalize/route.ts
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const MAX_PAGES = 60
export const runtime = 'nodejs'
function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(req: Request) {
  try {
    const supabaseUser = await createClient()
    const supabaseAdmin = createAdminClient()

    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !user) return jsonError('Unauthorized', 401)

    const body = await req.json().catch(() => null)
    if (!body) return jsonError('Invalid JSON payload', 400)

    const submission_id = String(body.submission_id || '').trim()
    const assignment_id = String(body.assignment_id || '').trim()
    const filesRaw = body.files

    if (!submission_id || !assignment_id || !Array.isArray(filesRaw) || filesRaw.length === 0) {
      return jsonError('Invalid payload', 400)
    }

    // ✅ Validate files FIRST (ก่อนล็อกสถานะ)
    const files = filesRaw
      .filter((p: any) => typeof p === 'string')
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0)

    if (files.length === 0) return jsonError('No valid file paths', 400)
    if (files.length > MAX_PAGES) return jsonError(`Too many pages (max ${MAX_PAGES})`, 413)

    const uniq = new Set(files)
    if (uniq.size !== files.length) {
      return jsonError('Duplicate file paths detected', 409)
    }

    const expectedPrefix = `${assignment_id}/${user.id}/`
    for (const p of files) {
      if (!p.startsWith(expectedPrefix)) {
        return jsonError('Security Violation: Invalid file path prefix', 403)
      }
    }

    // ✅ ATOMIC LOCK: จองสิทธิ์ finalize (Optimistic Concurrency Control)
    const { data: lockedSub, error: lockErr } = await supabaseUser
      .from('submissions')
      .update({ status: 'ocr_pending' })
      .eq('id', submission_id)
      .eq('student_id', user.id)
      .eq('status', 'uploaded')
      .select('id')
      .single()

    if (lockErr || !lockedSub) {
      return jsonError('Finalize race detected (already finalized or processing). Please refresh.', 409)
    }

    // Prepare records
    const fileRecords = files.map((path: string, index: number) => ({
      submission_id,
      page_number: index + 1,
      storage_path: path,
    }))

    try {
      // Wipe old records (idempotent)
      const { error: wipeErr } = await supabaseAdmin
        .from('submission_files')
        .delete()
        .eq('submission_id', submission_id)
      if (wipeErr) throw new Error(`Finalize cleanup failed: ${wipeErr.message}`)

      // Insert new records
      const { error: insErr } = await supabaseAdmin
        .from('submission_files')
        .insert(fileRecords)
      if (insErr) throw new Error(`File records insert failed: ${insErr.message}`)

      return NextResponse.json({ success: true, message: 'Submission finalized and queued for OCR.' })

   } catch (innerError: any) {
  try {
    await supabaseAdmin
      .from('submissions')
      .update({ status: 'uploaded' })
      .eq('id', submission_id)
      .eq('status', 'ocr_pending')
  } catch {}

  try {
    await supabaseAdmin
      .from('submission_files')
      .delete()
      .eq('submission_id', submission_id)
  } catch {}

  throw innerError
}
  } catch (error: any) {
    console.error('[API Finalize Error]:', error)
    return NextResponse.json(
      { error: error?.message || 'Internal Server Error' },
      { status: 500 }
    )
  }
}