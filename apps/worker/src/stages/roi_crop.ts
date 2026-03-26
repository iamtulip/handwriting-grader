import type { WorkerContext } from './load_context'

export type RoiCrop = {
  roi_id: string
  page_number: number
  kind: string | null
  item_no: string | null
  answer_type: string | null
  points: number | null
  bbox_norm: [number, number, number, number] | null
  crop_storage_path: string | null
  region: any
}

function toBBoxNorm(region: any): [number, number, number, number] | null {
  if (
    region &&
    Number.isFinite(Number(region.x_norm)) &&
    Number.isFinite(Number(region.y_norm)) &&
    Number.isFinite(Number(region.w_norm)) &&
    Number.isFinite(Number(region.h_norm))
  ) {
    return [
      Number(region.x_norm),
      Number(region.y_norm),
      Number(region.w_norm),
      Number(region.h_norm),
    ]
  }

  if (
    region &&
    Array.isArray(region.bbox_norm) &&
    region.bbox_norm.length === 4 &&
    region.bbox_norm.every((v: unknown) => Number.isFinite(Number(v)))
  ) {
    return [
      Number(region.bbox_norm[0]),
      Number(region.bbox_norm[1]),
      Number(region.bbox_norm[2]),
      Number(region.bbox_norm[3]),
    ]
  }

  return null
}

function normalizeItemNo(region: any): string | null {
  const raw =
    region?.item_no ??
    region?.question_no ??
    region?.questionNumber ??
    region?.question_no_text ??
    null

  if (raw == null) return null

  const s = String(raw).trim()
  return s.length > 0 ? s : null
}

function normalizeAnswerType(region: any): string | null {
  const raw =
    region?.answer_type ??
    region?.expected_type ??
    region?.grader_mode ??
    null

  if (raw == null) return null

  const s = String(raw).trim()
  return s.length > 0 ? s : null
}

function normalizePoints(region: any): number | null {
  const raw = region?.points ?? region?.score_weight ?? null
  if (raw == null) return null

  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function normalizeRoiId(region: any): string {
  return String(region?.roi_id ?? region?.id ?? crypto.randomUUID())
}

export async function cropRoisForPage(
  ctx: WorkerContext,
  pageNumber: number,
  _alignment: any
): Promise<RoiCrop[]> {
  const pages = Array.isArray(ctx.layoutSpec.layout_data?.pages)
    ? ctx.layoutSpec.layout_data.pages
    : []

  const pageSpec = pages.find((p: any) => Number(p?.page_number) === Number(pageNumber))
  if (!pageSpec) return []

  const regions = Array.isArray(pageSpec?.regions) ? pageSpec.regions : []

  const rois: RoiCrop[] = regions
    .filter((region: any) =>
      ['answer', 'table_cell', 'working'].includes(String(region?.kind ?? ''))
    )
    .map((region: any) => ({
      roi_id: normalizeRoiId(region),
      page_number: Number(pageNumber),
      kind: region?.kind ?? null,
      item_no: normalizeItemNo(region),
      answer_type: normalizeAnswerType(region),
      points: normalizePoints(region),
      bbox_norm: toBBoxNorm(region),
      crop_storage_path: null,
      region,
    }))

  return rois
}