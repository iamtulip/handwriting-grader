export type ParsedMathCandidate = {
  kind: 'number' | 'fraction' | 'percent' | 'string'
  raw_text: string
  normalized_value: string
  numeric_value: number | null
  confidence_score: number
  unit: string | null
}

function uniqBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>()
  const result: T[] = []

  for (const item of items) {
    const key = keyFn(item)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }

  return result
}

function cleanRawText(text: string): string {
  return String(text ?? '')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[−–—]/g, '-')
    .trim()
}

function stripLeadingNoise(text: string): string {
  return text.replace(/^[=~≈:\s]+/, '').trim()
}

function normalizePlainNumber(text: string): string {
  let s = stripLeadingNoise(cleanRawText(text))

  // รองรับ OCR ที่แทรกช่องว่างหรือ comma ระหว่างหลักพัน
  s = s.replace(/(?<=\d)[,\s](?=\d{3}(\D|$))/g, '')
  s = s.replace(/[，,]/g, '')
  s = s.replace(/\s+/g, '')
  s = s.replace(/^\\+/, '')

  if (/^-?\d+\.$/.test(s)) {
    s = s.slice(0, -1)
  }

  if (/^-?\d+\.0+$/.test(s)) {
    s = String(Number(s))
  }

  return s
}

function parseNumberSafe(text: string): number | null {
  const s = normalizePlainNumber(text)

  if (!/^-?\d+(\.\d+)?$/.test(s)) return null

  const n = Number(s)
  if (!Number.isFinite(n)) return null

  return n
}

function normalizeFraction(text: string): string {
  let s = stripLeadingNoise(cleanRawText(text))
  s = s.replace(/\s+/g, '')
  s = s.replace(/÷/g, '/')
  return s
}

function parseFractionValue(text: string): number | null {
  const s = normalizeFraction(text)
  const m = s.match(/^(-?\d+)\/(\d+)$/)
  if (!m) return null

  const a = Number(m[1])
  const b = Number(m[2])
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null

  return a / b
}

function normalizePercent(text: string): string {
  let s = stripLeadingNoise(cleanRawText(text))
  s = s.replace(/\s+/g, '')
  s = s.replace(/％/g, '%')
  return s
}

function parsePercentValue(text: string): number | null {
  const s = normalizePercent(text)
  const m = s.match(/^(-?\d+(\.\d+)?)%$/)
  if (!m) return null

  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  return n
}

function detectUnit(text: string): string | null {
  const s = cleanRawText(text).toLowerCase()

  if (/(บาท|฿|\bthb\b|\bbaht\b)/i.test(s)) return 'thb'
  if (/(เมตร|\bm\b)/i.test(s)) return 'm'
  if (/(เซนติเมตร|\bcm\b)/i.test(s)) return 'cm'

  return null
}

function extractGroupedNumberCandidates(
  text: string,
  confidence: number
): ParsedMathCandidate[] {
  const cleaned = cleanRawText(text)

  const matches =
    cleaned.match(/[-+]?\d{1,3}(?:[,\s]\d{3})+(?:\.\d+)?\.?/g) ?? []

  const results: ParsedMathCandidate[] = []

  for (const m of matches) {
    const normalized = normalizePlainNumber(m)
    const numeric = parseNumberSafe(normalized)
    if (numeric === null) continue

    results.push({
      kind: 'number',
      raw_text: m,
      normalized_value: normalized,
      numeric_value: numeric,
      confidence_score: confidence + 0.03,
      unit: detectUnit(text),
    })
  }

  return uniqBy(results, (c) => `${c.kind}:${c.normalized_value}`)
}

function extractNumberCandidates(
  text: string,
  confidence: number
): ParsedMathCandidate[] {
  const cleaned = cleanRawText(text)

  const matches = cleaned.match(/[-+]?\d+(?:\.\d+)?\.?/g) ?? []

  const results: ParsedMathCandidate[] = []

  for (const m of matches) {
    const normalized = normalizePlainNumber(m)
    const numeric = parseNumberSafe(normalized)
    if (numeric === null) continue

    results.push({
      kind: 'number',
      raw_text: m,
      normalized_value: normalized,
      numeric_value: numeric,
      confidence_score: confidence,
      unit: detectUnit(text),
    })
  }

  return uniqBy(results, (c) => `${c.kind}:${c.normalized_value}`)
}

function extractFractionCandidates(
  text: string,
  confidence: number
): ParsedMathCandidate[] {
  const cleaned = cleanRawText(text)
  const matches = cleaned.match(/[-+]?\d+\s*\/\s*\d+/g) ?? []

  const results: ParsedMathCandidate[] = []

  for (const m of matches) {
    const normalized = normalizeFraction(m)
    const numeric = parseFractionValue(normalized)
    if (numeric === null) continue

    results.push({
      kind: 'fraction',
      raw_text: m,
      normalized_value: normalized,
      numeric_value: numeric,
      confidence_score: confidence,
      unit: detectUnit(text),
    })
  }

  return uniqBy(results, (c) => `${c.kind}:${c.normalized_value}`)
}

function extractPercentCandidates(
  text: string,
  confidence: number
): ParsedMathCandidate[] {
  const cleaned = cleanRawText(text)
  const matches = cleaned.match(/[-+]?\d+(?:\.\d+)?\s*%/g) ?? []

  const results: ParsedMathCandidate[] = []

  for (const m of matches) {
    const normalized = normalizePercent(m)
    const numeric = parsePercentValue(normalized)
    if (numeric === null) continue

    results.push({
      kind: 'percent',
      raw_text: m,
      normalized_value: normalized,
      numeric_value: numeric,
      confidence_score: confidence,
      unit: detectUnit(text),
    })
  }

  return uniqBy(results, (c) => `${c.kind}:${c.normalized_value}`)
}

export function parseMathCandidatesFromOcr(
  rawText: string,
  confidenceScore = 0.8
): ParsedMathCandidate[] {
  const text = cleanRawText(rawText)

  if (!text) return []

  const groupedNumbers = extractGroupedNumberCandidates(text, confidenceScore)
  const fractions = extractFractionCandidates(text, confidenceScore)
  const percents = extractPercentCandidates(text, confidenceScore)
  const numbers = extractNumberCandidates(text, confidenceScore)

  const merged = [...groupedNumbers, ...fractions, ...percents, ...numbers]

  if (merged.length === 0) {
    return [
      {
        kind: 'string',
        raw_text: text,
        normalized_value: text.replace(/\s+/g, ''),
        numeric_value: null,
        confidence_score: confidenceScore * 0.7,
        unit: detectUnit(text),
      },
    ]
  }

  return uniqBy(merged, (c) => `${c.kind}:${c.normalized_value}`)
}