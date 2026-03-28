// apps/worker/src/lib/number_reconstruction.ts

export type NumericExpected = {
  expectedValue?: number | null
  absTol?: number | null
  relTol?: number | null
  allowThousandsSeparator?: boolean
  allowDecimal?: boolean
}

export type NumericCandidate = {
  value: number
  normalized: string
  source: string
  confidence: number
  notes: string[]
}

export type NumericReconstructionResult = {
  best: NumericCandidate | null
  all: NumericCandidate[]
  debug: {
    raw: string
    cleaned: string
    digitOnly: string
    lineTokens: string[]
  }
}

function uniqBy<T>(items: T[], keyFn: (x: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    const k = keyFn(item)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(item)
  }
  return out
}

function clamp01(x: number): number {
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

function safeNumber(x: unknown): number | null {
  if (typeof x === 'number' && Number.isFinite(x)) return x
  if (typeof x === 'string' && x.trim() !== '') {
    const n = Number(x)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function replaceCommonOcrMistakes(input: string): string {
  return input
    .replace(/[Oo〇○]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[B]/g, '8')
    .replace(/[gq]/g, '9')
    .replace(/[‘’´`]/g, '')
    .replace(/[—–−]/g, '-')
}

function keepNumericish(input: string): string {
  return input.replace(/[^0-9,.\-\n ]/g, '')
}

function splitUsefulLines(input: string): string[] {
  return input
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
}

function buildRawTokens(lines: string[]): string[] {
  const out: string[] = []

  for (const line of lines) {
    out.push(line)

    // split by spaces too
    const parts = line.split(/\s+/).map((x) => x.trim()).filter(Boolean)
    out.push(...parts)
  }

  return uniqBy(
    out.filter(Boolean),
    (x) => x,
  )
}

function digitOnly(s: string): string {
  return s.replace(/\D/g, '')
}

function parseLooseNumber(token: string): number | null {
  if (!token) return null

  let t = token.trim()
  if (!t) return null

  // remove obvious noise
  t = t.replace(/[^\d,.\-]/g, '')

  // if starts with minus because OCR thought comma or vertical stroke is minus,
  // keep it for now, later scoring may penalize
  if (!/\d/.test(t)) return null

  // case 1: both comma and dot => treat last separator as decimal point only if 1-2 digits after it
  const lastComma = t.lastIndexOf(',')
  const lastDot = t.lastIndexOf('.')
  const lastSep = Math.max(lastComma, lastDot)

  if (lastSep >= 0) {
    const intPart = t.slice(0, lastSep).replace(/[,.]/g, '')
    const fracPart = t.slice(lastSep + 1).replace(/[,.]/g, '')
    const sign = t.startsWith('-') ? '-' : ''

    if (fracPart.length >= 1 && fracPart.length <= 2 && intPart.replace('-', '').length > 0) {
      const merged = `${sign}${intPart.replace('-', '')}.${fracPart}`
      const n = Number(merged)
      return Number.isFinite(n) ? n : null
    }
  }

  // default: thousands separators only
  t = t.replace(/[,.]/g, '')
  if (t === '-' || t === '') return null

  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function estimateDigitCount(expectedValue?: number | null): number | null {
  const n = safeNumber(expectedValue)
  if (n == null) return null
  const s = Math.abs(n).toString().replace(/\D/g, '')
  return s.length > 0 ? s.length : null
}

function normalizeNumberString(n: number, allowDecimal = true): string {
  if (!allowDecimal) return String(Math.trunc(n))
  const asInt = Number.isInteger(n)
  return asInt ? String(n) : String(Number(n.toFixed(6))).replace(/\.?0+$/, '')
}

function withinTolerance(
  candidate: number,
  expectedValue?: number | null,
  absTol?: number | null,
  relTol?: number | null,
): boolean {
  const expected = safeNumber(expectedValue)
  if (expected == null) return false

  const abs = Math.abs(candidate - expected)
  const absAllowed = safeNumber(absTol) ?? 0
  const relAllowed = safeNumber(relTol) ?? 0

  const relBase = Math.abs(expected)
  const relAllowedAbs = relBase * relAllowed

  return abs <= Math.max(absAllowed, relAllowedAbs)
}

function computeDistanceScore(candidate: number, expectedValue?: number | null): number {
  const expected = safeNumber(expectedValue)
  if (expected == null) return 0.5

  const abs = Math.abs(candidate - expected)
  const scale = Math.max(1, Math.abs(expected))
  const ratio = abs / scale

  if (ratio === 0) return 1
  if (ratio <= 0.0001) return 0.98
  if (ratio <= 0.001) return 0.95
  if (ratio <= 0.01) return 0.85
  if (ratio <= 0.05) return 0.65
  if (ratio <= 0.10) return 0.45
  return 0.15
}

function scoreCandidate(args: {
  value: number
  source: string
  token: string
  expected?: NumericExpected
  digitCountTarget?: number | null
}): NumericCandidate {
  const { value, source, token, expected, digitCountTarget } = args
  const notes: string[] = []
  let confidence = 0.4

  const expectedValue = safeNumber(expected?.expectedValue)

  if (source === 'raw-token') confidence += 0.12
  if (source === 'digit-only') confidence += 0.08
  if (source.startsWith('prepend-')) confidence -= 0.03
  if (source.startsWith('trim-left-')) confidence -= 0.06
  if (source.startsWith('decimal-')) confidence -= 0.04
  if (source.startsWith('minus-fixed')) confidence -= 0.02

  const tokenDigits = digitOnly(token).length
  const valueDigits = digitOnly(String(Math.abs(value))).length

  if (digitCountTarget != null) {
    if (valueDigits === digitCountTarget) {
      confidence += 0.15
      notes.push('digit_count_match')
    } else if (Math.abs(valueDigits - digitCountTarget) === 1) {
      confidence += 0.04
      notes.push('digit_count_near')
    } else {
      confidence -= 0.12
      notes.push('digit_count_far')
    }
  }

  if (expectedValue != null) {
    const distanceScore = computeDistanceScore(value, expectedValue)
    confidence += distanceScore * 0.35
    notes.push(`distance_score:${distanceScore.toFixed(4)}`)

    if (withinTolerance(value, expectedValue, expected?.absTol, expected?.relTol)) {
      confidence += 0.25
      notes.push('within_tolerance')
    }

    if (Math.sign(value) === Math.sign(expectedValue) || expectedValue === 0) {
      confidence += 0.03
    } else {
      confidence -= 0.08
      notes.push('sign_mismatch')
    }
  }

  if (/^-/.test(token) && value >= 0) {
    notes.push('minus_removed_as_noise')
  }

  if (tokenDigits >= 3 && valueDigits >= 3) {
    confidence += 0.03
  }

  return {
    value,
    normalized: normalizeNumberString(value, expected?.allowDecimal ?? true),
    source,
    confidence: clamp01(confidence),
    notes,
  }
}

function generateCandidatesFromToken(
  token: string,
  expected?: NumericExpected,
): NumericCandidate[] {
  const out: NumericCandidate[] = []
  const digitCountTarget = estimateDigitCount(expected?.expectedValue)

  const pushCandidate = (value: number | null, source: string) => {
    if (value == null || !Number.isFinite(value)) return
    out.push(
      scoreCandidate({
        value,
        source,
        token,
        expected,
        digitCountTarget,
      }),
    )
  }

  // 1) parse token as-is
  pushCandidate(parseLooseNumber(token), 'raw-token')

  // 2) digit-only version
  const digits = digitOnly(token)
  if (digits) {
    pushCandidate(Number(digits), 'digit-only')
  }

  // 3) remove minus if probably noise
  if (token.startsWith('-')) {
    const noMinus = token.replace(/^-+/, '')
    pushCandidate(parseLooseNumber(noMinus), 'minus-fixed-raw')
    const noMinusDigits = digitOnly(noMinus)
    if (noMinusDigits) pushCandidate(Number(noMinusDigits), 'minus-fixed-digit-only')
  }

  // 4) try prepend one digit when OCR dropped leading digit
  if (digits && digitCountTarget != null && digits.length === digitCountTarget - 1) {
    for (let d = 1; d <= 9; d += 1) {
      pushCandidate(Number(`${d}${digits}`), `prepend-${d}`)
    }
  }

  // 5) try trim-left when OCR attached a stray leading digit
  if (digits && digitCountTarget != null && digits.length === digitCountTarget + 1) {
    pushCandidate(Number(digits.slice(1)), 'trim-left-1')
  }

  // 6) decimal repair when expected answer likely has decimals and OCR lost dot
  const expectedValue = safeNumber(expected?.expectedValue)
  const expectedHasDecimal =
    expectedValue != null &&
    !Number.isInteger(expectedValue) &&
    (expected?.allowDecimal ?? true)

  if (digits && expectedHasDecimal && digits.length >= 3) {
    // common 2-decimal assumption
    const as2 = Number(`${digits.slice(0, -2)}.${digits.slice(-2)}`)
    pushCandidate(as2, 'decimal-2')
  }

  // 7) if token contains comma-like thousand separator, try literal normalized form too
  if (/[,.]/.test(token)) {
    const justThousands = token.replace(/[,.]/g, '')
    if (justThousands && /^\-?\d+$/.test(justThousands)) {
      pushCandidate(Number(justThousands), 'thousands-merged')
    }
  }

  return uniqBy(out, (x) => `${x.normalized}|${x.source}`)
}

export function reconstructNumericCandidate(
  rawText: string,
  expected?: NumericExpected,
): NumericReconstructionResult {
  const raw = rawText ?? ''
  const normalizedSpace = normalizeWhitespace(raw)
  const replaced = replaceCommonOcrMistakes(normalizedSpace)
  const cleaned = keepNumericish(replaced)
  const lines = splitUsefulLines(cleaned)
  const tokens = buildRawTokens(lines)
  const fallbackDigitOnly = digitOnly(cleaned)

  const allCandidates: NumericCandidate[] = []

  for (const token of tokens) {
    allCandidates.push(...generateCandidatesFromToken(token, expected))
  }

  if (fallbackDigitOnly) {
    allCandidates.push(...generateCandidatesFromToken(fallbackDigitOnly, expected))
  }

  const unique = uniqBy(allCandidates, (x) => `${x.normalized}|${x.source}`)

  unique.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence

    const aExpected = safeNumber(expected?.expectedValue)
    const bExpected = safeNumber(expected?.expectedValue)
    if (aExpected != null && bExpected != null) {
      const da = Math.abs(a.value - aExpected)
      const db = Math.abs(b.value - bExpected)
      if (da !== db) return da - db
    }

    return a.normalized.localeCompare(b.normalized)
  })

  return {
    best: unique[0] ?? null,
    all: unique,
    debug: {
      raw,
      cleaned,
      digitOnly: fallbackDigitOnly,
      lineTokens: tokens,
    },
  }
}