import type { WorkerContext, WorkerAnswerKeyItem } from './load_context'
import type { RoiCrop } from './roi_crop'
import type { PersistedCandidate } from './candidate_persist'

type GradeMathAnswerArgs = {
  ctx: WorkerContext
  roi: RoiCrop
  candidates: PersistedCandidate[]
  answerKeyItem: WorkerAnswerKeyItem | null
}

export type GradeMathAnswerResult = {
  auto_score: number
  match_score: number
  matched: boolean
  reason: string
  selected_candidate_id: string | null
  selected_candidate_text: string | null
  selected_candidate_normalized: string | null
  expected_answer: string | null
  expected_type: string | null
}

type ParsedValue =
  | {
      kind: 'number'
      raw: string
      normalized: string
      numeric: number
      unit: string | null
    }
  | {
      kind: 'fraction'
      raw: string
      normalized: string
      numeric: number
      unit: string | null
    }
  | {
      kind: 'percent'
      raw: string
      normalized: string
      numeric: number
      unit: string | null
    }
  | {
      kind: 'string'
      raw: string
      normalized: string
      unit: string | null
    }

const THB_UNIT_ALIASES = new Set(['บาท', '฿', 'บ.', 'บ', 'thb', 'baht', 'bath'])
const METER_UNIT_ALIASES = new Set(['เมตร', 'ม.', 'ม', 'm', 'meter', 'meters'])
const CM_UNIT_ALIASES = new Set(['เซนติเมตร', 'ซม.', 'ซม', 'cm', 'centimeter', 'centimeters'])
const KG_UNIT_ALIASES = new Set(['กิโลกรัม', 'กก.', 'กก', 'kg', 'kilogram', 'kilograms'])
const G_UNIT_ALIASES = new Set(['กรัม', 'กร.', 'กร', 'g', 'gram', 'grams'])

function asText(value: unknown): string {
  return String(value ?? '').trim()
}

function asNullableText(value: unknown): string | null {
  const s = asText(value)
  return s.length > 0 ? s : null
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeBasicText(value: unknown): string {
  return asText(value)
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, '')
    .replace(/[，,]/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/^\+/, '')
    .trim()
}

function normalizeLeadingNoise(value: string): string {
  return value.replace(/^[=~≈:\s]+/, '').trim()
}

function normalizeUnitToken(value: string): string {
  const s = value.toLowerCase().trim()

  if (THB_UNIT_ALIASES.has(s)) return 'thb'
  if (METER_UNIT_ALIASES.has(s)) return 'm'
  if (CM_UNIT_ALIASES.has(s)) return 'cm'
  if (KG_UNIT_ALIASES.has(s)) return 'kg'
  if (G_UNIT_ALIASES.has(s)) return 'g'

  return s
}

function detectUnit(value: string): string | null {
  const raw = normalizeWhitespace(String(value ?? '')).toLowerCase()

  const unitPatterns: Array<[RegExp, string]> = [
    [/(บาท|฿|\bthb\b|\bbaht\b|\bbath\b)/i, 'thb'],
    [/(เซนติเมตร|\bcm\b|ซม\.?|centimeter|centimeters)/i, 'cm'],
    [/(เมตร|\bm\b|ม\.?|meter|meters)/i, 'm'],
    [/(กิโลกรัม|\bkg\b|กก\.?|kilogram|kilograms)/i, 'kg'],
    [/(กรัม|\bg\b|กร\.?|gram|grams)/i, 'g'],
  ]

  for (const [pattern, unit] of unitPatterns) {
    if (pattern.test(raw)) return unit
  }

  return null
}

function removeKnownUnits(value: string): string {
  return normalizeWhitespace(value)
    .replace(/บาท|฿|\bthb\b|\bbaht\b|\bbath\b/gi, '')
    .replace(/เซนติเมตร|\bcm\b|ซม\.?|centimeter|centimeters/gi, '')
    .replace(/เมตร|\bm\b|ม\.?|meter|meters/gi, '')
    .replace(/กิโลกรัม|\bkg\b|กก\.?|kilogram|kilograms/gi, '')
    .replace(/กรัม|\bg\b|กร\.?|gram|grams/gi, '')
    .trim()
}

function parseNumericText(value: string): number | null {
  const s = normalizeBasicText(normalizeLeadingNoise(removeKnownUnits(value)))

  if (!/^-?\d+(\.\d+)?\.?$/.test(s)) return null

  const normalized = s.endsWith('.') ? s.slice(0, -1) : s
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function parseFractionText(value: string): number | null {
  const s = normalizeBasicText(normalizeLeadingNoise(removeKnownUnits(value))).replace(/÷/g, '/')
  const m = s.match(/^(-?\d+)\/(\d+)$/)
  if (!m) return null

  const a = Number(m[1])
  const b = Number(m[2])
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null

  return a / b
}

function parsePercentText(value: string): number | null {
  const s = normalizeBasicText(normalizeLeadingNoise(removeKnownUnits(value))).replace(/％/g, '%')
  const m = s.match(/^(-?\d+(\.\d+)?)%$/)
  if (!m) return null

  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function parseValue(value: string): ParsedValue | null {
  const raw = asText(value)
  if (!raw) return null

  const unit = detectUnit(raw)

  const percentNumeric = parsePercentText(raw)
  if (percentNumeric != null) {
    return {
      kind: 'percent',
      raw,
      normalized: normalizeBasicText(normalizeLeadingNoise(raw)).replace(/％/g, '%'),
      numeric: percentNumeric,
      unit,
    }
  }

  const fractionNumeric = parseFractionText(raw)
  if (fractionNumeric != null) {
    return {
      kind: 'fraction',
      raw,
      normalized: normalizeBasicText(normalizeLeadingNoise(raw)).replace(/÷/g, '/'),
      numeric: fractionNumeric,
      unit,
    }
  }

  const numberNumeric = parseNumericText(raw)
  if (numberNumeric != null) {
    const normalized = normalizeBasicText(normalizeLeadingNoise(removeKnownUnits(raw)))
    const pretty =
      /^-?\d+\.0+$/.test(normalized)
        ? String(Number(normalized))
        : normalized.endsWith('.')
        ? normalized.slice(0, -1)
        : normalized

    return {
      kind: 'number',
      raw,
      normalized: pretty,
      numeric: numberNumeric,
      unit,
    }
  }

  return {
    kind: 'string',
    raw,
    normalized: normalizeBasicText(normalizeLeadingNoise(raw)),
    unit,
  }
}

function answersFromKey(answerKeyItem: WorkerAnswerKeyItem | null): string[] {
  if (!answerKeyItem) return []

  const direct =
    (answerKeyItem as any).correct_answer ??
    (answerKeyItem as any).answer ??
    (answerKeyItem as any).expected ??
    (answerKeyItem as any).value ??
    null

  const base: string[] = []

  if (Array.isArray(direct)) {
    for (const item of direct) {
      const s = asText(item)
      if (s) base.push(s)
    }
  } else {
    const s = asText(direct)
    if (s) base.push(s)
  }

  const accepted = (answerKeyItem as any)?.accepted_answers
  if (Array.isArray(accepted)) {
    for (const item of accepted) {
      const s = asText(item)
      if (s) base.push(s)
    }
  }

  return [...new Set(base)]
}

function detectExpectedAnswerType(
  roi: RoiCrop,
  answerKeyItem: WorkerAnswerKeyItem | null,
  expectedValues: string[]
): string {
  const declared =
    asNullableText((answerKeyItem as any)?.answer_type) ??
    asNullableText(roi.answer_type)

  if (declared) return declared

  for (const value of expectedValues) {
    const parsed = parseValue(value)
    if (parsed) return parsed.kind
  }

  return 'text'
}

function normalizeExpectedTolerance(answerKeyItem: WorkerAnswerKeyItem | null): number {
  const t = Number((answerKeyItem as any)?.tolerance ?? 1e-9)
  return Number.isFinite(t) && t >= 0 ? t : 1e-9
}

function unitsEquivalent(a: string | null, b: string | null): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return normalizeUnitToken(a) === normalizeUnitToken(b)
}

function matchNumberLike(candidate: ParsedValue, expected: ParsedValue, tolerance: number): boolean {
  if (!('numeric' in candidate) || !('numeric' in expected)) return false
  if (!unitsEquivalent(candidate.unit, expected.unit)) return false
  return Math.abs(candidate.numeric - expected.numeric) <= tolerance
}

function matchPercentEquivalent(
  candidate: ParsedValue,
  expected: ParsedValue,
  tolerance: number
): boolean {
  if (!('numeric' in candidate) || !('numeric' in expected)) return false
  if (!unitsEquivalent(candidate.unit, expected.unit)) return false

  const candidateAsRatio =
    candidate.kind === 'percent' ? candidate.numeric / 100 : candidate.numeric
  const expectedAsRatio =
    expected.kind === 'percent' ? expected.numeric / 100 : expected.numeric

  return Math.abs(candidateAsRatio - expectedAsRatio) <= tolerance
}

function matchFractionDecimalPercent(
  candidate: ParsedValue,
  expected: ParsedValue,
  tolerance: number
): boolean {
  if (!('numeric' in candidate) || !('numeric' in expected)) return false
  if (!unitsEquivalent(candidate.unit, expected.unit)) return false

  const candidateValue =
    candidate.kind === 'percent' ? candidate.numeric / 100 : candidate.numeric
  const expectedValue =
    expected.kind === 'percent' ? expected.numeric / 100 : expected.numeric

  return Math.abs(candidateValue - expectedValue) <= tolerance
}

function matchPlainText(candidate: ParsedValue, expected: ParsedValue): boolean {
  return candidate.normalized === expected.normalized && unitsEquivalent(candidate.unit, expected.unit)
}

function chooseBestCandidate(candidates: PersistedCandidate[]): PersistedCandidate | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null

  const sorted = [...candidates].sort((a, b) => {
    const ca = Number((a as any)?.confidence_score ?? 0)
    const cb = Number((b as any)?.confidence_score ?? 0)
    return cb - ca
  })

  return sorted[0] ?? null
}

function computeScoreWeight(roi: RoiCrop, answerKeyItem: WorkerAnswerKeyItem | null): number {
  const itemPoints = Number((answerKeyItem as any)?.points ?? NaN)
  if (Number.isFinite(itemPoints) && itemPoints > 0) return itemPoints

  const itemWeight = Number((answerKeyItem as any)?.score_weight ?? NaN)
  if (Number.isFinite(itemWeight) && itemWeight > 0) return itemWeight

  const roiWeight = Number(roi.score_weight ?? NaN)
  if (Number.isFinite(roiWeight) && roiWeight > 0) return roiWeight

  const roiPoints = Number(roi.points ?? NaN)
  if (Number.isFinite(roiPoints) && roiPoints > 0) return roiPoints

  return 1
}


function matchCandidateAgainstExpected(
  candidateRaw: string,
  expectedValues: string[],
  expectedType: string,
  tolerance: number
): boolean {
  const candidate = parseValue(candidateRaw)
  if (!candidate) return false

  for (const expectedRaw of expectedValues) {
    const expected = parseValue(expectedRaw)
    if (!expected) continue

    if (expectedType === 'number') {
      if (matchNumberLike(candidate, expected, tolerance)) return true
      continue
    }

    if (expectedType === 'percent') {
      if (matchPercentEquivalent(candidate, expected, tolerance)) return true
      continue
    }

    if (expectedType === 'fraction') {
      if (matchFractionDecimalPercent(candidate, expected, tolerance)) return true
      continue
    }

    if (expectedType === 'text' || expectedType === 'string') {
      if (matchPlainText(candidate, expected)) return true
      continue
    }

    if (matchFractionDecimalPercent(candidate, expected, tolerance)) return true
    if (matchPlainText(candidate, expected)) return true
  }

  return false
}

export async function gradeMathAnswer({
  ctx: _ctx,
  roi,
  candidates,
  answerKeyItem,
}: GradeMathAnswerArgs): Promise<GradeMathAnswerResult> {
  const best = chooseBestCandidate(candidates)

  if (!best) {
    return {
      auto_score: 0,
      match_score: 0,
      matched: false,
      reason: 'no_candidates',
      selected_candidate_id: null,
      selected_candidate_text: null,
      selected_candidate_normalized: null,
      expected_answer: null,
      expected_type: null,
    }
  }

  const expectedValues = answersFromKey(answerKeyItem)
  const expectedType = detectExpectedAnswerType(roi, answerKeyItem, expectedValues)
  const tolerance = normalizeExpectedTolerance(answerKeyItem)

  const selectedCandidateText = asNullableText((best as any).raw_text)
  const selectedCandidateNormalized = asNullableText((best as any).normalized_value)

  if (!answerKeyItem || expectedValues.length === 0) {
    return {
      auto_score: 0,
      match_score: 0,
      matched: false,
      reason: 'no_answer_key',
      selected_candidate_id: (best as any).id ?? null,
      selected_candidate_text: selectedCandidateText,
      selected_candidate_normalized: selectedCandidateNormalized,
      expected_answer: null,
      expected_type: expectedType,
    }
  }

  const candidateRaw = selectedCandidateNormalized ?? selectedCandidateText ?? ''
  const matched = matchCandidateAgainstExpected(
    candidateRaw,
    expectedValues,
    expectedType,
    tolerance
  )

  const scoreWeight = computeScoreWeight(roi, answerKeyItem)

  return {
    auto_score: matched ? scoreWeight : 0,
    match_score: matched ? 1 : 0,
    matched,
    reason: matched ? 'matched' : 'not_matched',
    selected_candidate_id: (best as any).id ?? null,
    selected_candidate_text: selectedCandidateText,
    selected_candidate_normalized: selectedCandidateNormalized,
    expected_answer: expectedValues[0] ?? null,
    expected_type: expectedType,
  }
}