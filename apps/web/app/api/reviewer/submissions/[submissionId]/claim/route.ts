import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const CLAIM_MINUTES = 45

function isExpired(expiresAt?: string | null) {
  if (!expiresAt) return true
  return new Date(expiresAt).getTime() <= Date.now()
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

  const { data: submission, error: submissionError } = await supabase
    .from('submissions')
    .select('id, assignment_id')
    .eq('id', submissionId)
    .maybeSingle()

  if (submissionError) {
    return NextResponse.json({ error: submissionError.message }, { status: 500 })
  }

  if (!submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  if (myRole === 'reviewer') {
    const { data: access, error: accessError } = await supabase
      .from('reviewer_assignments')
      .select('assignment_id')
      .eq('reviewer_user_id', user.id)
      .eq('assignment_id', submission.assignment_id)
      .maybeSingle()

    if (accessError) {
      return NextResponse.json({ error: accessError.message }, { status: 500 })
    }

    if (!access) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { data: existing, error: existingError } = await supabase
    .from('review_claims')
    .select('id, reviewer_id, reviewer_user_id, claimed_at, expires_at')
    .eq('submission_id', submissionId)
    .maybeSingle()

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  if (existing && !isExpired(existing.expires_at)) {
    const mine =
      existing.reviewer_user_id === user.id || existing.reviewer_id === user.id

    if (!mine) {
      return NextResponse.json(
        { error: 'This submission is currently claimed by another reviewer' },
        { status: 409 }
      )
    }

    return NextResponse.json({
      ok: true,
      item: existing,
      message: 'Already claimed by you',
    })
  }

  const expiresAt = new Date(Date.now() + CLAIM_MINUTES * 60 * 1000).toISOString()

  let result: any = null

  if (existing) {
    const { data, error } = await supabase
      .from('review_claims')
      .update({
        reviewer_id: user.id,
        reviewer_user_id: user.id,
        claimed_at: new Date().toISOString(),
        expires_at: expiresAt,
      })
      .eq('id', existing.id)
      .select('id, submission_id, reviewer_id, reviewer_user_id, claimed_at, expires_at')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    result = data
  } else {
    const { data, error } = await supabase
      .from('review_claims')
      .insert({
        submission_id: submissionId,
        reviewer_id: user.id,
        reviewer_user_id: user.id,
        claimed_at: new Date().toISOString(),
        expires_at: expiresAt,
      })
      .select('id, submission_id, reviewer_id, reviewer_user_id, claimed_at, expires_at')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    result = data
  }

  return NextResponse.json({ ok: true, item: result })
}