// apps/worker/src/lib/answer_key_numeric.ts

export type ExtractedExpectedNumeric = {
  expectedValue: number | null
  rawExpected: unknown
  absTol: number
  relTol: number
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim()
    if (!cleaned) return null
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function extractExpectedNumericFromAnswerKeyItem(
  item: any,
  gradingConfig?: any,
): ExtractedExpectedNumeric {
  const rawExpected =
    item?.expected_value ??
    item?.expected ??
    item?.answer ??
    item?.value ??
    item?.correct_answer ??
    null

  const expectedValue =
    asNumber(rawExpected) ??
    asNumber(item?.expected_numeric) ??
    asNumber(item?.numeric_value) ??
    null

  const absTol =
    asNumber(item?.abs_tol) ??
    asNumber(item?.absolute_tolerance) ??
    asNumber(gradingConfig?.abs_tol) ??
    0

  const relTol =
    asNumber(item?.rel_tol) ??
    asNumber(item?.relative_tolerance) ??
    asNumber(gradingConfig?.rel_tol) ??
    0

  return {
    expectedValue,
    rawExpected,
    absTol,
    relTol,
  }
}