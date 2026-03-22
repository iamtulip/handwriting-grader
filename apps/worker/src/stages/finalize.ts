import { supabase } from '../lib/supabase'
import type { WorkerContext } from './load_context'

export async function finalizeSubmission(ctx: WorkerContext) {
  const { data: results, error } = await supabase
    .from('grading_results')
    .select(`
      final_score,
      auto_score,
      selected_candidate_id
    `)
    .eq('submission_id', ctx.submission.id)

  if (error) {
    throw error
  }

  const rows = results ?? []
  const totalScore = rows.reduce((sum, row) => sum + Number(row.final_score ?? 0), 0)

  const hasLowCoverage = rows.length === 0 || rows.some((row) => !row.selected_candidate_id)

  const nextStatus = hasLowCoverage ? 'needs_review' : 'graded'
  const nextStage = hasLowCoverage ? 'v2:needs_review' : 'v2:graded'

  const { error: updateError } = await supabase
    .from('submissions')
    .update({
      status: nextStatus,
      current_stage: nextStage,
      auto_total_score: totalScore,
      final_total_score: totalScore,
    })
    .eq('id', ctx.submission.id)

  if (updateError) {
    throw updateError
  }
}