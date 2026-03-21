//apps/web/app/api/reviewer/dashboard/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

function isClaimExpired(expiresAt?: string | null) {
  if (!expiresAt) return true
  return new Date(expiresAt).getTime() <= Date.now()
}

export async function GET() {
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
    .select('id, full_name, role')
    .eq('id', user.id)
    .maybeSingle()

  if (meError) {
    return NextResponse.json({ error: meError.message }, { status: 500 })
  }

  const myRole = me?.role ?? 'student'
  if (!['reviewer', 'admin'].includes(myRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let allowedAssignmentIds: string[] = []

  if (myRole === 'admin') {
    const { data: allAssignments, error } = await supabase
      .from('assignments')
      .select('id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    allowedAssignmentIds = (allAssignments ?? []).map((x) => x.id)
  } else {
    const { data: mine, error } = await supabase
      .from('reviewer_assignments')
      .select('assignment_id')
      .eq('reviewer_user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    allowedAssignmentIds = (mine ?? []).map((x) => x.assignment_id).filter(Boolean)
  }

  if (allowedAssignmentIds.length === 0) {
    return NextResponse.json({
      profile: {
        full_name: me?.full_name ?? 'Reviewer',
        role: myRole,
      },
      stats: {
        total_queue: 0,
        needs_review: 0,
        my_claims_active: 0,
        expiring_soon: 0,
      },
      items: [],
    })
  }

  const { data: submissions, error: submissionsError } = await supabase
    .from('submissions')
    .select(`
      id,
      assignment_id,
      student_id,
      status,
      total_score,
      max_score,
      submitted_at,
      updated_at,
      current_stage,
      fraud_flag,
      extracted_paper_student_id,
      assignments!inner(
        id,
        title,
        assignment_type,
        section_id,
        week_number,
        class_date,
        due_at,
        close_at,
        sections!inner(
          id,
          course_code,
          section_number,
          term
        )
      )
    `)
    .in('assignment_id', allowedAssignmentIds)
    .order('submitted_at', { ascending: false })

  if (submissionsError) {
    return NextResponse.json({ error: submissionsError.message }, { status: 500 })
  }

  const submissionIds = (submissions ?? []).map((x: any) => x.id)

  let claims: any[] = []
  if (submissionIds.length > 0) {
    const { data: claimRows, error: claimError } = await supabase
      .from('review_claims')
      .select(`
        id,
        submission_id,
        reviewer_id,
        claimed_at,
        expires_at,
        reviewer_user_id
      `)
      .in('submission_id', submissionIds)

    if (claimError) {
      return NextResponse.json({ error: claimError.message }, { status: 500 })
    }

    claims = claimRows ?? []
  }

  const claimMap = new Map<string, any>()
  for (const claim of claims) {
    const old = claimMap.get(claim.submission_id)
    if (!old) {
      claimMap.set(claim.submission_id, claim)
      continue
    }
    const oldTime = new Date(old.claimed_at ?? 0).getTime()
    const newTime = new Date(claim.claimed_at ?? 0).getTime()
    if (newTime > oldTime) claimMap.set(claim.submission_id, claim)
  }

  const items = (submissions ?? []).map((sub: any) => {
    const claim = claimMap.get(sub.id) ?? null
    const expired = claim ? isClaimExpired(claim.expires_at) : true
    const isMine =
      claim &&
      (claim.reviewer_user_id === user.id || claim.reviewer_id === user.id) &&
      !expired

    return {
      id: sub.id,
      assignment_id: sub.assignment_id,
      student_id: sub.student_id,
      status: sub.status,
      total_score: sub.total_score,
      max_score: sub.max_score,
      submitted_at: sub.submitted_at,
      updated_at: sub.updated_at,
      current_stage: sub.current_stage,
      fraud_flag: sub.fraud_flag,
      extracted_paper_student_id: sub.extracted_paper_student_id,
      assignment: {
        id: sub.assignments?.id ?? null,
        title: sub.assignments?.title ?? null,
        assignment_type: sub.assignments?.assignment_type ?? null,
        week_number: sub.assignments?.week_number ?? null,
        class_date: sub.assignments?.class_date ?? null,
        due_at: sub.assignments?.due_at ?? null,
        close_at: sub.assignments?.close_at ?? null,
      },
      section: {
        id: sub.assignments?.sections?.id ?? null,
        course_code: sub.assignments?.sections?.course_code ?? null,
        section_number: sub.assignments?.sections?.section_number ?? null,
        term: sub.assignments?.sections?.term ?? null,
      },
      claim: claim
        ? {
            id: claim.id,
            reviewer_id: claim.reviewer_id,
            reviewer_user_id: claim.reviewer_user_id,
            claimed_at: claim.claimed_at,
            expires_at: claim.expires_at,
            expired,
            is_mine: !!isMine,
          }
        : null,
    }
  })

  const needsReview = items.filter(
    (x) => x.status === 'needs_review' || x.current_stage === 'review_required'
  )

  const myClaimsActive = items.filter((x) => x.claim?.is_mine === true).length

  const expiringSoon = items.filter((x) => {
    if (!x.claim?.is_mine || !x.claim?.expires_at) return false
    const diff = new Date(x.claim.expires_at).getTime() - Date.now()
    return diff > 0 && diff <= 15 * 60 * 1000
  }).length

  return NextResponse.json({
    profile: {
      full_name: me?.full_name ?? 'Reviewer',
      role: myRole,
    },
    stats: {
      total_queue: items.length,
      needs_review: needsReview.length,
      my_claims_active: myClaimsActive,
      expiring_soon: expiringSoon,
    },
    items,
  })
}