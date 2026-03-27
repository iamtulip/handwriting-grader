import crypto from 'crypto'
import type { WorkerContext } from './load_context'

export type RoiCrop = {
  roi_id: string
  page_number: number
  kind: string
  item_no: string | null
  question_no: string | null
  answer_type: string | null
  points: number | null
  score_weight: number | null
  bbox_norm: [number, number, number, number] | null
  crop_storage_path?: string | null
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s.length > 0 ? s : null
}

function normalizeRoiId(region: any): string {
  return String(region?.roi_id ?? region?.id ?? crypto.randomUUID())
}

function normalizeBBox(region: any): [number, number, number, number] | null {
  const raw = region?.bbox_norm ?? region?.bbox ?? null
  if (!Array.isArray(raw) || raw.length < 4) return null

  const x = asNumber(raw[0], 0)
  const y = asNumber(raw[1], 0)
  const w = asNumber(raw[2], 0)
  const h = asNumber(raw[3], 0)

  if (w <= 0 || h <= 0) return null

  return [x, y, w, h]
}

function normalizePageNumber(page: any, fallback: number): number {
  return asNumber(page?.page_number ?? page?.page_index ?? fallback, fallback)
}

function pageRegionsFromLayout(ctx: WorkerContext, pageNumber: number): any[] {
  const pages = Array.isArray(ctx.layoutSpec?.layout_data?.pages)
    ? ctx.layoutSpec.layout_data.pages
    : []

  const pageSpec = pages.find(
    (p: any) => normalizePageNumber(p, -1) === Number(pageNumber)
  )

  if (!pageSpec) return []

  return Array.isArray(pageSpec.regions) ? pageSpec.regions : []
}

export async function cropRoisForPage(
  ctx: WorkerContext,
  pageNumber: number,
  _alignment: any
): Promise<RoiCrop[]> {
  const regions = pageRegionsFromLayout(ctx, pageNumber)

  const rois: RoiCrop[] = regions
    .filter((region: any) =>
      ['answer', 'table_cell', 'working'].includes(String(region?.kind ?? 'answer'))
    )
    .map((region: any) => ({
      roi_id: normalizeRoiId(region),
      page_number: Number(pageNumber),
      kind: String(region?.kind ?? 'answer'),
      item_no: asNullableString(region?.item_no),
      question_no: asNullableString(region?.question_no),
      answer_type: asNullableString(region?.answer_type ?? region?.kind ?? 'text'),
      points: region?.points != null ? asNumber(region.points, 0) : null,
      score_weight:
        region?.score_weight != null
          ? asNumber(region.score_weight, 1)
          : region?.points != null
          ? asNumber(region.points, 1)
          : 1,
      bbox_norm: normalizeBBox(region),
      crop_storage_path: null,
    }))
    .filter((roi: RoiCrop) => roi.bbox_norm !== null)

  return rois
}