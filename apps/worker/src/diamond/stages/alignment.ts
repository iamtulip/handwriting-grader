// apps/worker/src/diamond/stages/alignment.ts
import { supabase } from '../../lib/supabase';
import { setStage } from '../utils/stage';

export type AlignmentProof = {
  transform_matrix: number[]; // 3x3 flatten length 9
  rmse: number;
  source_page: number;
  mode: 'mock' | 'opencv';
};

export async function runAlignmentForPage(ctx: any, pageFile: any): Promise<AlignmentProof> {
  const submissionId = ctx.submission.id;
  const pageNo = pageFile.page_number;

  await setStage(submissionId, `v2:align_page_${pageNo}`);

  console.log(`[ALIGN] Stage: 2-Pass Alignment for Page ${pageNo}`);

  // 1) Idempotency: check existing artifact
  const { data: existing, error: findErr } = await supabase
    .from('submission_artifacts')
    .select('data')
    .eq('submission_id', submissionId)
    .eq('page_number', pageNo)
    .eq('step_name', 'v2:alignment_proof')
    .eq('artifact_type', 'json_metadata')
    .maybeSingle();

  if (findErr) {
    throw new Error(`[ALIGN] Failed to query existing artifact: ${findErr.message}`);
  }

  if (existing?.data) {
    console.log(`[ALIGN] Found existing proof for page ${pageNo}, skipping...`);
    return existing.data as AlignmentProof;
  }

  // 2) Mock alignment (replace later with OpenCV/Python)
  const mockMatrix = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];
  const mockRmse = 0.015;

  const alignmentData: AlignmentProof = {
    transform_matrix: mockMatrix,
    rmse: mockRmse,
    source_page: pageNo,
    mode: 'mock',
  };

  // 3) Save artifact (idempotent upsert)
  const { error: upsertErr } = await supabase.from('submission_artifacts').upsert(
    {
      submission_id: submissionId,
      page_number: pageNo,
      step_name: 'v2:alignment_proof',
      artifact_type: 'json_metadata',
      data: alignmentData,
      // NOTE: in production store aligned image path here (not original)
      storage_path: pageFile.storage_path,
    },
    { onConflict: 'submission_id,page_number,step_name,artifact_type' }
  );

  if (upsertErr) {
    throw new Error(`[ALIGN] Failed to save alignment artifact: ${upsertErr.message}`);
  }

  console.log(`[ALIGN] ✅ Alignment completed. RMSE: ${mockRmse}`);

  return alignmentData;
}