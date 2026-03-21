import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

function isClaimExpired(expiresAt?: string | null) {
  if (!expiresAt) return true
  return new Date(expiresAt).getTime() <= Date.now()
}

async function canPublishSubmission(
  supabase: any,
  userId: string,
  role: string,
  submissionId: string
) {
  if (role === 'admin') return { allowed: true }

  const { data: submission } = await supabase
    .from('submissions')
    .select('id, assignment_id')
    .eq('id', submissionId)
    .maybeSingle()

  if (!submission) return { allowed: false }

  const { data: access } = await supabase
    .from('reviewer_assignments')
    .select('assignment_id')
    .eq('reviewer_user_id', userId)
    .eq('assignment_id', submission.assignment_id)
    .maybeSingle()

  if (!access) return { allowed: false }

  const { data: claim } = await supabase
    .from('review_claims')
    .select('reviewer_id, reviewer_user_id, expires_at')
    .eq('submission_id', submissionId)
    .maybeSingle()

  if (!claim) return { allowed: false }
  if (isClaimExpired(claim.expires_at)) return { allowed: false }

  const mine = claim.reviewer_user_id === userId || claim.reviewer_id === userId
  return { allowed: mine }
}

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

  const access = await canPublishSubmission(supabase, user.id, myRole, submissionId)
  if (!access.allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: updated, error } = await supabase
    .from('submissions')
    .update({
      status: 'published',
      current_stage: 'published_to_student',
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .select('id, assignment_id, student_id, status, current_stage, total_score')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, item: updated })
}