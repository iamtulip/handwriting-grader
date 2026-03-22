import type { WorkerContext, WorkerRegion } from './load_context'
import type { AlignmentResult } from './alignment'

export type RoiCrop = {
  roi_id: string
  page_number: number
  kind: string
  question_no: number | null
  subquestion_no: string | null
  part_no: string | null
  group_id: string | null
  answer_type: string | null
  score_weight: number
  grader: Record<string, unknown> | null
  crop_storage_path: string
  bbox_norm: [number, number, number, number] | null
}

function isCropEligible(region: WorkerRegion) {
  return ['answer', 'table_cell', 'identity', 'working'].includes(region.kind)
}

export async function cropRoisForPage(
  ctx: WorkerContext,
  pageNumber: number,
  alignment: AlignmentResult
): Promise<RoiCrop[]> {
  const page = ctx.layoutSpec.layout_data.pages.find((p) => p.page_number === pageNumber)
  if (!page) return []

  const output: RoiCrop[] = []

  for (const region of page.regions) {
    if (!isCropEligible(region)) continue

    output.push({
      roi_id: region.id,
      page_number: pageNumber,
      kind: region.kind,
      question_no: region.question_no ?? null,
      subquestion_no: region.subquestion_no ?? null,
      part_no: region.part_no ?? null,
      group_id: region.group_id ?? null,
      answer_type: region.answer_type ?? null,
      score_weight: Number(region.score_weight ?? 1),
      grader: region.grader ?? null,
      crop_storage_path: `${alignment.aligned_storage_path}#roi=${region.id}`,
      bbox_norm: region.bbox_norm ?? null,
    })
  }

  return output
}