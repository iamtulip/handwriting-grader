import 'dotenv/config'
import { supabase } from './lib/supabase'
import { loadContext } from './stages/load_context'
import { runAlignmentForPage } from './stages/alignment'
import { cropRoisForPage } from './stages/roi_crop'
import { runOcrEnsembleForRoi } from './stages/ocr_ensemble'
import { persistCandidates } from './stages/candidate_persist'
import { deterministicGradeRoi } from './stages/math_grade'
import { verifyRoiIfNeeded } from './stages/verifier'
import { finalizeSubmission } from './stages/finalize'
import { setStage } from './utils/stage'

const POLL_INTERVAL_MS = 3000
const PIPELINE_VERSION = 'v2'

async function lockNextJob(): Promise<string | null> {
  const { data: jobs, error } = await supabase
    .from('submissions')
    .select('id')
    .eq('pipeline_version', PIPELINE_VERSION)
    .in('current_stage', ['pending', 'v2:queued'])
    .limit(1)

  if (error) {
    console.error('[worker] failed to poll jobs', error)
    return null
  }

  if (!jobs || jobs.length === 0) {
    return null
  }

  const submissionId = jobs[0].id as string

  const { data: locked, error: lockError } = await supabase
    .from('submissions')
    .update({ current_stage: 'v2:queued' })
    .eq('id', submissionId)
    .in('current_stage', ['pending', 'v2:queued'])
    .select('id')
    .single()

  if (lockError || !locked) {
    return null
  }

  return submissionId
}

export async function pollAndProcessV2() {
  try {
    const submissionId = await lockNextJob()
    if (!submissionId) return
    await processSubmissionV2(submissionId)
  } catch (error) {
    console.error('[worker] pollAndProcessV2 error', error)
  }
}

export async function processSubmissionV2(submissionId: string) {
  const ctx = await loadContext(submissionId)

  try {
    await setStage(submissionId, 'v2:loading_context')

    for (const pageFile of ctx.pages) {
      const pageNo = pageFile.page_number

      await setStage(submissionId, `v2:aligning:p${pageNo}`)
      const alignment = await runAlignmentForPage(ctx, pageFile)

      await setStage(submissionId, `v2:cropping:p${pageNo}`)
      const roiCrops = await cropRoisForPage(ctx, pageNo, alignment)

      for (const roi of roiCrops) {
        await setStage(submissionId, `v2:ocr:p${pageNo}:roi:${roi.roi_id}`)
        const rawCandidates = await runOcrEnsembleForRoi(ctx, roi)

        await setStage(submissionId, `v2:candidates:p${pageNo}:roi:${roi.roi_id}`)
        const dbCandidates = await persistCandidates(ctx, roi, rawCandidates)

        await setStage(submissionId, `v2:grading:p${pageNo}:roi:${roi.roi_id}`)
        const grade = await deterministicGradeRoi(ctx, roi, dbCandidates)

        await setStage(submissionId, `v2:verify:p${pageNo}:roi:${roi.roi_id}`)
        const final = await verifyRoiIfNeeded(ctx, roi, dbCandidates, grade)

        const { error } = await supabase.from('grading_results').upsert(
          {
            submission_id: submissionId,
            roi_id: roi.roi_id,
            page_number: pageNo,
            layout_spec_version: ctx.layoutSpec.version,
            auto_score: final.auto_score,
            final_score: final.final_score,
            selected_candidate_id: final.selected_candidate_id,
            evidence_map: final.evidence_map ?? null,
            is_human_override: false,
          },
          { onConflict: 'submission_id,roi_id,page_number,layout_spec_version' as any }
        )

        if (error) {
          throw error
        }
      }
    }

    await finalizeSubmission(ctx)
    await setStage(submissionId, 'v2:done')
  } catch (error: any) {
    console.error(`[worker] processSubmissionV2 failed for ${submissionId}`, error)

    await supabase
      .from('submissions')
      .update({
        current_stage: 'v2:error',
        status: 'needs_review',
        last_error: error?.message ?? 'Unknown worker error',
      })
      .eq('id', submissionId)

    throw error
  }
}

setInterval(() => {
  void pollAndProcessV2()
}, POLL_INTERVAL_MS)