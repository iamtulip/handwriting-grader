// apps/worker/src/diamond/orchestrator.ts
import { supabase } from '../lib/supabase'
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

export async function pollAndProcessV2() {
  try {
    // 1) ดึงงานที่พร้อมทำ (คุมด้วย pipeline_version)
    const { data: jobs } = await supabase
      .from('submissions')
      .select('id')
      .eq('pipeline_version', 'v2')
      .in('current_stage', ['pending', 'v2:queued'])
      .limit(1)

    if (!jobs || jobs.length === 0) return

    const submissionId = jobs[0].id

    // 2) Atomic lock กัน worker แย่งกันทำ
    const { data: locked } = await supabase
      .from('submissions')
      .update({ current_stage: 'v2:queued' })
      .eq('id', submissionId)
      .in('current_stage', ['pending', 'v2:queued'])
      .select('id')
      .single()

    if (!locked) return

    await processSubmissionV2(submissionId)
  } catch (e) {
    console.error('[V2] poll error', e)
  }
}

export async function processSubmissionV2(submissionId: string) {
  // โหลด context (submission + locked spec + pages + layout)
  const ctx = await loadContext(submissionId)

  // ===== Multi-page loop =====
  for (const pageFile of ctx.pages) {
    const pageNo = pageFile.page_number

    await setStage(submissionId, `v2:aligning:p${pageNo}`)

    // 1) Alignment per page (สร้าง aligned artifact)
    const align = await runAlignmentForPage(ctx, pageFile)

    await setStage(submissionId, `v2:cropping:p${pageNo}`)

    // 2) Crop ROIs per page (ได้รายการ roi crops)
    const roiCrops = await cropRoisForPage(ctx, pageNo, align)

    // 3) ROI loop
    for (const roi of roiCrops) {
      await setStage(submissionId, `v2:ocr:p${pageNo}:roi:${roi.roi_id}`)

      // 3.1 OCR ensemble (A/B/Mathpix เฉพาะจำเป็น)
      const rawCandidates = await runOcrEnsembleForRoi(ctx, roi)

      await setStage(submissionId, `v2:candidates:p${pageNo}:roi:${roi.roi_id}`)

      // 3.2 Persist candidates (audit-ready + idempotent)
      const dbCandidates = await persistCandidates(ctx, roi, rawCandidates)

      await setStage(submissionId, `v2:grading:roi:${roi.roi_id}`)

      // 3.3 Deterministic grading (math normalizer + tolerance)
      const grade = await deterministicGradeRoi(ctx, roi, dbCandidates)

      // 3.4 Verifier only if needed (disagree/low confidence)
      const final = await verifyRoiIfNeeded(ctx, roi, dbCandidates, grade)

      // 3.5 Save grading_results (selected_candidate_id + evidence_map)
      await supabase.from('grading_results').upsert({
        submission_id: submissionId,
        roi_id: roi.roi_id,
        page_number: pageNo,
        layout_spec_version: ctx.layoutSpec.version,
        auto_score: final.auto_score,
        final_score: final.final_score,
        selected_candidate_id: final.selected_candidate_id,
        evidence_map: final.evidence_map ?? null,
        is_human_override: false
      }, { onConflict: 'submission_id,roi_id,page_number,layout_spec_version' as any })
    }
  }

  // ===== Finalize =====
  await finalizeSubmission(ctx)
  await setStage(submissionId, 'v2:done')
}

// loop runner
setInterval(() => pollAndProcessV2(), POLL_INTERVAL_MS)