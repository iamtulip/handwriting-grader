import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const assignment_id = body?.assignment_id
  const message = body?.message

  if (!assignment_id || !message) {
    return NextResponse.json({ error: 'Missing assignment_id or message' }, { status: 400 })
  }

  const { data: sub } = await supabase
    .from('submissions')
    .select('id')
    .eq('assignment_id', assignment_id)
    .eq('student_id', auth.user.id)
    .maybeSingle()

  const submissionId = sub?.id
  if (!submissionId) return NextResponse.json({ error: 'ไม่พบประวัติการส่งงานนี้ (Submission not found)' }, { status: 404 })

  const { error } = await supabase.from('submission_artifacts').insert({
    submission_id: submissionId,
    page_number: 0,
    step_name: 'student:appeal',
    artifact_type: 'json_metadata',
    data: { message, created_at: new Date().toISOString() },
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}