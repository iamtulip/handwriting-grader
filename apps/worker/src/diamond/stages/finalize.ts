//apps/worker/src/diamond/stages/finalize.ts
//บทบาท: สรุปผลรวมของทั้ง Submission และดำเนินการบันทึกสถานะสุดท้าย พร้อมทั้งจัดการ Audit Trace เพื่อให้ระบบพร้อมสำหรับการเรียกดูหรืออุทธรณ์คะแนน
// apps/worker/src/diamond/stages/finalize.ts
import { supabase } from '../../lib/supabase';

type GradingRow = {
  auto_score: number | null;
  final_score: number | null;
  selected_candidate_id: string | null;
  is_human_override: boolean | null;
  manual_reason: string | null;
};

export async function finalizeSubmission(ctx: any) {
  const submissionId = ctx.submission.id;
  console.log(`[FINALIZE] Summarizing results for submission: ${submissionId}`);

  // 1) Pull grading results
  const { data: results, error: resErr } = await supabase
    .from('grading_results')
    .select('auto_score, final_score, selected_candidate_id, is_human_override, manual_reason')
    .eq('submission_id', submissionId);

  if (resErr) throw new Error(`[FINALIZE] Failed to fetch results: ${resErr.message}`);

  const rows = (results ?? []) as GradingRow[];

  const totalAutoScore = rows.reduce((sum, r) => sum + (r.auto_score ?? 0), 0);
  const totalFinalScore = rows.reduce((sum, r) => sum + (r.final_score ?? 0), 0);

  // 2) Determine review requirement robustly
  // Review required if any item:
  // - missing selected candidate (system couldn't confidently pick)
  // - human override happened
  // - manual_reason present (signals intervention)
  const needsReviewByItems = rows.some((r) => {
    if (!r.selected_candidate_id) return true;
    if (r.is_human_override) return true;
    if ((r.manual_reason ?? '').trim().length > 0) return true;
    return false;
  });

  // Also check pipeline stage flag (if set elsewhere)
  const { data: subStatus, error: subErr } = await supabase
    .from('submissions')
    .select('current_stage')
    .eq('id', submissionId)
    .single();

  if (subErr) throw new Error(`[FINALIZE] Failed to fetch submission stage: ${subErr.message}`);

  const needsReviewByStage = subStatus?.current_stage === 'review_required';

  const isReviewRequired = needsReviewByItems || needsReviewByStage;

  // 3) Update submission final status
  // NOTE: align these status strings with your Phase 1-2 system.
  // If Phase 1-2 expects 'graded'/'needs_review' => keep them.
  const finalStatus = isReviewRequired ? 'needs_review' : 'graded';

  const patch: any = {
    status: finalStatus,
    current_stage: 'completed',
    // If you have these columns, keep them; otherwise remove or add migration
    // total_score: totalFinalScore,
    // updated_at: new Date().toISOString(),
  };

  // If you DO have total_score, uncomment:
  if ('total_score' in (ctx.submission ?? {})) {
    patch.total_score = totalFinalScore;
  }

  // If you DO have updated_at, uncomment:
  if ('updated_at' in (ctx.submission ?? {})) {
    patch.updated_at = new Date().toISOString();
  }

  const { error: updErr } = await supabase
    .from('submissions')
    .update(patch)
    .eq('id', submissionId);

  if (updErr) throw new Error(`[FINALIZE] Failed to update submission: ${updErr.message}`);

  console.log(
    `[FINALIZE] ✅ Done. Status=${finalStatus} AutoTotal=${totalAutoScore} FinalTotal=${totalFinalScore} ReviewRequired=${isReviewRequired}`
  );

  return { finalStatus, totalAutoScore, totalFinalScore, isReviewRequired };
}