import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type OcrVariantResult = {
  variant: string
  results: any[]
}

export type ExamCandidate = {
  rawText: string | null
  normalizedValue: string | null
  confidenceScore: number | null
  engineSource: string | null
  kind: string | null
  numericValue: number | null
  unit: string | null
}

export type ExamEvidenceMap = {
  c1: number | null
  c2: number | null
  m: number | null
  formula: string | null
}

export type ExamGradingItem = {
  itemNo: string
  roiId: string | null
  questionNo: string | null
  pageNumber: number | null
  roiImageUrl: string | null
  expectedAnswer: string | null
  answerType: string | null
  autoScore: number | null
  finalScore: number | null
  confidence: number | null
  decision: 'auto_graded' | 'needs_review'
  selectedCandidateText: string | null
  selectedCandidateNormalized: string | null
  googleRawByVariant: OcrVariantResult[]
  ocr2RawByVariant: OcrVariantResult[]
  mergedCandidates: ExamCandidate[]
  persistedCandidates: ExamCandidate[]
  reason: string | null
  bboxNorm: [number, number, number, number] | null
  scoreWeight: number | null
  evidenceMap: ExamEvidenceMap | null
}

export type ExamGradingDetail = {
  submission: {
    id: string
    studentName: string
    studentCode: string
    assignmentTitle: string
    status: string
    currentStage: string | null
    submittedAt: string | null
  }
  pages: Array<{
    pageNumber: number
    imageUrl: string
  }>
  summary: {
    totalItems: number
    readableItems: number
    autoGraded: number
    needsReview: number
    averageConfidence: number
    workloadReductionPercent: number
  }
  items: ExamGradingItem[]
}

function avg(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {}
}

function toNumberOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toStringOrNull(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s.length > 0 ? s : null
}

function toDecision(value: unknown): 'auto_graded' | 'needs_review' {
  return value === 'auto_graded' ? 'auto_graded' : 'needs_review'
}

function toBboxNorm(
  value: unknown
): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) return null

  const nums = value.map((v) => Number(v))
  if (nums.some((n) => !Number.isFinite(n))) return null

  return nums as [number, number, number, number]
}

function signedUrlFromPath(path: string | null | undefined): string | null {
  if (!path) return null
  return `/api/gcs/signed-read?path=${encodeURIComponent(path)}`
}

function normalizeOcrVariantResults(value: unknown): OcrVariantResult[] {
  return safeArray<any>(value).map((row, index) => ({
    variant: toStringOrNull(row?.variant) ?? `variant_${index + 1}`,
    results: safeArray<any>(row?.results),
  }))
}

function normalizeCandidate(value: unknown): ExamCandidate | null {
  if (typeof value === 'string') {
    const s = toStringOrNull(value)
    if (!s) return null

    return {
      rawText: s,
      normalizedValue: s,
      confidenceScore: null,
      engineSource: null,
      kind: null,
      numericValue: null,
      unit: null,
    }
  }

  const row = asRecord(value)

  const rawText =
    toStringOrNull(row.raw_text) ??
    toStringOrNull(row.rawText) ??
    toStringOrNull(row.text)

  const normalizedValue =
    toStringOrNull(row.normalized_value) ??
    toStringOrNull(row.normalizedValue) ??
    toStringOrNull(row.normalized)

  if (!rawText && !normalizedValue) return null

  return {
    rawText,
    normalizedValue,
    confidenceScore:
      toNumberOrNull(row.confidence_score) ??
      toNumberOrNull(row.confidence),
    engineSource:
      toStringOrNull(row.engine_source) ??
      toStringOrNull(row.engineSource),
    kind: toStringOrNull(row.kind) ?? toStringOrNull(row.type),
    numericValue:
      toNumberOrNull(row.numeric_value) ??
      toNumberOrNull(row.numericValue),
    unit: toStringOrNull(row.unit),
  }
}

function normalizeCandidates(value: unknown): ExamCandidate[] {
  return safeArray<any>(value)
    .map((item) => normalizeCandidate(item))
    .filter((item): item is ExamCandidate => item !== null)
}

function normalizeEvidenceMap(value: unknown): ExamEvidenceMap | null {
  const row = asRecord(value)

  const c1 = toNumberOrNull(row.c1)
  const c2 = toNumberOrNull(row.c2)
  const m = toNumberOrNull(row.m)
  const formula = toStringOrNull(row.formula)

  if (c1 == null && c2 == null && m == null && formula == null) {
    return null
  }

  return { c1, c2, m, formula }
}

export async function getExamGradingDetail(
  submissionId: string
): Promise<ExamGradingDetail | null> {
  const { data: submissionRow, error: submissionError } = await supabase
    .from('submissions')
    .select(`
      id,
      student_id,
      assignment_id,
      status,
      current_stage,
      submitted_at,
      user_profiles:student_id (
        full_name,
        student_code,
        student_id
      ),
      assignments:assignment_id (
        title
      )
    `)
    .eq('id', submissionId)
    .single()

  if (submissionError || !submissionRow) {
    return null
  }

  const { data: pageRows, error: pageError } = await supabase
    .from('submission_files')
    .select('page_number, storage_path')
    .eq('submission_id', submissionId)
    .order('page_number', { ascending: true })

  if (pageError) {
    console.error('[exam-grading] failed to load submission_files', pageError)
  }

  const { data: gradingRows, error: gradingError } = await supabase
    .from('grading_results')
    .select(`
      item_no,
      page_number,
      auto_score,
      final_score,
      confidence_score,
      debug_payload
    `)
    .eq('submission_id', submissionId)
    .order('item_no', { ascending: true })

  if (gradingError) {
    console.error('[exam-grading] failed to load grading_results', gradingError)
  }

  const profile = Array.isArray(submissionRow.user_profiles)
    ? submissionRow.user_profiles[0]
    : submissionRow.user_profiles

  const assignment = Array.isArray(submissionRow.assignments)
    ? submissionRow.assignments[0]
    : submissionRow.assignments

  const pages =
    (pageRows ?? []).map((row: any) => ({
      pageNumber: Number(row.page_number),
      imageUrl: signedUrlFromPath(row.storage_path) ?? '',
    })) ?? []

  const items: ExamGradingItem[] =
    (gradingRows ?? []).map((row: any) => {
      const debug = asRecord(row.debug_payload)
      const grade = asRecord(debug.grade)
      const final = asRecord(debug.final)

      const decision = toDecision(final.decision)

      const confidence =
        toNumberOrNull(row.confidence_score) ??
        toNumberOrNull(final.final_confidence) ??
        0

      const mergedCandidates = normalizeCandidates(debug.merged_candidates)
      const persistedCandidates = normalizeCandidates(debug.persisted_candidates)

      const selectedCandidateText =
        toStringOrNull(final.selected_candidate_text) ??
        toStringOrNull(grade.selected_candidate_text) ??
        null

      const selectedCandidateNormalized =
        toStringOrNull(final.selected_candidate_normalized) ??
        toStringOrNull(grade.selected_candidate_normalized) ??
        null

      const expectedAnswer =
        toStringOrNull(grade.expected_answer) ??
        toStringOrNull(debug.expected_answer) ??
        null

      const answerType =
        toStringOrNull(grade.expected_type) ??
        toStringOrNull(debug.answer_type) ??
        null

      const reason =
        toStringOrNull(grade.reason) ??
        toStringOrNull(final.reason) ??
        (mergedCandidates.length === 0 ? 'no_candidates' : null)

      return {
        itemNo: String(row.item_no),
        roiId: toStringOrNull(debug.roi_id),
        questionNo: toStringOrNull(debug.question_no),
        pageNumber:
          toNumberOrNull(row.page_number) ??
          toNumberOrNull(debug.page_number),
        roiImageUrl: signedUrlFromPath(toStringOrNull(debug.debug_roi_path)),
        expectedAnswer,
        answerType,
        autoScore: toNumberOrNull(row.auto_score),
        finalScore: toNumberOrNull(row.final_score),
        confidence,
        decision,
        selectedCandidateText,
        selectedCandidateNormalized,
        googleRawByVariant: normalizeOcrVariantResults(
          debug.google_raw_by_variant
        ),
        ocr2RawByVariant: normalizeOcrVariantResults(
          debug.paddle_raw_by_variant
        ),
        mergedCandidates,
        persistedCandidates,
        reason,
        bboxNorm: toBboxNorm(debug.bbox_norm),
        scoreWeight: toNumberOrNull(debug.score_weight),
        evidenceMap: normalizeEvidenceMap(final.evidence_map),
      }
    }) ?? []

  const readableItems = items.filter((item) => {
    const googleReadable = item.googleRawByVariant.some(
      (entry) => safeArray<any>(entry.results).length > 0
    )
    const ocr2Readable = item.ocr2RawByVariant.some(
      (entry) => safeArray<any>(entry.results).length > 0
    )
    const candidateReadable = item.mergedCandidates.length > 0

    return googleReadable || ocr2Readable || candidateReadable
  }).length

  const autoGraded = items.filter(
    (item) => item.decision === 'auto_graded'
  ).length

  const needsReview = items.filter(
    (item) => item.decision === 'needs_review'
  ).length

  const averageConfidence = avg(
    items
      .map((item) => item.confidence ?? 0)
      .filter((value) => Number.isFinite(value))
  )

  return {
    submission: {
      id: submissionRow.id,
      studentName: profile?.full_name ?? 'ไม่ทราบชื่อ',
      studentCode: profile?.student_code ?? submissionRow.student_id,
      assignmentTitle: assignment?.title ?? 'ไม่ทราบชื่องาน',
      status: submissionRow.status ?? 'unknown',
      currentStage: submissionRow.current_stage ?? null,
      submittedAt: submissionRow.submitted_at ?? null,
    },
    pages,
    summary: {
      totalItems: items.length,
      readableItems,
      autoGraded,
      needsReview,
      averageConfidence,
      workloadReductionPercent:
        items.length > 0 ? Math.round((autoGraded / items.length) * 100) : 0,
    },
    items,
  }
}