//apps/web/app/api/reviewer/submissions/[submissionId]/release/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(
  _: Request,
  context: { params: Promise<{ submissionId: string }> }
) {
  const { submissionId } = await context.params
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

  const myRole = me?.role ?? 'student'
  if (!['reviewer', 'admin'].includes(myRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: claim, error: claimError } = await supabase
    .from('review_claims')
    .select('id, submission_id, reviewer_id, reviewer_user_id')
    .eq('submission_id', submissionId)
    .maybeSingle()

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 })
  }

  if (!claim) {
    return NextResponse.json({ ok: true, message: 'No active claim found' })
  }

  const mine =
    claim.reviewer_user_id === user.id ||
    claim.reviewer_id === user.id ||
    myRole === 'admin'

  if (!mine) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error: deleteError } = await supabase
    .from('review_claims')
    .delete()
    .eq('id', claim.id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}