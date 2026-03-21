import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  const submissionId = body.submission_id
  const reason = body.reason

  if (!submissionId || !reason) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { data: submission } = await supabase
    .from('submissions')
    .select('id, student_id, status')
    .eq('id', submissionId)
    .single()

  if (!submission || submission.student_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (submission.status !== 'published') {
    return NextResponse.json({ error: 'Result not published yet' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('appeals')
    .insert({
      submission_id: submissionId,
      student_id: user.id,
      reason: reason,
      status: 'pending'
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    appeal: data
  })
}