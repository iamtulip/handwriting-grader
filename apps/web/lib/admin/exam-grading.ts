import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type OcrVariantResult = {
  variant: string
  results: any[]
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
  items: Array<{
    itemNo: string
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
    candidates: any[]
    reason: string | null
    bboxNorm: [number, number, number, number] | null
  }>
}

function avg(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
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
  return /api/gcs/signed-read?path=${encodeURIComponent(path)}
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

  const items =
    (gradingRows ?? []).map((row: any) => {
      const debug = row.debug_payload ?? {}
      const grade = debug.grade ?? {}
      const final = debug.final ?? {}

      const decision: 'auto_graded' | 'needs_review' = toDecision(
        final.decision
      )

      const confidence =
        toNumberOrNull(row.confidence_score) ??
        toNumberOrNull(final.final_confidence) ??
        0

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

      const googleRawByVariant = safeArray<OcrVariantResult>(
        debug.google_raw_by_variant
      )

      const ocr2RawByVariant = safeArray<OcrVariantResult>(
        debug.paddle_raw_by_variant
      )

      const candidates = safeArray<any>(debug.merged_candidates)

      const reason =
        toStringOrNull(grade.reason) ??
        toStringOrNull(final.reason) ??
        (candidates.length === 0 ? 'no_candidates' : null)

      return {
        itemNo: String(row.item_no),
        pageNumber: toNumberOrNull(row.page_number),
        roiImageUrl: signedUrlFromPath(toStringOrNull(debug.debug_roi_path)),
        expectedAnswer,
        answerType,
        autoScore: toNumberOrNull(row.auto_score),
        finalScore: toNumberOrNull(row.final_score),
        confidence,
        decision,
        selectedCandidateText,
        selectedCandidateNormalized,
        googleRawByVariant,
        ocr2RawByVariant,
        candidates,
        reason,
        bboxNorm: toBboxNorm(debug.bbox_norm),
      }
    }) ?? []

  const readableItems = items.filter((item) => {
    const googleReadable = item.googleRawByVariant.some(
      (entry) => safeArray<any>(entry.results).length > 0
    )
    const ocr2Readable = item.ocr2RawByVariant.some(
      (entry) => safeArray<any>(entry.results).length > 0
    )
    const candidateReadable = item.candidates.length > 0

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