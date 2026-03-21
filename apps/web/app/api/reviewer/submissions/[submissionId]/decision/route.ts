import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

function isClaimExpired(expiresAt?: string | null) {
  if (!expiresAt) return true
  return new Date(expiresAt).getTime() <= Date.now()
}

async function canReviewSubmission(
  supabase: any,
  userId: string,
  role: string,
  submissionId: string
) {
  if (role === 'admin') {
    return { allowed: true, assignmentId: null as string | null }
  }

  const { data: submission } = await supabase
    .from('submissions')
    .select('id, assignment_id')
    .eq('id', submissionId)
    .maybeSingle()

  if (!submission) {
    return { allowed: false, assignmentId: null }
  }

  const { data: access } = await supabase
    .from('reviewer_assignments')
    .select('assignment_id')
    .eq('reviewer_user_id', userId)
    .eq('assignment_id', submission.assignment_id)
    .maybeSingle()

  return {
    allowed: !!access,
    assignmentId: submission.assignment_id,
  }
}

async function requireMyClaim(
  supabase: any,
  userId: string,
  role: string,
  submissionId: string
) {
  if (role === 'admin') return { ok: true }

  const { data: claim } = await supabase
    .from('review_claims')
    .select('id, reviewer_id, reviewer_user_id, expires_at')
    .eq('submission_id', submissionId)
    .maybeSingle()

  if (!claim) {
    return { ok: false, message: 'You must claim this submission first' }
  }

  if (isClaimExpired(claim.expires_at)) {
    return { ok: false, message: 'Your claim has expired' }
  }

  const mine =
    claim.reviewer_user_id === userId || claim.reviewer_id === userId

  if (!mine) {
    return { ok: false, message: 'Submission is claimed by another reviewer' }
  }

  return { ok: true }
}

async function recomputeSubmissionTotal(supabase: any, submissionId: string) {
  const { data: results, error } = await supabase
    .from('grading_results')
    .select('final_score, auto_score')
    .eq('submission_id', submissionId)

  if (error) throw error

  const total = (results ?? []).reduce(
    (sum: number, row: any) => sum + Number(row.final_score ?? row.auto_score ?? 0),
    0
  )

  const { error: updateError } = await supabase
    .from('submissions')
    .update({
      total_score: Number(total.toFixed(2)),
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)

  if (updateError) throw updateError

  return Number(total.toFixed(2))
}

export async function POST(
  req: Request,
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
    .select('id, role, full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (meError) {
    return NextResponse.json({ error: meError.message }, { status: 500 })
  }

  const myRole = me?.role ?? 'student'
  if (!['reviewer', 'admin'].includes(myRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const access = await canReviewSubmission(supabase, user.id, myRole, submissionId)
  if (!access.allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const claimCheck = await requireMyClaim(supabase, user.id, myRole, submissionId)
  if (!claimCheck.ok) {
    return NextResponse.json({ error: claimCheck.message }, { status: 409 })
  }

  let body: any = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = body.action

  if (action === 'confirm') {
    if (!body.result_id) {
      return NextResponse.json({ error: 'result_id is required' }, { status: 400 })
    }

    const { data: resultRow, error: resultError } = await supabase
      .from('grading_results')
      .select('*')
      .eq('id', body.result_id)
      .eq('submission_id', submissionId)
      .single()

    if (resultError) {
      return NextResponse.json({ error: resultError.message }, { status: 500 })
    }

    let candidateRow: any = null
    if (body.selected_candidate_id) {
      const { data: candidate, error: candidateError } = await supabase
        .from('grading_candidates')
        .select('*')
        .eq('id', body.selected_candidate_id)
        .eq('submission_id', submissionId)
        .single()

      if (candidateError) {
        return NextResponse.json({ error: candidateError.message }, { status: 500 })
      }

      candidateRow = candidate
    }

    const nextFinalScore =
      body.final_score != null
        ? Number(body.final_score)
        : Number(resultRow.final_score ?? resultRow.auto_score ?? 0)

    const afterData = {
      selected_candidate_id: candidateRow?.id ?? resultRow.selected_candidate_id ?? null,
      extracted_raw: candidateRow?.raw_text ?? resultRow.extracted_raw ?? null,
      extracted_normalized:
        candidateRow?.normalized_value ?? resultRow.extracted_normalized ?? null,
      final_score: nextFinalScore,
      reviewer_notes: body.reviewer_notes ?? resultRow.reviewer_notes ?? null,
    }

    const { data: updated, error: updateError } = await supabase
      .from('grading_results')
      .update({
        selected_candidate_id: afterData.selected_candidate_id,
        extracted_raw: afterData.extracted_raw,
        extracted_normalized: afterData.extracted_normalized,
        final_score: nextFinalScore,
        reviewer_notes: afterData.reviewer_notes,
        is_overridden: false,
        is_human_override: false,
        manual_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.result_id)
      .eq('submission_id', submissionId)
      .select('*')
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    const { error: eventError } = await supabase
      .from('grading_events')
      .insert({
        submission_id: submissionId,
        roi_id: updated.roi_id ?? '',
        page_number: updated.page_number ?? 1,
        layout_spec_version: updated.layout_spec_version ?? 1,
        actor_id: user.id,
        actor_user_id: user.id,
        action_type: 'confirm',
        before_data: {
          selected_candidate_id: resultRow.selected_candidate_id,
          extracted_raw: resultRow.extracted_raw,
          extracted_normalized: resultRow.extracted_normalized,
          final_score: resultRow.final_score,
        },
        after_data: afterData,
        manual_reason: body.reviewer_notes ?? null,
      })

    if (eventError) {
      return NextResponse.json({ error: eventError.message }, { status: 500 })
    }

    const total = await recomputeSubmissionTotal(supabase, submissionId)

    return NextResponse.json({
      ok: true,
      item: updated,
      submission_total_score: total,
    })
  }

  if (action === 'override') {
    if (!body.result_id) {
      return NextResponse.json({ error: 'result_id is required' }, { status: 400 })
    }

    if (!body.manual_reason || !String(body.manual_reason).trim()) {
      return NextResponse.json({ error: 'manual_reason is required' }, { status: 400 })
    }

    const { data: resultRow, error: resultError } = await supabase
      .from('grading_results')
      .select('*')
      .eq('id', body.result_id)
      .eq('submission_id', submissionId)
      .single()

    if (resultError) {
      return NextResponse.json({ error: resultError.message }, { status: 500 })
    }

    const nextFinalScore =
      body.final_score != null
        ? Number(body.final_score)
        : Number(resultRow.final_score ?? resultRow.auto_score ?? 0)

    const afterData = {
      extracted_raw: body.override_raw ?? resultRow.extracted_raw ?? null,
      extracted_normalized:
        body.override_value ?? resultRow.extracted_normalized ?? null,
      final_score: nextFinalScore,
      reviewer_notes: body.reviewer_notes ?? resultRow.reviewer_notes ?? null,
      manual_reason: String(body.manual_reason),
    }

    const { data: updated, error: updateError } = await supabase
      .from('grading_results')
      .update({
        extracted_raw: afterData.extracted_raw,
        extracted_normalized: afterData.extracted_normalized,
        final_score: nextFinalScore,
        reviewer_notes: afterData.reviewer_notes,
        is_overridden: true,
        is_human_override: true,
        manual_reason: afterData.manual_reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.result_id)
      .eq('submission_id', submissionId)
      .select('*')
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    const { error: eventError } = await supabase
      .from('grading_events')
      .insert({
        submission_id: submissionId,
        roi_id: updated.roi_id ?? '',
        page_number: updated.page_number ?? 1,
        layout_spec_version: updated.layout_spec_version ?? 1,
        actor_id: user.id,
        actor_user_id: user.id,
        action_type: 'override',
        before_data: {
          extracted_raw: resultRow.extracted_raw,
          extracted_normalized: resultRow.extracted_normalized,
          final_score: resultRow.final_score,
        },
        after_data: afterData,
        manual_reason: afterData.manual_reason,
      })

    if (eventError) {
      return NextResponse.json({ error: eventError.message }, { status: 500 })
    }

    const total = await recomputeSubmissionTotal(supabase, submissionId)

    return NextResponse.json({
      ok: true,
      item: updated,
      submission_total_score: total,
    })
  }

  if (action === 'finalize_review') {
    const total = await recomputeSubmissionTotal(supabase, submissionId)

    const { data: updatedSubmission, error: updateSubmissionError } = await supabase
      .from('submissions')
      .update({
        status: 'graded',
        current_stage: 'review_completed',
        updated_at: new Date().toISOString(),
        total_score: total,
      })
      .eq('id', submissionId)
      .select('id, status, current_stage, total_score, updated_at')
      .single()

    if (updateSubmissionError) {
      return NextResponse.json({ error: updateSubmissionError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      submission: updatedSubmission,
    })
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
}