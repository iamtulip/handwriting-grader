// apps/api/src/services/audit_service.ts
//(หัวใจของระบบ: การรวม Artifacts, Candidates และ Grading Result มาเป็น Bundle เดียวพร้อมออก Signed URL)

import { z } from 'zod'
import { getServiceSupabase } from '../lib/supabase';
import crypto from 'crypto'

const BUCKET_NAME = process.env.DERIVED_BUCKET_NAME || 'derived_artifacts'
const SIGNED_URL_TTL_SECONDS = 60 * 15 // 15 minutes

// -----------------------------
// helpers
// -----------------------------
function stableHash(obj: any) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex')
}

/**
 * Permission guard (assignment scope).
 * If you have reviewer assignment mapping table, enforce it here.
 * For now: reviewer can access any submission they can SELECT via service client,
 * but we still require role reviewer/instructor on auth layer.
 */
async function assertCanAccessSubmission(params: { submissionId: string }) {
  // Hook for future: check reviewer_assignment_permissions
  return true
}

// -----------------------------
// Monitoring: submissions list
// -----------------------------
export async function listSubmissionsForReviewer(args: {
  reviewerUserId: string
  assignmentId: string
  status?: string
  page: number
  pageSize: number
  onlyDisagreement?: boolean
  minConfidenceBelow?: number
}) {
  const supa = getServiceSupabase()

  const from = (args.page - 1) * args.pageSize
  const to = from + args.pageSize - 1

  // Base submissions query
  let q = supa
    .from('submissions')
    .select('id, student_id, status, current_stage, created_at, layout_spec_version', { count: 'exact' })
    .eq('assignment_id', args.assignmentId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (args.status) q = q.eq('status', args.status)

  const { data: subs, error: subErr, count } = await q
  if (subErr) throw new Error(subErr.message)

  // Lightweight per-submission risk summary (single extra query)
  // We avoid pulling full grading_results rows; we only need counts & min confidence & disagreement flags
  const subIds = (subs || []).map((s: any) => s.id)
  if (subIds.length === 0) {
    return { page: args.page, pageSize: args.pageSize, total: count || 0, items: [] }
  }

  const { data: rs, error: rErr } = await supa
    .from('grading_results')
    .select('submission_id, confidence_score, disagreement, final_score, auto_score, is_human_override')
    .in('submission_id', subIds)

  if (rErr) throw new Error(rErr.message)

  const bySub: Record<string, any> = {}
  for (const sid of subIds) {
    bySub[sid] = {
      total_rois: 0,
      needs_review_rois: 0,
      has_disagreement: false,
      min_confidence: 1,
      avg_confidence: 0,
      sum_conf: 0,
    }
  }

  for (const row of rs || []) {
    const b = bySub[row.submission_id]
    if (!b) continue
    b.total_rois += 1
    const conf = typeof row.confidence_score === 'number' ? row.confidence_score : 1
    b.min_confidence = Math.min(b.min_confidence, conf)
    b.sum_conf += conf
    if (row.disagreement === true || row.confidence_score == null) b.needs_review_rois += 1
    if (row.disagreement === true) b.has_disagreement = true
  }

  for (const sid of subIds) {
    const b = bySub[sid]
    b.avg_confidence = b.total_rois > 0 ? b.sum_conf / b.total_rois : 1
  }

  // Apply filters in memory (because rs is already limited to this page’s submissions)
  let items = (subs || []).map(s => ({
    ...s,
    risk: bySub[s.id] || {
      total_rois: 0,
      needs_review_rois: 0,
      has_disagreement: false,
      min_confidence: 1,
      avg_confidence: 1,
    },
  }))

  if (args.onlyDisagreement) items = items.filter(x => x.risk.has_disagreement)
  if (args.minConfidenceBelow !== undefined) {
  items = items.filter((x: any) => x.risk.min_confidence < args.minConfidenceBelow!);
}

  return {
    page: args.page,
    pageSize: args.pageSize,
    total: count || 0,
    items,
  }
}

// -----------------------------
// ROI Audit Bundle: one call
// -----------------------------
export async function getRoiAuditBundle(args: {
  reviewerUserId: string
  submissionId: string
  roiId: string
  pageNumber: number
}) {
  const supa = getServiceSupabase()

  await assertCanAccessSubmission({ submissionId: args.submissionId })

  // 0) load submission lock (spec version + status)
  const { data: sub, error: subErr } = await supa
    .from('submissions')
    .select('id, assignment_id, layout_spec_version, status, current_stage')
    .eq('id', args.submissionId)
    .single()

  if (subErr || !sub) throw new Error('NOT_FOUND: submission not found')

  const lockedSpecVersion = sub.layout_spec_version
  if (!lockedSpecVersion) {
    // If you haven’t locked yet, that’s a pipeline bug; UI must not proceed silently
    throw new Error('CONFLICT: submission has no layout_spec_version lock yet')
  }

  // 1) ROI artifact path (image)
  // ROI crop step_name must match worker: v2:roi_crop:${roiId}, artifact_type=image_path
  const { data: roiArt, error: artErr } = await supa
    .from('submission_artifacts')
    .select('storage_path, data')
    .eq('submission_id', args.submissionId)
    .eq('page_number', args.pageNumber)
    .eq('step_name', `v2:roi_crop:${args.roiId}`)
    .eq('artifact_type', 'image_path')
    .single()

  if (artErr || !roiArt?.storage_path) throw new Error('NOT_FOUND: ROI artifact not found')

  // 1.1 Alignment proof (optional but useful)
  const { data: alignArt } = await supa
    .from('submission_artifacts')
    .select('data')
    .eq('submission_id', args.submissionId)
    .eq('page_number', args.pageNumber)
    .eq('step_name', 'v2:alignment_proof')
    .eq('artifact_type', 'json_metadata')
    .maybeSingle()

  // 2) signed URL (server only)
  const { data: signed, error: sErr } = await supa.storage.from(BUCKET_NAME).createSignedUrl(roiArt.storage_path, SIGNED_URL_TTL_SECONDS)
  if (sErr) throw new Error(`FORBIDDEN: cannot sign url (${sErr.message})`)

  // 3) candidates (must match page + roi + locked spec version)
  const { data: candidates, error: cErr } = await supa
    .from('grading_candidates')
    .select('id, roi_id, page_number, layout_spec_version, rank, raw_text, normalized_value, confidence_score, engine_source, created_at')
    .eq('submission_id', args.submissionId)
    .eq('roi_id', args.roiId)
    .eq('page_number', args.pageNumber)
    .eq('layout_spec_version', lockedSpecVersion)
    .order('rank', { ascending: true })

  if (cErr) throw new Error(cErr.message)

  // 4) grading result (also lock page + roi + spec version)
  const { data: result, error: rErr } = await supa
    .from('grading_results')
    .select('id, submission_id, roi_id, page_number, layout_spec_version, auto_score, final_score, confidence_score, disagreement, reason_code, selected_candidate_id, evidence_map, is_human_override, manual_reason, created_at')
    .eq('submission_id', args.submissionId)
    .eq('roi_id', args.roiId)
    .eq('page_number', args.pageNumber)
    .eq('layout_spec_version', lockedSpecVersion)
    .maybeSingle()

  if (rErr) throw new Error(rErr.message)

  // 5) spec drift guard (UI can show a banner)
  const specMismatch =
    (result && result.layout_spec_version !== lockedSpecVersion) ||
    (candidates || []).some(c => c.layout_spec_version !== lockedSpecVersion)

  return {
    evidence: {
      roi_image_url: signed?.signedUrl,
      evidence_map: result?.evidence_map || null,
      alignment_meta: alignArt?.data || null,
      roi_meta: roiArt?.data || null,
    },
    lattice: {
      candidates: candidates || [],
      selected_candidate_id: result?.selected_candidate_id || null,
    },
    grading_state: {
      auto_score: result?.auto_score ?? 0,
      final_score: result?.final_score ?? (result?.auto_score ?? 0),
      confidence_score: result?.confidence_score ?? null,
      disagreement: result?.disagreement ?? false,
      reason_code: result?.reason_code ?? null,
      is_human_override: result?.is_human_override ?? false,
      manual_reason: result?.manual_reason ?? null,
    },
    context_lock: {
      submission_id: args.submissionId,
      assignment_id: sub.assignment_id,
      page_number: args.pageNumber,
      roi_id: args.roiId,
      layout_spec_version: lockedSpecVersion,
      spec_mismatch: !!specMismatch,
    },
  }
}

// -----------------------------
// Override / Confirm: write grading_results + grading_events (append-only)
// -----------------------------
export async function overrideGrade(args: {
  reviewerUserId: string
  payload: {
    submission_id: string
    roi_id: string
    page_number: number
    layout_spec_version: number
    action_type: 'confirm' | 'override'
    selected_candidate_id?: string | null
    final_score?: number | null
    manual_reason?: string
  }
}) {
  const supa = getServiceSupabase()
  const p = args.payload

  await assertCanAccessSubmission({ submissionId: p.submission_id })

  // Load submission lock and ensure version consistency
  const { data: sub, error: subErr } = await supa
    .from('submissions')
    .select('id, layout_spec_version, status, current_stage')
    .eq('id', p.submission_id)
    .single()

  if (subErr || !sub) throw new Error('NOT_FOUND: submission not found')
  if (!sub.layout_spec_version) throw new Error('CONFLICT: submission has no layout_spec_version lock yet')

  if (sub.layout_spec_version !== p.layout_spec_version) {
    throw new Error('CONFLICT: layout_spec_version changed. Please refresh before saving.')
  }

  // Fetch existing grading result row (before)
  const { data: before, error: bErr } = await supa
    .from('grading_results')
    .select('*')
    .eq('submission_id', p.submission_id)
    .eq('roi_id', p.roi_id)
    .eq('page_number', p.page_number)
    .eq('layout_spec_version', p.layout_spec_version)
    .maybeSingle()

  if (bErr) throw new Error(bErr.message)

  // If no row exists yet, you may choose to create it
  const beforeData = before || {
    submission_id: p.submission_id,
    roi_id: p.roi_id,
    page_number: p.page_number,
    layout_spec_version: p.layout_spec_version,
    auto_score: 0,
    final_score: 0,
    selected_candidate_id: null,
    is_human_override: false,
    manual_reason: null,
  }

  // Validate override rules
  if (p.action_type === 'override') {
    if (!p.manual_reason || p.manual_reason.trim().length < 3) {
      throw new Error('CONFLICT: manual_reason is required for override.')
    }
  }

  // Determine new values
  let patch: any = {}
  if (p.action_type === 'confirm') {
    // Confirm AI: final_score = auto_score, no override flag
    patch = {
      final_score: beforeData.auto_score ?? 0,
      is_human_override: false,
      manual_reason: null,
      // keep selected_candidate_id as is (or keep)
      updated_at: new Date().toISOString(),
    }
  } else {
    // Override: choose candidate or manual score
    patch = {
      is_human_override: true,
      manual_reason: p.manual_reason?.trim() || null,
      updated_at: new Date().toISOString(),
    }
    if (p.selected_candidate_id) patch.selected_candidate_id = p.selected_candidate_id
    if (typeof p.final_score === 'number') patch.final_score = p.final_score
  }

  // Upsert grading_results
  const upsertRow = {
    submission_id: p.submission_id,
    roi_id: p.roi_id,
    page_number: p.page_number,
    layout_spec_version: p.layout_spec_version,
    ...beforeData,
    ...patch,
  }

  const { data: afterRows, error: uErr } = await supa
    .from('grading_results')
    .upsert(upsertRow, { onConflict: 'submission_id,roi_id,page_number,layout_spec_version' })
    .select()
    .limit(1)

  if (uErr) throw new Error(uErr.message)

  const after = afterRows?.[0]

  // Insert grading_events (append-only)
  const event = {
    submission_id: p.submission_id,
    roi_id: p.roi_id,
    page_number: p.page_number,
    layout_spec_version: p.layout_spec_version,
    actor_id: args.reviewerUserId,
    action_type: p.action_type,
    before_data: beforeData,
    after_data: after,
    manual_reason: p.action_type === 'override' ? (p.manual_reason?.trim() || null) : null,
    before_hash: stableHash(beforeData),
    after_hash: stableHash(after),
  }

  const { error: eErr } = await supa.from('grading_events').insert(event)
  if (eErr) throw new Error(eErr.message)

  return { ok: true, grading_result: after, event }
}