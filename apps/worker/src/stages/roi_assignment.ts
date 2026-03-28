export type LayoutRegion = {
  id: string
  page_number: number | null
  question_no: string | null
  item_no?: string | null
  label?: string | null
  kind?: string | null
  answer_type?: string | null
  x_norm: number
  y_norm: number
  w_norm: number
  h_norm: number
  score_weight?: number | null
  points?: number | null
}

export type AssignedRoi = {
  region_id: string
  page_number: number
  question_no: string
  bbox_norm: {
    x: number
    y: number
    w: number
    h: number
  }
  status: 'ok' | 'missing_roi' | 'invalid_roi'
  reason: string | null
}

export type AssignRoisStrictOptions = {
  pageNumber: number
  answerColumn?: {
    xMin: number
    xMax: number
  }
  strictQuestionNo?: boolean
  maxHeightFactor?: number
  minHeightFactor?: number
  verticalPadding?: number
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const arr = [...values].sort((a, b) => a - b)
  const mid = Math.floor(arr.length / 2)
  if (arr.length % 2 === 0) {
    return (arr[mid - 1] + arr[mid]) / 2
  }
  return arr[mid]
}

function normalizeQuestionNo(v: unknown): string | null {
  const s = String(v ?? '').trim()
  return s.length > 0 ? s : null
}

function regionBottom(r: LayoutRegion): number {
  return r.y_norm + r.h_norm
}

function overlapsY(aTop: number, aBottom: number, bTop: number, bBottom: number): boolean {
  return Math.max(aTop, bTop) < Math.min(aBottom, bBottom)
}

function withinAnswerColumn(
  x: number,
  w: number,
  answerColumn: { xMin: number; xMax: number }
): boolean {
  const left = x
  const right = x + w
  return left >= answerColumn.xMin && right <= answerColumn.xMax
}

function shrinkToBand(
  region: LayoutRegion,
  bandTop: number,
  bandBottom: number,
  verticalPadding: number
) {
  const top = Math.max(region.y_norm, bandTop + verticalPadding)
  const bottom = Math.min(region.y_norm + region.h_norm, bandBottom - verticalPadding)

  return {
    x: clamp01(region.x_norm),
    y: clamp01(top),
    w: clamp01(region.w_norm),
    h: Math.max(0, bottom - top),
  }
}

/**
 * ใช้ mapping ตาม question_no อย่างเคร่งครัด
 * ห้ามจับ ROI ตาม index / position อย่างเดียว
 */
export function assignRoisStrictByQuestionNo(
  allRegions: LayoutRegion[],
  orderedQuestionNos: string[],
  options: AssignRoisStrictOptions
): AssignedRoi[] {
  const answerColumn = options.answerColumn ?? { xMin: 0.70, xMax: 0.98 }
  const strictQuestionNo = options.strictQuestionNo ?? true
  const maxHeightFactor = options.maxHeightFactor ?? 1.75
  const minHeightFactor = options.minHeightFactor ?? 0.35
  const verticalPadding = options.verticalPadding ?? 0.003

  const pageRegions = allRegions
    .filter((r) => (r.page_number ?? 1) === options.pageNumber)
    .filter((r) => String(r.kind ?? '').toLowerCase() === 'answer')
    .filter((r) => normalizeQuestionNo(r.question_no) != null)
    .sort((a, b) => a.y_norm - b.y_norm)

  const heights = pageRegions.map((r) => r.h_norm).filter((h) => h > 0)
  const medianHeight = median(heights) || 0.06

  /**
   * 1 question_no ต้องมี region หลักได้แค่ 1 ตัว
   * ถ้าซ้ำ ให้เอาตัวแรกตามลำดับ y
   */
  const regionByQuestion = new Map<string, LayoutRegion>()
  for (const region of pageRegions) {
    const q = normalizeQuestionNo(region.question_no)
    if (!q) continue
    if (!regionByQuestion.has(q)) {
      regionByQuestion.set(q, region)
    }
  }

  /**
   * เอาเฉพาะ question ที่มี region จริง เพื่อใช้สร้าง band
   */
  const orderedExistingRegions = orderedQuestionNos
    .map((q) => ({ q, region: regionByQuestion.get(q) ?? null }))
    .filter((x): x is { q: string; region: LayoutRegion } => x.region !== null)

  const bandByQuestion = new Map<string, { top: number; bottom: number }>()

  for (let i = 0; i < orderedExistingRegions.length; i += 1) {
    const current = orderedExistingRegions[i]
    const prev = orderedExistingRegions[i - 1]?.region ?? null
    const next = orderedExistingRegions[i + 1]?.region ?? null

    const currentTop = current.region.y_norm
    const currentBottom = regionBottom(current.region)

    const top =
      prev == null ? currentTop - current.region.h_norm * 0.20 : (regionBottom(prev) + currentTop) / 2

    const bottom =
      next == null
        ? currentBottom + current.region.h_norm * 0.20
        : (currentBottom + next.y_norm) / 2

    bandByQuestion.set(current.q, {
      top: clamp01(top),
      bottom: clamp01(bottom),
    })
  }

  const usedRegionIds = new Set<string>()
  const results: AssignedRoi[] = []

  for (const questionNo of orderedQuestionNos) {
    const region = regionByQuestion.get(questionNo)

    if (!region) {
      results.push({
        region_id: `missing:${questionNo}`,
        page_number: options.pageNumber,
        question_no: questionNo,
        bbox_norm: { x: 0, y: 0, w: 0, h: 0 },
        status: 'missing_roi',
        reason: 'layout_spec_missing_for_question',
      })
      continue
    }

    if (usedRegionIds.has(region.id)) {
      results.push({
        region_id: region.id,
        page_number: options.pageNumber,
        question_no: questionNo,
        bbox_norm: {
          x: region.x_norm,
          y: region.y_norm,
          w: region.w_norm,
          h: region.h_norm,
        },
        status: 'invalid_roi',
        reason: 'duplicate_region_reused_across_questions',
      })
      continue
    }

    usedRegionIds.add(region.id)

    if (strictQuestionNo) {
      const rq = normalizeQuestionNo(region.question_no)
      if (rq !== questionNo) {
        results.push({
          region_id: region.id,
          page_number: options.pageNumber,
          question_no: questionNo,
          bbox_norm: {
            x: region.x_norm,
            y: region.y_norm,
            w: region.w_norm,
            h: region.h_norm,
          },
          status: 'invalid_roi',
          reason: 'question_no_mismatch',
        })
        continue
      }
    }

    if (!withinAnswerColumn(region.x_norm, region.w_norm, answerColumn)) {
      results.push({
        region_id: region.id,
        page_number: options.pageNumber,
        question_no: questionNo,
        bbox_norm: {
          x: region.x_norm,
          y: region.y_norm,
          w: region.w_norm,
          h: region.h_norm,
        },
        status: 'invalid_roi',
        reason: 'outside_answer_column',
      })
      continue
    }

    if (region.h_norm > medianHeight * maxHeightFactor) {
      results.push({
        region_id: region.id,
        page_number: options.pageNumber,
        question_no: questionNo,
        bbox_norm: {
          x: region.x_norm,
          y: region.y_norm,
          w: region.w_norm,
          h: region.h_norm,
        },
        status: 'invalid_roi',
        reason: 'roi_too_tall_possible_multirow_capture',
      })
      continue
    }

    if (region.h_norm < medianHeight * minHeightFactor) {
      results.push({
        region_id: region.id,
        page_number: options.pageNumber,
        question_no: questionNo,
        bbox_norm: {
          x: region.x_norm,
          y: region.y_norm,
          w: region.w_norm,
          h: region.h_norm,
        },
        status: 'invalid_roi',
        reason: 'roi_too_short',
      })
      continue
    }

    const band = bandByQuestion.get(questionNo)
    if (!band) {
      results.push({
        region_id: region.id,
        page_number: options.pageNumber,
        question_no: questionNo,
        bbox_norm: {
          x: region.x_norm,
          y: region.y_norm,
          w: region.w_norm,
          h: region.h_norm,
        },
        status: 'invalid_roi',
        reason: 'missing_row_band',
      })
      continue
    }

    const top = region.y_norm
    const bottom = region.y_norm + region.h_norm

    if (!overlapsY(top, bottom, band.top, band.bottom)) {
      results.push({
        region_id: region.id,
        page_number: options.pageNumber,
        question_no: questionNo,
        bbox_norm: {
          x: region.x_norm,
          y: region.y_norm,
          w: region.w_norm,
          h: region.h_norm,
        },
        status: 'invalid_roi',
        reason: 'roi_outside_its_row_band',
      })
      continue
    }

    const cropped = shrinkToBand(region, band.top, band.bottom, verticalPadding)

    if (cropped.h <= 0.001) {
      results.push({
        region_id: region.id,
        page_number: options.pageNumber,
        question_no: questionNo,
        bbox_norm: {
          x: region.x_norm,
          y: region.y_norm,
          w: region.w_norm,
          h: region.h_norm,
        },
        status: 'invalid_roi',
        reason: 'cropped_height_too_small',
      })
      continue
    }

    results.push({
      region_id: region.id,
      page_number: options.pageNumber,
      question_no: questionNo,
      bbox_norm: cropped,
      status: 'ok',
      reason: null,
    })
  }

  return results
}