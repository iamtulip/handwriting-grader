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

type GrayPage = {
  width: number
  height: number
  data: Buffer
}

type PxBox = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

type InkComponent = {
  left: number
  top: number
  right: number
  bottom: number
  area: number
  cx: number
  cy: number
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

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const arr = [...values].sort((a, b) => a - b)
  const mid = Math.floor(arr.length / 2)
  return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid]
}

function normalizeRoiId(region: any): string {
  return String(region?.roi_id ?? region?.id ?? crypto.randomUUID())
}

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

function buildInitialRois(ctx: WorkerContext, pageNumber: number): RoiCrop[] {
  const regions = pageRegionsFromLayout(ctx, pageNumber)

  return regions
    .filter((region: any) =>
      ['answer', 'table_cell', 'working'].includes(String(region?.kind ?? 'answer'))
    )
    .map((region: any) => {
      const bbox = normalizeBBox(region)

      return {
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
        bbox_norm: bbox,
        crop_storage_path: null,
      }
    })
    .filter((roi) => roi.bbox_norm !== null)
    .sort(compareRoiOrder)
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

function normToPx(gray: GrayPage, bbox: [number, number, number, number]): PxBox {
  const [x, y, w, h] = bbox

  const left = clampInt(Math.floor(x * gray.width), 0, gray.width - 1)
  const top = clampInt(Math.floor(y * gray.height), 0, gray.height - 1)
  const right = clampInt(Math.ceil((x + w) * gray.width), left + 1, gray.width)
  const bottom = clampInt(Math.ceil((y + h) * gray.height), top + 1, gray.height)

  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  }
}

function pxToNorm(
  gray: GrayPage,
  left: number,
  top: number,
  right: number,
  bottom: number
): [number, number, number, number] {
  return [
    left / gray.width,
    top / gray.height,
    Math.max(1, right - left) / gray.width,
    Math.max(1, bottom - top) / gray.height,
  ]
}

function insetNormBox(
  bbox: [number, number, number, number],
  insetXRatio: number,
  insetYRatio: number
): [number, number, number, number] {
  const [x, y, w, h] = bbox
  const insetX = w * insetXRatio
  const insetY = h * insetYRatio

  const nx = clamp01(x + insetX)
  const ny = clamp01(y + insetY)
  const nw = Math.max(0.001, Math.min(w - insetX * 2, 1 - nx))
  const nh = Math.max(0.001, Math.min(h - insetY * 2, 1 - ny))

  return [nx, ny, nw, nh]
}

function fallbackInset(
  bbox: [number, number, number, number]
): [number, number, number, number] {
  return insetNormBox(bbox, 0.03, 0.10)
}

function buildAnswerColumnRange(rois: RoiCrop[]): [number, number] | null {
  const lefts: number[] = []
  const rights: number[] = []

  for (const roi of rois) {
    if (!roi.bbox_norm) continue
    lefts.push(roi.bbox_norm[0])
    rights.push(roi.bbox_norm[0] + roi.bbox_norm[2])
  }

  if (lefts.length === 0 || rights.length === 0) return null

  const left = median(lefts)
  const right = median(rights)

  if (right <= left) return null

  const width = right - left

  return [
    clamp01(left - width * 0.03),
    clamp01(right + width * 0.03),
  ]
}

function detectVerticalDarkLines(
  gray: GrayPage,
  xStart: number,
  xEnd: number
): number[] {
  const densities: number[] = new Array(gray.width).fill(0)

  for (let x = xStart; x < xEnd; x += 1) {
    let dark = 0
    for (let y = 0; y < gray.height; y += 1) {
      if (pixelAt(gray, x, y) < 150) dark += 1
    }
    densities[x] = dark / gray.height
  }

  const raw: number[] = []
  let clusterStart = -1

  for (let x = xStart; x < xEnd; x += 1) {
    if (densities[x] >= 0.35) {
      if (clusterStart < 0) clusterStart = x
    } else if (clusterStart >= 0) {
      raw.push(Math.round((clusterStart + x - 1) / 2))
      clusterStart = -1
    }
  }

  if (clusterStart >= 0) raw.push(Math.round((clusterStart + xEnd - 1) / 2))

  const merged: number[] = []
  for (const p of raw) {
    const last = merged[merged.length - 1]
    if (last == null || Math.abs(last - p) > 8) {
      merged.push(p)
    } else {
      merged[merged.length - 1] = Math.round((last + p) / 2)
    }
  }

  return merged
}

function detectHorizontalTableLines(
  gray: GrayPage,
  answerColumnPx: [number, number] | null
): number[] {
  const scanX1 = answerColumnPx
    ? clampInt(answerColumnPx[0], 0, gray.width - 1)
    : Math.floor(gray.width * 0.55)

  const scanX2 = answerColumnPx
    ? clampInt(answerColumnPx[1], scanX1 + 1, gray.width)
    : Math.floor(gray.width * 0.95)

  const densities: number[] = new Array(gray.height).fill(0)

  for (let y = 0; y < gray.height; y += 1) {
    let dark = 0
    for (let x = scanX1; x < scanX2; x += 1) {
      if (pixelAt(gray, x, y) < 150) dark += 1
    }
    densities[y] = dark / Math.max(1, scanX2 - scanX1)
  }

  const raw: number[] = []
  let clusterStart = -1

  for (let y = 0; y < densities.length; y += 1) {
    if (densities[y] >= 0.45) {
      if (clusterStart < 0) clusterStart = y
    } else if (clusterStart >= 0) {
      raw.push(Math.round((clusterStart + y - 1) / 2))
      clusterStart = -1
    }
  }

  if (clusterStart >= 0) {
    raw.push(Math.round((clusterStart + densities.length - 1) / 2))
  }

  const merged: number[] = []
  for (const p of raw) {
    const last = merged[merged.length - 1]
    if (last == null || Math.abs(last - p) > 6) {
      merged.push(p)
    } else {
      merged[merged.length - 1] = Math.round((last + p) / 2)
    }
  }

  return merged
}

function nearestLineAbove(lines: number[], y: number): number | null {
  let best: number | null = null
  for (const line of lines) {
    if (line <= y) best = line
    else break
  }
  return best
}

function nearestLineBelow(lines: number[], y: number): number | null {
  for (const line of lines) {
    if (line >= y) return line
  }
  return null
}

/**
 * เปลี่ยนจากใช้ cy ล้วน ๆ มาใช้ช่วง overlap กับ row cell จริง
 */
function findBestRowWindow(
  px: PxBox,
  rowLines: number[]
): { top: number; bottom: number } | null {
  if (rowLines.length < 2) return null

  let best: { top: number; bottom: number } | null = null
  let bestScore = -Infinity

  const roiTop = px.top
  const roiBottom = px.bottom
  const roiCenter = (roiTop + roiBottom) / 2

  for (let i = 0; i < rowLines.length - 1; i += 1) {
    const rowTop = rowLines[i]
    const rowBottom = rowLines[i + 1]
    if (rowBottom <= rowTop) continue

    const overlap = Math.max(0, Math.min(roiBottom, rowBottom) - Math.max(roiTop, rowTop))
    const rowCenter = (rowTop + rowBottom) / 2
    const centerDist = Math.abs(roiCenter - rowCenter)
    const rowHeight = rowBottom - rowTop

    const score =
      overlap * 3 -
      centerDist * 1.2 -
      Math.abs(rowHeight - px.height) * 0.2

    if (score > bestScore) {
      bestScore = score
      best = { top: rowTop, bottom: rowBottom }
    }
  }

  return best
}

function snapRoiToDetectedRow(
  gray: GrayPage,
  bbox: [number, number, number, number],
  rowLines: number[],
  answerColumnPx: [number, number] | null
): [number, number, number, number] {
  const px = normToPx(gray, bbox)

  const rowWindow = findBestRowWindow(px, rowLines)
  const topLine = rowWindow?.top ?? nearestLineAbove(rowLines, Math.round((px.top + px.bottom) / 2))
  const bottomLine = rowWindow?.bottom ?? nearestLineBelow(rowLines, Math.round((px.top + px.bottom) / 2))

  const colLeft = answerColumnPx ? answerColumnPx[0] : px.left
  const colRight = answerColumnPx ? answerColumnPx[1] : px.right

  const colInset = Math.max(8, Math.floor((colRight - colLeft) * 0.04))
  const left = clampInt(colLeft + colInset, 0, gray.width - 2)
  const right = clampInt(colRight - colInset, left + 1, gray.width)

  const rowHeight = topLine != null && bottomLine != null ? Math.max(1, bottomLine - topLine) : px.height

  const top = topLine != null
    ? clampInt(topLine + Math.max(6, Math.floor(rowHeight * 0.14)), 0, gray.height - 2)
    : clampInt(px.top + Math.max(4, Math.floor(px.height * 0.08)), 0, gray.height - 2)

  const bottom = bottomLine != null
    ? clampInt(bottomLine - Math.max(6, Math.floor(rowHeight * 0.16)), top + 1, gray.height)
    : clampInt(px.bottom - Math.max(4, Math.floor(px.height * 0.08)), top + 1, gray.height)

  if (right <= left + 5 || bottom <= top + 5) {
    return bbox
  }

  return pxToNorm(gray, left, top, right, bottom)
}

function isBorderLikeComponent(c: InkComponent, cell: PxBox): boolean {
  const w = c.right - c.left
  const h = c.bottom - c.top

  if (w > cell.width * 0.72 && h <= 5) return true
  if (h > cell.height * 0.72 && w <= 5) return true

  const touchesLeft = c.left <= cell.left + 1
  const touchesRight = c.right >= cell.right - 1
  const touchesTop = c.top <= cell.top + 1
  const touchesBottom = c.bottom >= cell.bottom - 1

  if ((touchesLeft || touchesRight) && h > cell.height * 0.55 && w <= 8) return true
  if ((touchesTop || touchesBottom) && w > cell.width * 0.55 && h <= 8) return true

  return false
}

function findInkComponentsInBox(
  gray: GrayPage,
  bbox: [number, number, number, number]
): InkComponent[] {
  const px = normToPx(gray, bbox)
  const visited = new Uint8Array(px.width * px.height)
  const components: InkComponent[] = []
  const darkThreshold = 180

  const isDark = (x: number, y: number) => pixelAt(gray, x, y) < darkThreshold
  const idx = (x: number, y: number) => (y - px.top) * px.width + (x - px.left)

  for (let y = px.top; y < px.bottom; y += 1) {
    for (let x = px.left; x < px.right; x += 1) {
      const i = idx(x, y)
      if (visited[i]) continue
      visited[i] = 1

      if (!isDark(x, y)) continue

      const queue: Array<[number, number]> = [[x, y]]
      let q = 0

      let minX = x
      let minY = y
      let maxX = x
      let maxY = y
      let area = 0
      let sumX = 0
      let sumY = 0

      while (q < queue.length) {
        const [cx, cy] = queue[q++]
        area += 1
        sumX += cx
        sumY += cy

        if (cx < minX) minX = cx
        if (cx > maxX) maxX = cx
        if (cy < minY) minY = cy
        if (cy > maxY) maxY = cy

        const neighbors: Array<[number, number]> = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
          [cx - 1, cy - 1],
          [cx + 1, cy - 1],
          [cx - 1, cy + 1],
          [cx + 1, cy + 1],
        ]

        for (const [nx, ny] of neighbors) {
          if (nx < px.left || nx >= px.right || ny < px.top || ny >= px.bottom) continue
          const ni = idx(nx, ny)
          if (visited[ni]) continue
          visited[ni] = 1
          if (!isDark(nx, ny)) continue
          queue.push([nx, ny])
        }
      }

      if (area < 10) continue

      const comp: InkComponent = {
        left: minX,
        top: minY,
        right: maxX + 1,
        bottom: maxY + 1,
        area,
        cx: sumX / area,
        cy: sumY / area,
      }

      if (isBorderLikeComponent(comp, px)) continue

      const w = comp.right - comp.left
      const h = comp.bottom - comp.top
      if (w <= 3 && h <= 3) continue

      components.push(comp)
    }
  }

  return components
}

/**
 * เลือก handwriting blob แบบ bias ไปทางก้อนที่ “ครบ” มากกว่าก้อนเล็กเดี่ยว
 */
function chooseBestInkComponent(
  components: InkComponent[],
  gray: GrayPage,
  bbox: [number, number, number, number]
): InkComponent | null {
  if (components.length === 0) return null

  const px = normToPx(gray, bbox)
  const targetCx = px.left + px.width * 0.55
  const targetCy = px.top + px.height * 0.38

  let best: InkComponent | null = null
  let bestScore = -Infinity

  for (const c of components) {
    const w = c.right - c.left
    const h = c.bottom - c.top
    const centerDist = Math.hypot(c.cx - targetCx, c.cy - targetCy)

    const highPenalty = c.cy < px.top + px.height * 0.08 ? 10 : 0
    const lowPenalty = c.cy > px.top + px.height * 0.78 ? 16 : 0
    const edgePenalty =
      c.left <= px.left + 2 ||
      c.right >= px.right - 2 ||
      c.top <= px.top + 2 ||
      c.bottom >= px.bottom - 2
        ? 12
        : 0

    // bonus ถ้ากว้างพอจะเป็นเลขหลายหลัก
    const widthBonus =
      w >= px.width * 0.18 ? 8 :
      w >= px.width * 0.10 ? 4 : 0

    const heightBonus =
      h >= px.height * 0.12 ? 4 : 0

    const score =
      c.area * 0.04 +
      Math.min(w, 260) * 0.08 +
      Math.min(h, 120) * 0.04 +
      widthBonus +
      heightBonus -
      centerDist * 0.08 -
      highPenalty -
      lowPenalty -
      edgePenalty

    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }

  return best
}

function mergeComponents(components: InkComponent[]): InkComponent | null {
  if (components.length === 0) return null

  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  let area = 0
  let sumX = 0
  let sumY = 0

  for (const c of components) {
    left = Math.min(left, c.left)
    top = Math.min(top, c.top)
    right = Math.max(right, c.right)
    bottom = Math.max(bottom, c.bottom)
    area += c.area
    sumX += c.cx * c.area
    sumY += c.cy * c.area
  }

  return {
    left,
    top,
    right,
    bottom,
    area,
    cx: area > 0 ? sumX / area : 0,
    cy: area > 0 ? sumY / area : 0,
  }
}

function expandByNearbyComponents(
  best: InkComponent,
  components: InkComponent[],
  cell: PxBox
): InkComponent {
  const selected: InkComponent[] = [best]
  const bestW = best.right - best.left
  const bestH = best.bottom - best.top

  for (const c of components) {
    if (c === best) continue

    const horizontalGap =
      c.left > best.right
        ? c.left - best.right
        : best.left > c.right
          ? best.left - c.right
          : 0

    const verticalOverlap =
      Math.max(
        0,
        Math.min(best.bottom, c.bottom) - Math.max(best.top, c.top)
      )

    const nearSameBand =
      Math.abs(c.cy - best.cy) <= Math.max(18, bestH * 0.85)

    const tinyPunctuation =
      (c.right - c.left) <= 18 &&
      (c.bottom - c.top) <= 18

    const mediumNeighbor =
      (c.right - c.left) >= 6 &&
      horizontalGap <= Math.max(28, bestW * 0.55) &&
      nearSameBand

    const joinable =
      mediumNeighbor ||
      (tinyPunctuation && horizontalGap <= 28 && verticalOverlap >= 0)

    if (joinable) {
      if (c.cy > cell.top + cell.height * 0.82) continue
      selected.push(c)
    }
  }

  const merged = mergeComponents(selected)
  return merged ?? best
}

function expandComponentBox(
  gray: GrayPage,
  c: InkComponent,
  cellBox: [number, number, number, number]
): [number, number, number, number] {
  const cell = normToPx(gray, cellBox)

  const w = c.right - c.left
  const h = c.bottom - c.top

  const padX = Math.max(12, Math.round(w * 0.24))
  const padYTop = Math.max(10, Math.round(h * 0.35))
  const padYBottom = Math.max(12, Math.round(h * 0.40))

  const left = clampInt(c.left - padX, cell.left, cell.right - 1)
  const right = clampInt(c.right + padX, left + 1, cell.right)
  const top = clampInt(c.top - padYTop, cell.top, cell.bottom - 1)
  const bottom = clampInt(c.bottom + padYBottom, top + 1, cell.bottom)

  return pxToNorm(gray, left, top, right, bottom)
}

function deriveAnchoredCell(
  gray: GrayPage,
  roi: RoiCrop,
  rowLines: number[],
  answerColumnPx: [number, number] | null
): [number, number, number, number] | null {
  if (!roi.bbox_norm) return null

  const snapped = snapRoiToDetectedRow(gray, roi.bbox_norm, rowLines, answerColumnPx)
  const snappedPx = normToPx(gray, snapped)

  if (snappedPx.height > Math.max(42, gray.height * 0.14)) {
    return insetNormBox(snapped, 0.02, 0.18)
  }

  return snapped
}

export async function cropRoisForPage(
  ctx: WorkerContext,
  pageNumber: number,
  _alignment: any
): Promise<RoiCrop[]> {
  const initialRois = buildInitialRois(ctx, pageNumber)
  if (initialRois.length === 0) return []

  const pageFile = ctx.pages.find((p) => Number(p.page_number) === Number(pageNumber))
  if (!pageFile?.storage_path) {
    return initialRois.map((roi) => ({
      ...roi,
      bbox_norm: roi.bbox_norm ? fallbackInset(roi.bbox_norm) : null,
    }))
  }

  try {
    const pageBuffer = await downloadPageBuffer(pageFile.storage_path)
    const gray = await loadGrayPage(pageBuffer)

    const answerColumnNorm = buildAnswerColumnRange(initialRois)
    let answerColumnPx: [number, number] | null = null

    if (answerColumnNorm) {
      answerColumnPx = [
        clampInt(Math.floor(answerColumnNorm[0] * gray.width), 0, gray.width - 1),
        clampInt(Math.ceil(answerColumnNorm[1] * gray.width), 1, gray.width),
      ]
    }

    if (answerColumnPx) {
      const candidateLines = detectVerticalDarkLines(gray, answerColumnPx[0], answerColumnPx[1])

      if (candidateLines.length >= 2) {
        const left = candidateLines[0]
        const right = candidateLines[candidateLines.length - 1]

        if (right - left > 40) {
          const colInset = Math.max(8, Math.floor((right - left) * 0.05))
          answerColumnPx = [left + colInset, right - colInset]
        }
      }
    }

    const rowLines = detectHorizontalTableLines(gray, answerColumnPx)

    const refined = initialRois.map((roi) => {
      if (!roi.bbox_norm) return roi

      const anchoredCell = deriveAnchoredCell(gray, roi, rowLines, answerColumnPx)
      if (!anchoredCell) {
        return {
          ...roi,
          bbox_norm: fallbackInset(roi.bbox_norm),
        }
      }

      const components = findInkComponentsInBox(gray, anchoredCell)
      const best = chooseBestInkComponent(components, gray, anchoredCell)

      if (!best) {
        return {
          ...roi,
          bbox_norm: fallbackInset(anchoredCell),
        }
      }

      const anchoredCellPx = normToPx(gray, anchoredCell)
      const merged = expandByNearbyComponents(best, components, anchoredCellPx)
      const finalBox = expandComponentBox(gray, merged, anchoredCell)

      return {
        ...roi,
        bbox_norm: finalBox,
      }
    })

    return refined
  } catch (error) {
    console.warn('[worker] cropRoisForPage production fallback', {
      submissionId: ctx.submission.id,
      pageNumber,
      error: error instanceof Error ? error.message : String(error),
    })

    return initialRois.map((roi) => ({
      ...roi,
      bbox_norm: roi.bbox_norm ? fallbackInset(roi.bbox_norm) : null,
    }))
  }
}