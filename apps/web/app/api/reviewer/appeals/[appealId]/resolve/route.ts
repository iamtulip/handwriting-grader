//apps/web/app/api/reviewer/appeals/[appealId]/resolve/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(
  req: Request,
  context: { params: Promise<{ appealId: string }> }
) {

  const { appealId } = await context.params

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  const decision = body.decision
  const notes = body.notes
  const newScore = body.new_score

  const { data: appeal } = await supabase
    .from('appeals')
    .select('id, submission_id, status')
    .eq('id', appealId)
    .single()

  if (!appeal) {
    return NextResponse.json({ error: 'Appeal not found' }, { status: 404 })
  }

  let status = 'rejected'

  if (decision === 'accept') {
    status = 'accepted'
  }

  if (decision === 'modify') {
    status = 'resolved_with_score_change'
  }

  if (decision === 'modify' && newScore != null) {

    await supabase
      .from('submissions')
      .update({
        total_score: newScore
      })
      .eq('id', appeal.submission_id)

  }

  const { data, error } = await supabase
    .from('appeals')
    .update({
      status: status,
      resolution_notes: notes,
      resolved_by: user.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', appealId)
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