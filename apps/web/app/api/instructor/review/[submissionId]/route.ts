import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{
    submissionId: string
  }>
}

type SaveItemPayload = {
  itemNo: string
  finalScore: number
  reviewerNotes?: string | null
  selectedCandidateId?: string | null
}

function toSafeNumber(value: unknown, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

async function recomputeSubmissionTotals(
  admin: ReturnType<typeof createAdminClient>,
  submissionId: string
) {
  const { data, error } = await admin
    .from('grading_results')
    .select('auto_score, final_score')
    .eq('submission_id', submissionId)

  if (error) {
    throw new Error(`Failed to recompute totals: ${error.message}`)
  }

  const rows = data ?? []

  const autoTotal = rows.reduce((sum, row) => sum + toSafeNumber(row.auto_score, 0), 0)
  const finalTotal = rows.reduce((sum, row) => sum + toSafeNumber(row.final_score, 0), 0)

  const { error: updateError } = await admin
    .from('submissions')
    .update({
      auto_total_score: autoTotal,
      final_total_score: finalTotal,
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)

  if (updateError) {
    throw new Error(`Failed to update submission totals: ${updateError.message}`)
  }

  return { autoTotal, finalTotal }
}

async function setSubmissionReviewing(
  admin: ReturnType<typeof createAdminClient>,
  submissionId: string
) {
  const { error } = await admin
    .from('submissions')
    .update({
      status: 'reviewing',
      current_stage: 'review:in_progress',
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)

  if (error) {
    throw new Error(`Failed to update submission reviewing state: ${error.message}`)
  }
}

async function saveOneItem(
  admin: ReturnType<typeof createAdminClient>,
  submissionId: string,
  item: SaveItemPayload
) {
  const { data: current, error: currentError } = await admin
    .from('grading_results')
    .select('auto_score, selected_candidate_id')
    .eq('submission_id', submissionId)
    .eq('item_no', item.itemNo)
    .single()

  if (currentError) {
    throw new Error(`Failed to load grading_results item ${item.itemNo}: ${currentError.message}`)
  }

  const autoScore = toSafeNumber(current.auto_score, 0)
  const finalScore = toSafeNumber(item.finalScore, 0)
  const selectedCandidateChanged =
    (current.selected_candidate_id ?? null) !== (item.selectedCandidateId ?? null)

  const { error: updateError } = await admin
    .from('grading_results')
    .update({
      final_score: finalScore,
      reviewer_notes: item.reviewerNotes ?? null,
      selected_candidate_id: item.selectedCandidateId ?? null,
      is_overridden: finalScore !== autoScore || selectedCandidateChanged,
      is_human_override: true,
      updated_at: new Date().toISOString(),
    })
    .eq('submission_id', submissionId)
    .eq('item_no', item.itemNo)

  if (updateError) {
    throw new Error(`Failed to save item ${item.itemNo}: ${updateError.message}`)
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { submissionId } = await context.params
    const body = await req.json()
    const action = String(body?.action ?? '')

    if (!submissionId) {
      return NextResponse.json({ error: 'Missing submissionId' }, { status: 400 })
    }

    const admin = createAdminClient()

    if (action === 'save_item') {
      const item = body?.item as SaveItemPayload | undefined

      if (!item?.itemNo) {
        return NextResponse.json({ error: 'Missing item payload' }, { status: 400 })
      }

      await saveOneItem(admin, submissionId, item)
      await setSubmissionReviewing(admin, submissionId)
      const totals = await recomputeSubmissionTotals(admin, submissionId)

      return NextResponse.json({
        ok: true,
        action,
        totals,
      })
    }

    if (action === 'save_all') {
      const items = Array.isArray(body?.items) ? (body.items as SaveItemPayload[]) : []

      for (const item of items) {
        if (!item?.itemNo) continue
        await saveOneItem(admin, submissionId, item)
      }

      await setSubmissionReviewing(admin, submissionId)
      const totals = await recomputeSubmissionTotals(admin, submissionId)

      return NextResponse.json({
        ok: true,
        action,
        totals,
      })
    }

    if (action === 'approve') {
      const totals = await recomputeSubmissionTotals(admin, submissionId)

      const { error: updateError } = await admin
        .from('submissions')
        .update({
          status: 'approved',
          current_stage: 'review:approved',
          updated_at: new Date().toISOString(),
        })
        .eq('id', submissionId)

      if (updateError) {
        throw new Error(`Failed to approve submission: ${updateError.message}`)
      }

      return NextResponse.json({
        ok: true,
        action,
        totals,
      })
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unexpected server error' },
      { status: 500 }
    )
  }
}