import crypto from 'crypto'
import sharp from 'sharp'
import { supabase } from '../lib/supabase'
import type { WorkerContext } from './load_context'

const SUBMISSION_BUCKET = process.env.SUBMISSION_FILES_BUCKET || 'submission-files'

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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function normalizeRoiId(region: any): string {
  return String(region?.roi_id ?? region?.id ?? crypto.randomUUID())
}

/**
 * Layout editor stores bbox_norm as [x1, y1, x2, y2]
 * Worker converts it to [x, y, w, h]
 */
function normalizeBBox(region: any): [number, number, number, number] | null {
  if (
    region?.x_norm != null &&
    region?.y_norm != null &&
    region?.w_norm != null &&
    region?.h_norm != null
  ) {
    const x = clamp01(asNumber(region.x_norm, 0))
    const y = clamp01(asNumber(region.y_norm, 0))
    const w = asNumber(region.w_norm, 0)
    const h = asNumber(region.h_norm, 0)

    if (w <= 0 || h <= 0) return null

    return [
      x,
      y,
      clamp01(Math.min(w, 1 - x)),
      clamp01(Math.min(h, 1 - y)),
    ]
  }

  const raw = region?.bbox_norm ?? region?.bbox ?? null
  if (!Array.isArray(raw) || raw.length < 4) return null

  const a = clamp01(asNumber(raw[0], 0))
  const b = clamp01(asNumber(raw[1], 0))
  const c = clamp01(asNumber(raw[2], 0))
  const d = clamp01(asNumber(raw[3], 0))

  const x1 = Math.min(a, c)
  const y1 = Math.min(b, d)
  const x2 = Math.max(a, c)
  const y2 = Math.max(b, d)

  const w = x2 - x1
  const h = y2 - y1

  if (w <= 0 || h <= 0) return null

  return [x1, y1, w, h]
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

function compareRoiOrder(a: RoiCrop, b: RoiCrop): number {
  const aItem = Number(a.item_no ?? a.question_no ?? NaN)
  const bItem = Number(b.item_no ?? b.question_no ?? NaN)

  if (Number.isFinite(aItem) && Number.isFinite(bItem)) {
    return aItem - bItem
  }

  return String(a.roi_id).localeCompare(String(b.roi_id))
}

async function downloadPageBuffer(storagePath: string): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from(SUBMISSION_BUCKET)
    .download(storagePath)

  if (error || !data) {
    throw new Error(error?.message || `Failed to download page image: ${storagePath}`)
  }

  return Buffer.from(await data.arrayBuffer())
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2
  return sorted[mid]
}

function buildAnswerColumnBounds(rois: RoiCrop[]): [number, number] | null {
  const xs1 = rois
    .map((r) => r.bbox_norm?.[0] ?? null)
    .filter((v): v is number => v != null)

  const xs2 = rois
    .map((r) => {
      const b = r.bbox_norm
      return b ? b[0] + b[2] : null
    })
    .filter((v): v is number => v != null)

  if (xs1.length === 0 || xs2.length === 0) return null

  const left = median(xs1)
  const right = median(xs2)

  if (right <= left) return null

  const width = right - left
  return [
    clamp01(left - width * 0.04),
    clamp01(right + width * 0.04),
  ]
}

function buildRowBands(
  rois: RoiCrop[]
): Array<{ top: number; bottom: number }> {
  const bands: Array<{ top: number; bottom: number }> = []

  for (let i = 0; i < rois.length; i += 1) {
    const current = rois[i].bbox_norm
    if (!current) {
      bands.push({ top: 0, bottom: 1 })
      continue
    }

    const currentTop = current[1]
    const currentBottom = current[1] + current[3]
    const currentCenter = currentTop + current[3] / 2

    const prev = i > 0 ? rois[i - 1].bbox_norm : null
    const next = i < rois.length - 1 ? rois[i + 1].bbox_norm : null

    const prevCenter = prev ? prev[1] + prev[3] / 2 : null
    const nextCenter = next ? next[1] + next[3] / 2 : null

    const top =
      prevCenter != null
        ? (prevCenter + currentCenter) / 2
        : Math.max(0, currentTop - current[3] * 0.45)

    const bottom =
      nextCenter != null
        ? (nextCenter + currentCenter) / 2
        : Math.min(1, currentBottom + current[3] * 0.45)

    bands.push({
      top: clamp01(top),
      bottom: clamp01(bottom),
    })
  }

  return bands
}

type GrayPage = {
  width: number
  height: number
  data: Buffer
}

async function loadGrayPage(pageBuffer: Buffer): Promise<GrayPage> {
  const { data, info } = await sharp(pageBuffer)
    .rotate()
    .grayscale()
    .normalize()
    .raw()
    .toBuffer({ resolveWithObject: true })

  return {
    width: info.width,
    height: info.height,
    data,
  }
}

function pixelAt(gray: GrayPage, x: number, y: number): number {
  const idx = y * gray.width + x
  return gray.data[idx] ?? 255
}

function snapInkBoxWithinSearch(
  gray: GrayPage,
  search: [number, number, number, number]
): [number, number, number, number] | null {
  const [sx, sy, sw, sh] = search

  const left = Math.max(0, Math.floor(sx * gray.width))
  const top = Math.max(0, Math.floor(sy * gray.height))
  const right = Math.min(gray.width, Math.ceil((sx + sw) * gray.width))
  const bottom = Math.min(gray.height, Math.ceil((sy + sh) * gray.height))

  const width = right - left
  const height = bottom - top

  if (width <= 3 || height <= 3) return null

  const rowDark = new Array<number>(height).fill(0)
  const colDark = new Array<number>(width).fill(0)

  const darkThreshold = 170

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = pixelAt(gray, left + x, top + y)
      if (value < darkThreshold) {
        rowDark[y] += 1
        colDark[x] += 1
      }
    }
  }

  const rowDensity = rowDark.map((v) => v / width)
  const colDensity = colDark.map((v) => v / height)

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let inkCount = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = pixelAt(gray, left + x, top + y)
      if (value >= darkThreshold) continue

      const rd = rowDensity[y]
      const cd = colDensity[x]

      // ตัดเส้นตารางยาว ๆ ออก
      if (rd > 0.82 || cd > 0.82) continue

      // ต้องมีความหนาแน่นอย่างน้อยเล็กน้อย
      if (rd < 0.01 && cd < 0.01) continue

      inkCount += 1
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  if (inkCount < 12) return null
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null

  const boxW = maxX - minX + 1
  const boxH = maxY - minY + 1

  const padX = Math.max(3, Math.round(boxW * 0.18))
  const padY = Math.max(3, Math.round(boxH * 0.28))

  const finalLeft = Math.max(0, left + minX - padX)
  const finalTop = Math.max(0, top + minY - padY)
  const finalRight = Math.min(gray.width, left + maxX + 1 + padX)
  const finalBottom = Math.min(gray.height, top + maxY + 1 + padY)

  const finalW = finalRight - finalLeft
  const finalH = finalBottom - finalTop

  if (finalW <= 3 || finalH <= 3) return null

  return [
    finalLeft / gray.width,
    finalTop / gray.height,
    finalW / gray.width,
    finalH / gray.height,
  ]
}

function applyFallbackInset(
  bbox: [number, number, number, number],
  kind: string
): [number, number, number, number] {
  const [x, y, w, h] = bbox
  const isAnswerLike = ['answer', 'table_cell'].includes(kind)

  const insetX = w * (isAnswerLike ? 0.035 : 0.01)
  const insetY = h * (isAnswerLike ? 0.14 : 0.03)

  const nx = clamp01(x + insetX)
  const ny = clamp01(y + insetY)
  const nw = Math.max(0.001, Math.min(w - insetX * 2, 1 - nx))
  const nh = Math.max(0.001, Math.min(h - insetY * 2, 1 - ny))

  return [nx, ny, nw, nh]
}

function buildSearchBox(
  current: [number, number, number, number],
  band: { top: number; bottom: number },
  answerColumn: [number, number] | null
): [number, number, number, number] {
  const [x, y, w, h] = current

  const fallbackX1 = clamp01(x)
  const fallbackX2 = clamp01(x + w)

  const colLeft = answerColumn ? answerColumn[0] : fallbackX1
  const colRight = answerColumn ? answerColumn[1] : fallbackX2

  const searchX1 = clamp01(Math.min(colLeft, fallbackX1) + 0.006)
  const searchX2 = clamp01(Math.max(colRight, fallbackX2) - 0.006)

  const searchTop = clamp01(Math.min(band.top, y))
  const searchBottom = clamp01(Math.max(band.bottom, y + h))

  return [
    searchX1,
    searchTop,
    Math.max(0.001, searchX2 - searchX1),
    Math.max(0.001, searchBottom - searchTop),
  ]
}

export async function cropRoisForPage(
  ctx: WorkerContext,
  pageNumber: number,
  _alignment: any
): Promise<RoiCrop[]> {
  const regions = pageRegionsFromLayout(ctx, pageNumber)

  const initialRois: RoiCrop[] = regions
    .filter((region: any) =>
      ['answer', 'table_cell', 'working'].includes(String(region?.kind ?? 'answer'))
    )
    .map((region: any) => {
      const kind = String(region?.kind ?? 'answer')
      const bbox = normalizeBBox(region)

      return {
        roi_id: normalizeRoiId(region),
        page_number: Number(pageNumber),
        kind,
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
        bbox_norm: bbox,
        crop_storage_path: null,
      }
    })
    .filter((roi: RoiCrop) => roi.bbox_norm !== null)
    .sort(compareRoiOrder)

  if (initialRois.length === 0) {
    return []
  }

  const pageFile = ctx.pages.find(
    (p) => Number(p.page_number) === Number(pageNumber)
  )

  if (!pageFile?.storage_path) {
    return initialRois.map((roi) => ({
      ...roi,
      bbox_norm: roi.bbox_norm ? applyFallbackInset(roi.bbox_norm, roi.kind) : null,
    }))
  }

  try {
    const pageBuffer = await downloadPageBuffer(pageFile.storage_path)
    const grayPage = await loadGrayPage(pageBuffer)

    const answerColumn = buildAnswerColumnBounds(initialRois)
    const rowBands = buildRowBands(initialRois)

    const refined = initialRois.map((roi, index) => {
      const bbox = roi.bbox_norm
      if (!bbox) return roi

      const search = buildSearchBox(bbox, rowBands[index], answerColumn)
      const snapped = snapInkBoxWithinSearch(grayPage, search)

      return {
        ...roi,
        bbox_norm: snapped ?? applyFallbackInset(bbox, roi.kind),
      }
    })

    return refined
  } catch (error) {
    console.warn('[worker] cropRoisForPage alignment fallback', {
      submissionId: ctx.submission.id,
      pageNumber,
      error: error instanceof Error ? error.message : String(error),
    })

    return initialRois.map((roi) => ({
      ...roi,
      bbox_norm: roi.bbox_norm ? applyFallbackInset(roi.bbox_norm, roi.kind) : null,
    }))
  }
}