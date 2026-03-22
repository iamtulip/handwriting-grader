import type { SubmissionPageFile, WorkerContext } from './load_context'

export type AlignmentResult = {
  page_number: number
  aligned_storage_path: string
  transform_matrix: number[]
  rmse_error: number
  quality_gate: {
    blur_score: number
    shadow_score: number
    skew_angle_deg: number
    passed: boolean
  }
}

export async function runAlignmentForPage(
  _ctx: WorkerContext,
  pageFile: SubmissionPageFile
): Promise<AlignmentResult> {
  return {
    page_number: pageFile.page_number,
    aligned_storage_path: pageFile.storage_path,
    transform_matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    rmse_error: 0,
    quality_gate: {
      blur_score: 1,
      shadow_score: 0,
      skew_angle_deg: 0,
      passed: true,
    },
  }
}