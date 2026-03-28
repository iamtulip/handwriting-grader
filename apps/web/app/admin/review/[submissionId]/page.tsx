import Link from 'next/link'
import NeedReviewInspector from '@/components/review/NeedReviewInspector'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{
    submissionId: string
  }>
}

function safeNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function safeText(value: unknown): string | null {
  const s = String(value ?? '').trim()
  return s.length > 0 ? s : null
}

function safeBBox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) return null
  const arr = value.map((v) => Number(v))
  if (arr.some((v) => !Number.isFinite(v))) return null
  return [arr[0], arr[1], arr[2], arr[3]]
}

async function createSignedUrl(
  admin: ReturnType<typeof createAdminClient>,
  bucket: string,
  path: string | null,
  expiresIn = 60 * 60
): Promise<string | null> {
  if (!path) return null

  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, expiresIn)

  if (error || !data?.signedUrl) {
    return null
  }

  return data.signedUrl
}

function sortItemNo(a: string, b: string) {
  const an = Number(a)
  const bn = Number(b)
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn
  return a.localeCompare(b)
}

function normalizeSingleAnswerKeyItem(
  item: any,
  index: number,
  fallbackItemNo?: string
) {
  const isObject =
    item !== null &&
    typeof item === 'object' &&
    !Array.isArray(item)

  const raw = isObject ? item : { value: item }

  const grader =
    raw?.grader && typeof raw.grader === 'object' && !Array.isArray(raw.grader)
      ? raw.grader
      : null

  return {
    ...raw,
    item_no: String(
      raw?.item_no ??
        raw?.question_no ??
        fallbackItemNo ??
        index + 1
    ),
    question_no: raw?.question_no != null ? String(raw.question_no) : null,
    grader,
    raw_item: raw,
  }
}

function normalizeAnswerKeyItems(answerKey: any): any[] {
  if (Array.isArray(answerKey)) {
    return answerKey.map((item: any, index: number) =>
      normalizeSingleAnswerKeyItem(item, index)
    )
  }

  if (Array.isArray(answerKey?.items)) {
    return answerKey.items.map((item: any, index: number) =>
      normalizeSingleAnswerKeyItem(item, index)
    )
  }

  if (answerKey && typeof answerKey === 'object') {
    return Object.entries(answerKey).map(([key, value]: [string, any], index: number) =>
      normalizeSingleAnswerKeyItem(value, index, key)
    )
  }

  return []
}

const DIRECT_VALUE_KEYS = [
  'correct_answer',
  'answer',
  'expected',
  'value',
  'expected_value',
  'expected_answer',
  'target_value',
  'normalized_value',
  'raw_text',
  'text',
  'raw',
  'correctAnswer',
  'expectedValue',
  'expectedAnswer',
  'targetValue',
  'normalizedValue',
  'rawText',
]

const CONTAINER_KEYS = [
  'accepted_answers',
  'acceptedAnswers',
  'candidates',
  'expected_candidates',
  'expectedCandidates',
  'accepted_candidates',
  'acceptedCandidates',
  'alternatives',
  'answers',
]

function pushExpectedValues(value: unknown, out: string[]): void {
  if (value == null) return

  if (Array.isArray(value)) {
    for (const item of value) {
      pushExpectedValues(item, out)
    }
    return
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>

    for (const key of DIRECT_VALUE_KEYS) {
      if (key in obj) {
        pushExpectedValues(obj[key], out)
      }
    }

    for (const key of CONTAINER_KEYS) {
      if (key in obj) {
        pushExpectedValues(obj[key], out)
      }
    }

    return
  }

  const s = safeText(value)
  if (s) out.push(s)
}

function extractExpectedValues(answerKeyItem: any): string[] {
  if (!answerKeyItem) return []

  const out: string[] = []

  pushExpectedValues(answerKeyItem, out)
  if (answerKeyItem?.grader) pushExpectedValues(answerKeyItem.grader, out)
  if (answerKeyItem?.raw_item) pushExpectedValues(answerKeyItem.raw_item, out)
  if (answerKeyItem?.raw_item?.grader) pushExpectedValues(answerKeyItem.raw_item.grader, out)

  return [...new Set(out.map((v) => String(v).trim()).filter(Boolean))].filter((v) => {
    const lower = v.toLowerCase()
    if (['number', 'fraction', 'percent', 'string', 'text', 'regex'].includes(lower)) return false
    return true
  })
}

function findAnswerKeyItem(answerKeyItems: any[], itemNo: string) {
  const target = String(itemNo).trim()

  return (
    answerKeyItems.find((item: any) => {
      const candidates = [
        item?.item_no,
        item?.question_no,
        item?.raw_item?.item_no,
        item?.raw_item?.question_no,
      ]
        .filter((v: any) => v != null)
        .map((v: any) => String(v).trim())

      return candidates.includes(target)
    }) ?? null
  )
}

export default async function ReviewInspectorPage({ params }: PageProps) {
  const { submissionId } = await params
  const admin = createAdminClient()

  const submissionBucket =
    process.env.SUBMISSION_FILES_BUCKET || 'submission-files'

  const assignmentBucket =
    process.env.ASSIGNMENT_FILES_BUCKET ||
    process.env.ASSIGNMENT_SOURCE_FILES_BUCKET ||
    process.env.SUBMISSION_FILES_BUCKET ||
    'submission-files'

  const [submissionRes, filesRes, resultsRes, candidatesRes] = await Promise.all([
    admin
      .from('submissions')
      .select(`
        id,
        assignment_id,
        student_id,
        status,
        current_stage,
        pipeline_version,
        auto_total_score,
        final_total_score
      `)
      .eq('id', submissionId)
      .single(),

    admin
      .from('submission_files')
      .select(`
        id,
        submission_id,
        page_number,
        storage_path,
        mime_type,
        uploaded_at
      `)
      .eq('submission_id', submissionId)
      .order('page_number', { ascending: true }),

    admin
      .from('grading_results')
      .select(`
        id,
        submission_id,
        item_no,
        auto_score,
        final_score,
        reviewer_notes,
        confidence_score,
        roi_id,
        page_number,
        selected_candidate_id,
        debug_payload
      `)
      .eq('submission_id', submissionId),

    admin
      .from('grading_candidates')
      .select(`
        id,
        submission_id,
        roi_id,
        page_number,
        rank,
        raw_text,
        normalized_value,
        confidence_score,
        engine_source
      `)
      .eq('submission_id', submissionId)
      .order('page_number', { ascending: true })
      .order('rank', { ascending: true }),
  ])

  if (submissionRes.error || !submissionRes.data) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto max-w-5xl rounded-2xl border border-red-200 bg-white p-6 text-red-700 shadow-sm">
          Failed to load submission: {submissionRes.error?.message ?? 'not found'}
        </div>
      </div>
    )
  }

  if (filesRes.error || resultsRes.error || candidatesRes.error) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto max-w-5xl rounded-2xl border border-red-200 bg-white p-6 text-red-700 shadow-sm">
          Failed to load inspector data:
          <div className="mt-2 text-sm">
            {filesRes.error?.message ?? resultsRes.error?.message ?? candidatesRes.error?.message}
          </div>
        </div>
      </div>
    )
  }

  const submission = submissionRes.data
  const files = filesRes.data ?? []
  const results = resultsRes.data ?? []
  const candidates = candidatesRes.data ?? []

  const answerKeyRes = await admin
    .from('assignment_answer_keys')
    .select(`
      assignment_id,
      answer_key,
      source_pdf_path,
      source_file_id,
      approval_status,
      generation_status
    `)
    .eq('assignment_id', submission.assignment_id)
    .maybeSingle()

  const answerKeyRow = answerKeyRes.data ?? null
  const normalizedAnswerKeyItems = normalizeAnswerKeyItems(answerKeyRow?.answer_key ?? null)

  let sourceFileStoragePath: string | null = null
  let sourceFileName: string | null = null

  if (answerKeyRow?.source_file_id) {
    const sourceFileRes = await admin
      .from('assignment_source_files')
      .select('id, storage_path, original_filename')
      .eq('id', answerKeyRow.source_file_id)
      .maybeSingle()

    sourceFileStoragePath = safeText(sourceFileRes.data?.storage_path)
    sourceFileName = safeText(sourceFileRes.data?.original_filename)
  }

  if (!sourceFileStoragePath && answerKeyRow?.source_pdf_path) {
    sourceFileStoragePath = safeText(answerKeyRow.source_pdf_path)
  }

  const answerKeySourceUrl = await createSignedUrl(
    admin,
    assignmentBucket,
    sourceFileStoragePath,
    60 * 60
  )

  const pageImageUrlMap = new Map<number, string | null>()
  for (const file of files) {
    pageImageUrlMap.set(
      Number(file.page_number),
      await createSignedUrl(admin, submissionBucket, safeText(file.storage_path))
    )
  }

  const debugRoiPathSet = new Set<string>()
  for (const row of results) {
    const debugPath = safeText((row as any)?.debug_payload?.debug_roi_path)
    if (debugPath) debugRoiPathSet.add(debugPath)
  }

  const debugRoiUrlMap = new Map<string, string | null>()
  for (const debugPath of debugRoiPathSet) {
    debugRoiUrlMap.set(
      debugPath,
      await createSignedUrl(admin, submissionBucket, debugPath)
    )
  }

  const candidatesByRoi = new Map<string, any[]>()
  for (const candidate of candidates) {
    const roiId = safeText(candidate.roi_id)
    if (!roiId) continue
    const list = candidatesByRoi.get(roiId) ?? []
    list.push(candidate)
    candidatesByRoi.set(roiId, list)
  }

  const items = results
    .map((row) => {
      const debug = (row as any)?.debug_payload ?? {}
      const final = debug?.final ?? {}
      const grade = debug?.grade ?? {}

      const roiId = safeText(row.roi_id)
      const pageNumber = safeNumber(row.page_number)
      const bboxNorm = safeBBox(debug?.bbox_norm)
      const debugRoiPath = safeText(debug?.debug_roi_path)

      const itemCandidates = roiId ? candidatesByRoi.get(roiId) ?? [] : []
      const selectedCandidateId = safeText(row.selected_candidate_id)

      const resolvedAnswerKeyItem =
        findAnswerKeyItem(normalizedAnswerKeyItems, String(row.item_no ?? '')) ??
        debug?.answer_key_item ??
        null

      const resolvedExpectedValues = extractExpectedValues(resolvedAnswerKeyItem)
      const resolvedExpectedAnswer =
        resolvedExpectedValues[0] ??
        safeText(grade?.expected_answer) ??
        null

      const maxScore =
        safeNumber(debug?.score_weight) ??
        safeNumber(grade?.score_weight) ??
        safeNumber(grade?.points) ??
        safeNumber(row.auto_score) ??
        1

      return {
        itemNo: String(row.item_no ?? ''),
        roiId,
        pageNumber,
        autoScore: safeNumber(row.auto_score),
        finalScore: safeNumber(row.final_score),
        maxScore,
        reviewerNotes: safeText(row.reviewer_notes),
        confidenceScore: safeNumber(row.confidence_score),
        selectedCandidateId,
        gradeReason: safeText(grade?.reason),
        expectedAnswer: resolvedExpectedAnswer,
        expectedValues: resolvedExpectedValues,
        expectedType: safeText(grade?.expected_type),
        finalDecision: safeText(final?.decision),
        c1: safeNumber(final?.evidence_map?.c1),
        c2: safeNumber(final?.evidence_map?.c2),
        m: safeNumber(final?.evidence_map?.m),
        finalConfidence: safeNumber(final?.final_confidence),
        debugRoiUrl: debugRoiPath ? (debugRoiUrlMap.get(debugRoiPath) ?? null) : null,
        bboxNorm,
        pageImageUrl: pageNumber != null ? (pageImageUrlMap.get(pageNumber) ?? null) : null,
        candidates: itemCandidates.map((candidate) => ({
          id: String(candidate.id),
          rank: Number(candidate.rank ?? 0),
          rawText: safeText(candidate.raw_text),
          normalizedValue: safeText(candidate.normalized_value),
          confidenceScore: safeNumber(candidate.confidence_score),
          engineSource: safeText(candidate.engine_source),
          isSelected: selectedCandidateId != null && String(candidate.id) === selectedCandidateId,
        })),
        googleRawByVariant: Array.isArray(debug?.google_raw_by_variant)
          ? debug.google_raw_by_variant
          : [],
        paddleRawByVariant: Array.isArray(debug?.paddle_raw_by_variant)
          ? debug.paddle_raw_by_variant
          : [],
        rawAnswerKeyItem: resolvedAnswerKeyItem,
        answerKeyLookup: {
          resolvedItemNo:
            safeText(debug?.answer_key_lookup?.resolved_item_no) ??
            String(row.item_no ?? ''),
          found: Boolean(resolvedAnswerKeyItem),
        },
      }
    })
    .sort((a, b) => sortItemNo(a.itemNo, b.itemNo))

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1600px] px-6 pt-6">
        <Link
          href="/admin/review"
          className="inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← Back to Review Queue
        </Link>
      </div>

      <NeedReviewInspector
        submission={{
          id: submission.id,
          assignmentId: submission.assignment_id,
          studentId: submission.student_id,
          status: submission.status ?? null,
          currentStage: submission.current_stage ?? null,
          pipelineVersion: submission.pipeline_version ?? null,
          autoTotalScore: safeNumber(submission.auto_total_score),
          finalTotalScore: safeNumber(submission.final_total_score),
          answerKeySourceUrl,
          answerKeySourceFilename: sourceFileName ?? safeText(sourceFileStoragePath),
          answerKeyApprovalStatus: safeText(answerKeyRow?.approval_status),
          answerKeyGenerationStatus: safeText(answerKeyRow?.generation_status),
        }}
        items={items}
      />
    </div>
  )
}