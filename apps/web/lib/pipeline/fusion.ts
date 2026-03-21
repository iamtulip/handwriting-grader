//apps/web/lib/pipeline/fusion.ts
export type OcrCandidateInput = {
  roi_id: string
  page_number: number
  engine_source: string
  raw_text: string
  normalized_value: string
  confidence_score: number
}

export type FusedDecision = {
  roi_id: string
  page_number: number
  selected: OcrCandidateInput | null
  all_candidates: OcrCandidateInput[]
  fused_confidence: number
  agreement: boolean
  disagreement_reason: string | null
  needs_review_signal: boolean
}

function safeText(v: unknown) {
  return String(v ?? '').trim()
}

function sameNormalized(a: string, b: string) {
  return safeText(a) !== '' && safeText(a) === safeText(b)
}

function computeAverageConfidence(candidates: OcrCandidateInput[]) {
  if (candidates.length === 0) return 0
  return (
    candidates.reduce((sum, c) => sum + Number(c.confidence_score ?? 0), 0) /
    candidates.length
  )
}

function getExpectedValueForRoi(answerKey: any, roiId: string) {
  const items = Array.isArray(answerKey?.items) ? answerKey.items : []
  const found = items.find((x: any) => String(x?.roi_id ?? '') === roiId)
  return found?.expected_value ?? null
}

function matchesExpected(expected: any, normalized: string) {
  if (expected == null) return false
  return safeText(expected) === safeText(normalized)
}

export function fuseCandidatesPerRoi(params: {
  roi_id: string
  page_number: number
  candidates: OcrCandidateInput[]
  answerKey: any
  answerType?: string
}): FusedDecision {
  const { roi_id, page_number, candidates, answerKey, answerType } = params

  const sorted = [...candidates].sort(
    (a, b) => Number(b.confidence_score ?? 0) - Number(a.confidence_score ?? 0)
  )

  if (sorted.length === 0) {
    return {
      roi_id,
      page_number,
      selected: null,
      all_candidates: [],
      fused_confidence: 0,
      agreement: false,
      disagreement_reason: 'no_candidates',
      needs_review_signal: true,
    }
  }

  const expected = getExpectedValueForRoi(answerKey, roi_id)

  if (sorted.length === 1) {
    const only = sorted[0]
    const conf = Number(only.confidence_score ?? 0)

    return {
      roi_id,
      page_number,
      selected: only,
      all_candidates: sorted,
      fused_confidence: Number(conf.toFixed(4)),
      agreement: false,
      disagreement_reason: 'single_engine_only',
      needs_review_signal: conf < 0.8 || answerType === 'expression',
    }
  }

  const top = sorted[0]
  const second = sorted[1]

  if (sameNormalized(top.normalized_value, second.normalized_value)) {
    const boosted = Math.min(
      0.99,
      computeAverageConfidence([top, second]) + 0.15
    )

    return {
      roi_id,
      page_number,
      selected: {
        ...top,
        confidence_score: boosted,
      },
      all_candidates: sorted,
      fused_confidence: Number(boosted.toFixed(4)),
      agreement: true,
      disagreement_reason: null,
      needs_review_signal: answerType === 'expression' && boosted < 0.95,
    }
  }

  const exactExpected = sorted.find((c) =>
    matchesExpected(expected, c.normalized_value)
  )

  if (exactExpected) {
    const boosted = Math.min(0.97, Number(exactExpected.confidence_score ?? 0) + 0.1)

    return {
      roi_id,
      page_number,
      selected: {
        ...exactExpected,
        confidence_score: boosted,
      },
      all_candidates: sorted,
      fused_confidence: Number(boosted.toFixed(4)),
      agreement: false,
      disagreement_reason: 'engines_disagree_but_one_matches_expected',
      needs_review_signal: answerType === 'expression',
    }
  }

  const winner = top
  const confGap =
    Number(top.confidence_score ?? 0) - Number(second.confidence_score ?? 0)

  const fused = Math.max(
    0,
    Number(top.confidence_score ?? 0) - (confGap < 0.1 ? 0.2 : 0.1)
  )

  return {
    roi_id,
    page_number,
    selected: {
      ...winner,
      confidence_score: fused,
    },
    all_candidates: sorted,
    fused_confidence: Number(fused.toFixed(4)),
    agreement: false,
    disagreement_reason: 'engines_disagree_no_expected_match',
    needs_review_signal: true,
  }
}