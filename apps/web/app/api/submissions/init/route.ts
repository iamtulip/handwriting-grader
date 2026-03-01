// apps/web/app/api/submissions/init/route.ts
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
export const runtime = 'nodejs'
function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(req: Request) {
  try {
    const supabaseUser = await createClient()
    const supabaseAdmin = createAdminClient()

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) return jsonError('Unauthorized', 401)

    const body = await req.json().catch(() => null)
    if (!body) return jsonError('Invalid JSON payload', 400)

    const assignment_id = String(body.assignment_id || '').trim()
    if (!assignment_id) return jsonError('Missing assignment_id', 400)

    // 1) Check assignment exists
    const { data: assignment, error: assignErr } = await supabaseUser
      .from('assignments')
      .select('id')
      .eq('id', assignment_id)
      .single()

    if (assignErr || !assignment) return jsonError('Assignment not found', 404)

    // 2) Find existing submission (treat "not found" as null)
    const { data: existingSub, error: existErr } = await supabaseUser
      .from('submissions')
      .select('id, status')
      .eq('assignment_id', assignment_id)
      .eq('student_id', user.id)
      .maybeSingle()

    if (existErr) {
      // error จริง (ไม่ใช่ not found)
      return jsonError(`Failed to check existing submission: ${existErr.message}`, 500)
    }

    let submissionId: string

    if (existingSub) {
      // Allow only these statuses to re-upload
      const allowRetry = ['uploaded', 'ocr_failed', 'extract_failed']
      if (!allowRetry.includes(existingSub.status)) {
        return jsonError('Cannot upload: Submission is already processing or graded.', 403)
      }

      submissionId = existingSub.id

      // 3) Cleanup old files (must check errors)
      const { error: delErr } = await supabaseAdmin
        .from('submission_files')
        .delete()
        .eq('submission_id', submissionId)
      if (delErr) return jsonError(`Admin cleanup failed: ${delErr.message}`, 500)

      // 4) Reset status back to uploaded (check error)
      const { error: resetErr } = await supabaseAdmin
        .from('submissions')
        .update({ status: 'uploaded' })
        .eq('id', submissionId)
      if (resetErr) return jsonError(`Reset submission failed: ${resetErr.message}`, 500)

    } else {
      // Create new submission
      const { data: newSub, error: insertError } = await supabaseUser
        .from('submissions')
        .insert({ assignment_id, student_id: user.id, status: 'uploaded' })
        .select('id')
        .single()

      if (insertError || !newSub) {
        return jsonError(`Create submission failed: ${insertError?.message || 'unknown error'}`, 500)
      }
      submissionId = newSub.id
    }

    return NextResponse.json({
      success: true,
      submission_id: submissionId,
      student_id: user.id,
    })

  } catch (error: any) {
    console.error('[API Init Error]:', error)
    return NextResponse.json(
      { error: error?.message || 'Internal Server Error' },
      { status: 500 }
    )
  }
}