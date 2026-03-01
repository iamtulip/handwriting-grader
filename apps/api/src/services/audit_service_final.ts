import { getServiceSupabase } from '../lib/supabase';

// Helper ตรวจสอบ UUID ป้องกัน Injection-ish behavior
function assertUuid(x: any, name: string) {
  if (!/^[0-9a-f-]{36}$/i.test(String(x))) throw new Error(`Invalid ${name}`);
}

// ตรวจสอบสิทธิ์ Reviewer ต่อ Submission นั้นๆ (Active Claim Check)
async function assertReviewerHasActiveClaim(supa: any, reviewerId: string, submissionId: string) {
  const prof = await supa.from('profiles').select('role').eq('id', reviewerId).maybeSingle();
  const role = prof.data?.role;
  if (!role || !['reviewer', 'admin'].includes(role)) throw new Error('Forbidden: Role mismatch');
  if (role === 'admin') return;

  const { data: claim } = await supa
    .from('review_claims')
    .select('id')
    .eq('submission_id', submissionId)
    .eq('reviewer_id', reviewerId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (!claim) throw new Error('Forbidden: No active claim or claim expired');
}

export async function getRoiAuditBundle(args: { reviewerId: string, submissionId: string, roiId: string, pageNumber: number }) {
  const supa = getServiceSupabase();
  assertUuid(args.submissionId, 'submissionId');
  assertUuid(args.roiId, 'roiId');
  
  // Explicit Auth Check
  await assertReviewerHasActiveClaim(supa, args.reviewerId, args.submissionId);

  const { data: roiArt } = await supa
    .from('submission_artifacts')
    .select('storage_path')
    .eq('submission_id', args.submissionId)
    .eq('step_name', `v2:roi_crop:${args.roiId}`)
    .single();

  if (!roiArt?.storage_path) throw new Error('ROI artifact not found');

  const { data: signed } = await supa.storage
    .from('derived_artifacts')
    .createSignedUrl(roiArt.storage_path, 900);

  if (!signed?.signedUrl) throw new Error('Signed URL generation failed');

  const [candsRes, gradeRes, subRes] = await Promise.all([
    supa.from('grading_candidates').select('*').eq('submission_id', args.submissionId).eq('roi_id', args.roiId).order('rank', { ascending: true }),
    supa.from('grading_results').select('*').eq('submission_id', args.submissionId).eq('roi_id', args.roiId).maybeSingle(),
    supa.from('submissions').select('layout_spec_version').eq('id', args.submissionId).single()
  ]);

  return {
    evidence: { roi_image_url: signed.signedUrl, evidence_map: gradeRes.data?.evidence_map },
    lattice: { candidates: candsRes.data || [], selected_candidate_id: gradeRes.data?.selected_candidate_id },
    grading_state: { 
      auto_score: gradeRes.data?.auto_score || 0, 
      final_score: gradeRes.data?.final_score || 0,
      is_human_override: gradeRes.data?.is_human_override || false,
      manual_reason: gradeRes.data?.manual_reason || ''
    },
    context_lock: { 
      layout_spec_version: subRes.data?.layout_spec_version,
      spec_mismatch: gradeRes.data && gradeRes.data.layout_spec_version !== subRes.data?.layout_spec_version
    }
  };
}

export async function overrideGrade(args: { reviewerId: string, payload: any }) {
  const supa = getServiceSupabase();
  const p = args.payload;
  assertUuid(p.submission_id, 'submission_id');
  await assertReviewerHasActiveClaim(supa, args.reviewerId, p.submission_id);

  // 1. Server-side Spec Lock Check
  const { data: sub } = await supa.from('submissions').select('layout_spec_version').eq('id', p.submission_id).single();
  if (Number(p.layout_spec_version) !== Number(sub?.layout_spec_version)) {
    throw new Error('SPEC_MISMATCH: Please refresh the page');
  }

  // 2. Race-free Anti-replay (Insert Stub First)
  const { data: event, error: evErr } = await supa
    .from('grading_events')
    .insert({
      submission_id: p.submission_id,
      roi_id: p.roi_id,
      actor_id: args.reviewerId,
      action_type: p.action_type,
      client_nonce: p.client_nonce
    })
    .select('id').single();

  if (evErr?.message?.includes('duplicate')) return { status: 'already_processed' };
  if (evErr) throw new Error(`Event Log Failed: ${evErr.message}`);

  // 3. Upsert with Conflict Target
  const { data: updated } = await supa
    .from('grading_results')
    .upsert({
      submission_id: p.submission_id,
      roi_id: p.roi_id,
      page_number: Number(p.page_number ?? 1),
      final_score: p.final_score,
      selected_candidate_id: p.selected_candidate_id,
      is_human_override: p.action_type === 'override',
      manual_reason: String(p.manual_reason || '').slice(0, 500),
      layout_spec_version: p.layout_spec_version
    }, { onConflict: 'submission_id,roi_id,page_number' })
    .select().single();

  // 4. Finalize Audit Event
  await supa.from('grading_events').update({ after_data: updated }).eq('id', event.id);

  return { ok: true, result: updated };
}
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
