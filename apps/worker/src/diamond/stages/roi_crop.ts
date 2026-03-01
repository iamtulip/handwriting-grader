// apps/worker/src/diamond/stages/roi_crop.ts
import { supabase } from '../../lib/supabase';
import { setStage } from '../utils/stage';

export type CroppedRoi = {
  roi_id: string;
  page_number: number;
  layout_spec_version: number;
  storage_path: string;
  config: any;
};

export async function cropRoisForPage(ctx: any, pageNo: number, alignment: any): Promise<CroppedRoi[]> {
  const submissionId = ctx.submission.id;

  await setStage(submissionId, `v2:crop_page_${pageNo}`);

  console.log(`[CROP] Cropping ROIs for Page ${pageNo}`);

  // 1) find page in spec
  const spec = ctx.layoutSpec;
  const specVersion = spec.version; // important: lock version
  const pages = spec.layout_data?.pages ?? [];

  const specPage = pages.find((p: any) => p.page_number === pageNo);

  // Policy: missing spec page => mark review_required + write artifact
  if (!specPage) {
    console.warn(`[CROP] No layout spec found for page ${pageNo}. Marking review_required.`);

    // store artifact for audit
    const { error: artErr } = await supabase.from('submission_artifacts').upsert(
      {
        submission_id: submissionId,
        page_number: pageNo,
        step_name: 'v2:crop_missing_spec_page',
        artifact_type: 'json_metadata',
        data: { message: 'No layout spec for this page', layout_spec_version: specVersion },
      },
      { onConflict: 'submission_id,page_number,step_name,artifact_type' }
    );

    if (artErr) throw new Error(`[CROP] Failed to save missing-spec artifact: ${artErr.message}`);

    // mark stage to review
    await setStage(submissionId, 'review_required');
    return [];
  }

  const roiResults: CroppedRoi[] = [];

  for (const roi of specPage.rois ?? []) {
    await setStage(submissionId, `v2:crop_roi_${pageNo}_${roi.id}`);

    // Simulation crop output path
    // In production: apply alignment.transform_matrix + polygon_norm => crop => upload derived => get path
    const mockCropPath = `derived/submissions/${submissionId}/p${pageNo}_${roi.id}.png`;

    const { error } = await supabase.from('submission_artifacts').upsert(
      {
        submission_id: submissionId,
        page_number: pageNo,
        step_name: `v2:roi_crop:${roi.id}`,
        artifact_type: 'image_path',
        storage_path: mockCropPath,
        data: {
          roi_id: roi.id,
          layout_spec_version: specVersion,
          alignment_rmse: alignment?.rmse ?? null,
        },
      },
      { onConflict: 'submission_id,page_number,step_name,artifact_type' }
    );

    if (error) throw new Error(`[CROP] Failed to save ROI artifact for ${roi.id}: ${error.message}`);

    roiResults.push({
      roi_id: roi.id,
      page_number: pageNo,
      layout_spec_version: specVersion,
      storage_path: mockCropPath,
      config: roi,
    });
  }

  return roiResults;
}