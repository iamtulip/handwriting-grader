// apps/web/lib/layout-schema.ts

import type {
  AnswerType,
  AssignmentLayoutDataV2,
  BBox,
  ExpectedFormat,
  GraderMode,
  IdentityType,
  LayoutPage,
  LayoutRegion,
  LayoutSettings,
  LayoutTolerance,
  Point,
  RegionFlags,
  RegionGrader,
  RegionKind,
} from '@/types/layout-spec'

export type LayoutValidationResult =
  | { ok: true; normalized: AssignmentLayoutDataV2; warnings: string[] }
  | { ok: false; error: string }

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function clamp01(value: unknown, fallback = 0): number {
  const n = toFiniteNumber(value, fallback)
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function normalizePageNumber(page: any, fallback: number): number {
  const pageNumber = toFiniteNumber(
    page?.page_number ?? page?.page_index ?? page?.page,
    fallback
  )
  return Math.max(1, Math.floor(pageNumber))
}

function normalizeRegionKind(rawKind: unknown, rawIdentityType: unknown): RegionKind {
  const kind = String(rawKind ?? '').trim()

  if (
    kind === 'identity' ||
    kind === 'answer' ||
    kind === 'table_cell' ||
    kind === 'working' ||
    kind === 'instruction_ignored'
  ) {
    return kind
  }

  // legacy compatibility
  if (kind === 'student_id') return 'identity'

  if (rawIdentityType != null) return 'identity'

  return 'answer'
}

function normalizeIdentityType(raw: unknown): IdentityType | null {
  const value = String(raw ?? '').trim()

  if (
    value === 'student_id' ||
    value === 'full_name' ||
    value === 'section' ||
    value === 'other'
  ) {
    return value
  }

  return null
}

function normalizeAnswerType(raw: unknown, fallback: AnswerType = 'number'): AnswerType {
  const value = String(raw ?? '').trim()

  if (
    value === 'number' ||
    value === 'text' ||
    value === 'fraction' ||
    value === 'expression' ||
    value === 'multiple_choice' ||
    value === 'table_value'
  ) {
    return value
  }

  return fallback
}

function normalizeGraderMode(raw: unknown, fallback: GraderMode = 'deterministic'): GraderMode {
  const value = String(raw ?? '').trim()

  if (
    value === 'deterministic' ||
    value === 'exact_text' ||
    value === 'accepted_values' ||
    value === 'symbolic_equivalence'
  ) {
    return value
  }

  return fallback
}

function normalizeTolerance(raw: any): LayoutTolerance | undefined {
  if (!isObject(raw)) return undefined
  return {
    abs_tol: toFiniteNumber(raw.abs_tol, 0),
    rel_tol: toFiniteNumber(raw.rel_tol, 0),
  }
}

function normalizeExpectedFormat(raw: any): ExpectedFormat | undefined {
  if (!isObject(raw)) return undefined

  const result: ExpectedFormat = {}

  if (typeof raw.allow_thai_digits === 'boolean') result.allow_thai_digits = raw.allow_thai_digits
  if (typeof raw.allow_decimal === 'boolean') result.allow_decimal = raw.allow_decimal
  if (typeof raw.allow_fraction === 'boolean') result.allow_fraction = raw.allow_fraction
  if (typeof raw.allow_text === 'boolean') result.allow_text = raw.allow_text
  if (typeof raw.pattern === 'string' && raw.pattern.trim()) result.pattern = raw.pattern.trim()

  return Object.keys(result).length > 0 ? result : undefined
}

function normalizeFlags(raw: any): RegionFlags | undefined {
  if (!isObject(raw)) return undefined

  const result: RegionFlags = {}

  if (typeof raw.required === 'boolean') result.required = raw.required
  if (typeof raw.student_visible === 'boolean') result.student_visible = raw.student_visible
  if (typeof raw.review_if_empty === 'boolean') result.review_if_empty = raw.review_if_empty

  return Object.keys(result).length > 0 ? result : undefined
}

function normalizeGrader(raw: any, fallbackAnswerType: AnswerType): RegionGrader | undefined {
  if (!isObject(raw)) {
    return {
      mode: fallbackAnswerType === 'text' ? 'exact_text' : 'deterministic',
      tolerance:
        fallbackAnswerType === 'number' ||
        fallbackAnswerType === 'fraction' ||
        fallbackAnswerType === 'expression'
          ? { abs_tol: 0, rel_tol: 0 }
          : undefined,
      trim_spaces: true,
    }
  }

  return {
    mode: normalizeGraderMode(raw.mode),
    tolerance: normalizeTolerance(raw.tolerance),
    accepted_values: Array.isArray(raw.accepted_values)
      ? raw.accepted_values.map(String)
      : undefined,
    case_sensitive:
      typeof raw.case_sensitive === 'boolean' ? raw.case_sensitive : undefined,
    trim_spaces: typeof raw.trim_spaces === 'boolean' ? raw.trim_spaces : true,
  }
}

function normalizePoint(raw: any): Point | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null
  return [clamp01(raw[0], 0), clamp01(raw[1], 0)]
}

function normalizePolygon(raw: any): Point[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const points = raw
    .map(normalizePoint)
    .filter((p): p is Point => p !== null)

  return points.length >= 3 ? points : undefined
}

function normalizeBBoxFromLegacyXYWH(raw: any): BBox {
  const x = clamp01(raw?.x, 0)
  const y = clamp01(raw?.y, 0)
  const w = clamp01(raw?.w, 0.1)
  const h = clamp01(raw?.h, 0.05)

  const x2 = Math.min(1, x + Math.max(0.0001, w))
  const y2 = Math.min(1, y + Math.max(0.0001, h))

  return [x, y, x2, y2]
}

function normalizeBBox(raw: any): BBox | undefined {
  if (Array.isArray(raw?.bbox_norm) && raw.bbox_norm.length === 4) {
    const x1 = clamp01(raw.bbox_norm[0], 0)
    const y1 = clamp01(raw.bbox_norm[1], 0)
    const x2 = clamp01(raw.bbox_norm[2], x1)
    const y2 = clamp01(raw.bbox_norm[3], y1)

    return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]
  }

  // legacy compatibility: x,y,w,h
  if (
    raw &&
    (raw.x !== undefined || raw.y !== undefined || raw.w !== undefined || raw.h !== undefined)
  ) {
    return normalizeBBoxFromLegacyXYWH(raw)
  }

  return undefined
}

function normalizeRegion(raw: any, pageNumber: number, index: number): LayoutRegion {
  const identityType =
    normalizeIdentityType(raw?.identity_type) ??
    (raw?.kind === 'student_id' ? 'student_id' : null)

  const kind = normalizeRegionKind(raw?.kind, identityType)

  const answerType = normalizeAnswerType(
    raw?.answer_type,
    kind === 'table_cell' ? 'table_value' : kind === 'identity' ? 'text' : 'number'
  )

  const polygon_norm = normalizePolygon(raw?.polygon_norm)
  const bbox_norm = polygon_norm ? undefined : normalizeBBox(raw)

  return {
    id:
      typeof raw?.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : `region_p${pageNumber}_${index + 1}`,
    kind,
    label: typeof raw?.label === 'string' && raw.label.trim() ? raw.label.trim() : undefined,

    question_no:
      raw?.question_no === null || raw?.question_no === undefined
        ? null
        : toFiniteNumber(raw.question_no, 0),

    subquestion_no:
      raw?.subquestion_no === null || raw?.subquestion_no === undefined
        ? null
        : String(raw.subquestion_no),

    part_no:
      raw?.part_no === null || raw?.part_no === undefined
        ? null
        : String(raw.part_no),

    group_id:
      raw?.group_id === null || raw?.group_id === undefined
        ? null
        : String(raw.group_id),

    identity_type: identityType,
    score_weight: raw?.score_weight === undefined ? 1 : toFiniteNumber(raw.score_weight, 1),
    answer_type: answerType,
    expected_format: normalizeExpectedFormat(raw?.expected_format),
    grader: normalizeGrader(raw?.grader, answerType),
    flags: normalizeFlags(raw?.flags),
    polygon_norm,
    bbox_norm,
  }
}

function normalizePage(rawPage: any, pageNumber: number): LayoutPage {
  const rawRegions = Array.isArray(rawPage?.regions)
    ? rawPage.regions
    : Array.isArray(rawPage?.rois)
    ? rawPage.rois
    : []

  return {
    page_number: pageNumber,
    page_label:
      typeof rawPage?.page_label === 'string' && rawPage.page_label.trim()
        ? rawPage.page_label.trim()
        : undefined,
    source_width:
      rawPage?.source_width === null || rawPage?.source_width === undefined
        ? null
        : toFiniteNumber(rawPage.source_width, 0),
    source_height:
      rawPage?.source_height === null || rawPage?.source_height === undefined
        ? null
        : toFiniteNumber(rawPage.source_height, 0),
    template_ref: isObject(rawPage?.template_ref)
      ? {
          pdf_page_index: Math.max(
            0,
            Math.floor(toFiniteNumber(rawPage.template_ref.pdf_page_index, pageNumber - 1))
          ),
          rotation:
            rawPage.template_ref.rotation === undefined
              ? undefined
              : toFiniteNumber(rawPage.template_ref.rotation, 0),
        }
      : undefined,
    regions: rawRegions.map((region: any, index: number) =>
      normalizeRegion(region, pageNumber, index)
    ),
  }
}

function normalizeSettings(raw: any): LayoutSettings {
  return {
    allow_multi_roi_per_question:
      typeof raw?.allow_multi_roi_per_question === 'boolean'
        ? raw.allow_multi_roi_per_question
        : true,
    enable_identity_verification:
      typeof raw?.enable_identity_verification === 'boolean'
        ? raw.enable_identity_verification
        : true,
    enable_working_regions:
      typeof raw?.enable_working_regions === 'boolean'
        ? raw.enable_working_regions
        : true,
    default_answer_type: normalizeAnswerType(raw?.default_answer_type, 'number'),
  }
}

export function defaultLayoutData(pageCount = 1): AssignmentLayoutDataV2 {
  return {
    schema_version: 2,
    document_type: 'worksheet',
    page_count: Math.max(1, Math.floor(pageCount)),
    default_coordinate_space: 'normalized',
    settings: {
      allow_multi_roi_per_question: true,
      enable_identity_verification: true,
      enable_working_regions: true,
      default_answer_type: 'number',
    },
    pages: Array.from({ length: Math.max(1, Math.floor(pageCount)) }, (_, i) => ({
      page_number: i + 1,
      regions: [],
    })),
  }
}

export function normalizeLayoutData(
  input: unknown,
  pageCountHint?: number
): { normalized: AssignmentLayoutDataV2; warnings: string[] } {
  const warnings: string[] = []

  const base = isObject(input) ? input : {}
  const pageCount = Math.max(
    1,
    Math.floor(toFiniteNumber(pageCountHint ?? base.page_count, 1))
  )

  const rawPages = Array.isArray(base.pages) ? base.pages : []
  const pageMap = new Map<number, LayoutPage>()

  for (let i = 0; i < rawPages.length; i += 1) {
    const rawPage = rawPages[i]
    const pageNumber = normalizePageNumber(rawPage, i + 1)

    if (!Array.isArray(rawPage?.regions) && Array.isArray(rawPage?.rois)) {
      warnings.push(`legacy rois migrated on page ${pageNumber}`)
    }

    pageMap.set(pageNumber, normalizePage(rawPage, pageNumber))
  }

  const pages: LayoutPage[] = Array.from({ length: pageCount }, (_, i) => {
    const pageNumber = i + 1
    return pageMap.get(pageNumber) ?? { page_number: pageNumber, regions: [] }
  })

  const normalized: AssignmentLayoutDataV2 = {
    schema_version: 2,
    document_type:
      base.document_type === 'worksheet' ||
      base.document_type === 'quiz' ||
      base.document_type === 'midterm' ||
      base.document_type === 'final'
        ? base.document_type
        : 'worksheet',
    assignment_id:
      typeof base.assignment_id === 'string' && base.assignment_id.trim()
        ? base.assignment_id.trim()
        : undefined,
    spec_name:
      typeof base.spec_name === 'string' && base.spec_name.trim()
        ? base.spec_name.trim()
        : undefined,
    page_count: pageCount,
    default_coordinate_space: 'normalized',
    settings: normalizeSettings(base.settings),
    pages,
  }

  return { normalized, warnings }
}

function hasValidGeometry(region: LayoutRegion): boolean {
  if (region.polygon_norm && region.polygon_norm.length >= 3) return true

  if (region.bbox_norm && region.bbox_norm.length === 4) {
    const [x1, y1, x2, y2] = region.bbox_norm
    return x2 > x1 && y2 > y1
  }

  return false
}

export function validateLayoutDataV2(
  input: unknown,
  options?: {
    pageCountHint?: number
  }
): LayoutValidationResult {
  const { normalized, warnings } = normalizeLayoutData(input, options?.pageCountHint)

  if (normalized.schema_version !== 2) {
    return { ok: false, error: 'layout_data.schema_version must be 2' }
  }

  if (normalized.default_coordinate_space !== 'normalized') {
    return { ok: false, error: 'layout_data.default_coordinate_space must be normalized' }
  }

  if (!Array.isArray(normalized.pages)) {
    return { ok: false, error: 'layout_data.pages must be an array' }
  }

  if (normalized.pages.length !== normalized.page_count) {
    return { ok: false, error: 'layout_data.page_count must match pages.length' }
  }

  const seenIds = new Set<string>()

  for (let i = 0; i < normalized.pages.length; i += 1) {
    const page = normalized.pages[i]

    if (!Array.isArray(page.regions)) {
      return { ok: false, error: `pages[${i}].regions must be an array` }
    }

    for (let j = 0; j < page.regions.length; j += 1) {
      const region = page.regions[j]

      if (!region.id || !region.id.trim()) {
        return { ok: false, error: `pages[${i}].regions[${j}].id is required` }
      }

      if (seenIds.has(region.id)) {
        return { ok: false, error: `duplicate region.id: ${region.id}` }
      }
      seenIds.add(region.id)

      if (!hasValidGeometry(region)) {
        return {
          ok: false,
          error: `pages[${i}].regions[${j}] must have valid bbox_norm or polygon_norm`,
        }
      }

      if (region.kind === 'identity' && !region.identity_type) {
        return {
          ok: false,
          error: `pages[${i}].regions[${j}].identity_type is required when kind=identity`,
        }
      }
    }
  }

  return { ok: true, normalized, warnings }
}