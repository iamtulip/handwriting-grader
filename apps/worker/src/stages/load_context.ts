import { supabase } from '../lib/supabase'

export type WorkerAnswerKeyItem = {
  item_no: string
  question_no?: string | null
  answer?: string | number | null
  correct_answer?: string | number | null
  expected?: string | number | null
  value?: string | number | null
  answer_type?: string | null
  tolerance?: number | null
  points?: number | null
  score_weight?: number | null
  accepted_answers?: Array<string | number>
}

export type WorkerLayoutRegion = {
  roi_id?: string
  id?: string
  kind?: string
  item_no?: string | number | null
  question_no?: string | number | null
  answer_type?: string | null
  points?: number | null
  score_weight?: number | null
  bbox_norm?: [number, number, number, number] | number[] | null
  bbox?: [number, number, number, number] | number[] | null
}

export type WorkerLayoutPage = {
  page_number?: number
  page_index?: number
  regions?: WorkerLayoutRegion[]
}

export type WorkerLayoutData = {
  pages?: WorkerLayoutPage[]
}

export type WorkerSubmission = {
  id: string
  assignment_id: string
  student_id: string
  status?: string | null
  current_stage?: string | null
  pipeline_version?: string | null
}

export type WorkerPageFile = {
  id: string
  submission_id: string
  page_number: number
  storage_path: string
  mime_type?: string | null
  created_at?: string | null
}

export type WorkerLayoutSpec = {
  id: string
  assignment_id: string
  version: number
  spec_name?: string | null
  layout_status?: string | null
  layout_data: WorkerLayoutData
}

export type WorkerContext = {
  submission: WorkerSubmission
  pages: WorkerPageFile[]
  layoutSpec: WorkerLayoutSpec
  answerKey: {
    items: WorkerAnswerKeyItem[]
  }
  answerKeyItems: WorkerAnswerKeyItem[]
  gradingConfig?: any
}

function ensureArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function pickLatestLayoutSpec(rows: any[]): WorkerLayoutSpec | null {
  if (!Array.isArray(rows) || rows.length === 0) return null

  const sorted = [...rows].sort(
    (a, b) => Number(b.version ?? 0) - Number(a.version ?? 0)
  )
  const row = sorted[0]

  return {
    id: row.id,
    assignment_id: row.assignment_id,
    version: Number(row.version ?? 1),
    spec_name: row.spec_name ?? null,
    layout_status: row.layout_status ?? null,
    layout_data: (row.layout_data ?? { pages: [] }) as WorkerLayoutData,
  }
}

function normalizeAnswerKeyItems(answerKey: any): WorkerAnswerKeyItem[] {
  if (Array.isArray(answerKey)) {
    return answerKey.map((item: any, index: number) => ({
      item_no: String(item?.item_no ?? item?.question_no ?? index + 1),
      question_no: item?.question_no != null ? String(item.question_no) : null,
      answer: item?.answer ?? null,
      correct_answer: item?.correct_answer ?? null,
      expected: item?.expected ?? null,
      value: item?.value ?? null,
      answer_type: item?.answer_type ?? null,
      tolerance:
        item?.tolerance != null ? Number(item.tolerance) : null,
      points:
        item?.points != null ? Number(item.points) : null,
      score_weight:
        item?.score_weight != null ? Number(item.score_weight) : null,
      accepted_answers: Array.isArray(item?.accepted_answers)
        ? item.accepted_answers
        : [],
    }))
  }

  if (Array.isArray(answerKey?.items)) {
    return answerKey.items.map((item: any, index: number) => ({
      item_no: String(item?.item_no ?? item?.question_no ?? index + 1),
      question_no: item?.question_no != null ? String(item.question_no) : null,
      answer: item?.answer ?? null,
      correct_answer: item?.correct_answer ?? null,
      expected: item?.expected ?? null,
      value: item?.value ?? null,
      answer_type: item?.answer_type ?? null,
      tolerance:
        item?.tolerance != null ? Number(item.tolerance) : null,
      points:
        item?.points != null ? Number(item.points) : null,
      score_weight:
        item?.score_weight != null ? Number(item.score_weight) : null,
      accepted_answers: Array.isArray(item?.accepted_answers)
        ? item.accepted_answers
        : [],
    }))
  }

  if (answerKey && typeof answerKey === 'object') {
    return Object.entries(answerKey).map(([key, value]: [string, any]) => ({
      item_no: String(key),
      question_no: null,
      answer: typeof value === 'object' && value !== null ? value.answer ?? null : value,
      correct_answer:
        typeof value === 'object' && value !== null ? value.correct_answer ?? null : null,
      expected:
        typeof value === 'object' && value !== null ? value.expected ?? null : null,
      value:
        typeof value === 'object' && value !== null ? value.value ?? null : null,
      answer_type:
        typeof value === 'object' && value !== null ? value.answer_type ?? null : null,
      tolerance:
        typeof value === 'object' && value !== null && value.tolerance != null
          ? Number(value.tolerance)
          : null,
      points:
        typeof value === 'object' && value !== null && value.points != null
          ? Number(value.points)
          : null,
      score_weight:
        typeof value === 'object' && value !== null && value.score_weight != null
          ? Number(value.score_weight)
          : null,
      accepted_answers:
        typeof value === 'object' && value !== null && Array.isArray(value.accepted_answers)
          ? value.accepted_answers
          : [],
    }))
  }

  return []
}

export async function loadContext(submissionId: string): Promise<WorkerContext> {
  const { data: submission, error: submissionError } = await supabase
    .from('submissions')
    .select('id, assignment_id, student_id, status, current_stage, pipeline_version')
    .eq('id', submissionId)
    .single()

  if (submissionError || !submission) {
    throw new Error(`Failed to load submission: ${submissionError?.message ?? 'not found'}`)
  }

  const { data: pageFiles, error: pageError } = await supabase
    .from('submission_files')
    .select('id, submission_id, page_number, storage_path, mime_type, created_at')
    .eq('submission_id', submissionId)
    .order('page_number', { ascending: true })

  if (pageError) {
    throw new Error(`Failed to load submission_files: ${pageError.message}`)
  }

  const pages: WorkerPageFile[] = ensureArray(pageFiles).map((row: any) => ({
    id: row.id,
    submission_id: row.submission_id,
    page_number: Number(row.page_number ?? 1),
    storage_path: row.storage_path,
    mime_type: row.mime_type ?? null,
    created_at: row.created_at ?? null,
  }))

  if (pages.length === 0) {
    throw new Error('Submission files not found')
  }

  const { data: layoutSpecs, error: layoutError } = await supabase
    .from('assignment_layout_specs')
    .select('id, assignment_id, version, spec_name, layout_status, layout_data')
    .eq('assignment_id', submission.assignment_id)

  if (layoutError) {
    throw new Error(`Failed to load assignment_layout_specs: ${layoutError.message}`)
  }

  const layoutSpec = pickLatestLayoutSpec(layoutSpecs ?? [])
  if (!layoutSpec) {
    throw new Error(`No layout spec found for assignment ${submission.assignment_id}`)
  }

  const { data: answerKeyRow, error: answerKeyError } = await supabase
    .from('assignment_answer_keys')
    .select('assignment_id, answer_key, grading_config')
    .eq('assignment_id', submission.assignment_id)
    .maybeSingle()

  if (answerKeyError) {
    throw new Error(`Failed to load answer key: ${answerKeyError.message}`)
  }

  const rawAnswerKey = answerKeyRow?.answer_key ?? { items: [] }
  const answerKeyItems = normalizeAnswerKeyItems(rawAnswerKey)
  const gradingConfig = answerKeyRow?.grading_config ?? {}

  return {
    submission: {
      id: submission.id,
      assignment_id: submission.assignment_id,
      student_id: submission.student_id,
      status: submission.status ?? null,
      current_stage: submission.current_stage ?? null,
      pipeline_version: submission.pipeline_version ?? null,
    },
    pages,
    layoutSpec: {
      id: layoutSpec.id,
      assignment_id: layoutSpec.assignment_id,
      version: Number(layoutSpec.version ?? 1),
      spec_name: layoutSpec.spec_name ?? null,
      layout_status: layoutSpec.layout_status ?? null,
      layout_data: layoutSpec.layout_data ?? { pages: [] },
    },
    answerKey: {
      items: answerKeyItems,
    },
    answerKeyItems,
    gradingConfig,
  }
}