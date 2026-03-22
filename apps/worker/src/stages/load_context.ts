import { supabase } from '../lib/supabase'

export type WorkerRegion = {
  id: string
  kind: string
  label?: string | null
  question_no?: number | null
  subquestion_no?: string | null
  part_no?: string | null
  group_id?: string | null
  identity_type?: string | null
  score_weight?: number | null
  answer_type?: string | null
  grader?: Record<string, unknown> | null
  bbox_norm?: [number, number, number, number] | null
  polygon_norm?: [number, number][] | null
}

export type WorkerPage = {
  page_number: number
  regions: WorkerRegion[]
}

export type WorkerLayoutData = {
  schema_version: number
  assignment_id?: string
  document_type?: string
  default_coordinate_space?: string
  page_count: number
  pages: WorkerPage[]
  settings?: Record<string, unknown>
}

export type SubmissionPageFile = {
  id: string
  submission_id: string
  storage_path: string
  mime_type: string | null
  page_number: number
  uploaded_at: string | null
}

export type WorkerAnswerKeyItem = {
  roi_id: string
  question_no?: number | null
  subquestion_no?: string | null
  part_no?: string | null
  group_id?: string | null
  page_number: number
  expected_value: unknown
  points?: number
  answer_type?: string | null
  grader?: Record<string, unknown> | null
  source?: string
}

export type WorkerContext = {
  submission: {
    id: string
    assignment_id: string
    student_id: string | null
    status: string | null
    pipeline_version: string | null
    layout_spec_id: string | null
    layout_spec_version: number | null
  }
  assignment: {
    id: string
    title: string | null
    section_id: string | null
  }
  layoutSpec: {
    id: string
    version: number
    spec_name: string | null
    layout_status: string | null
    layout_data: WorkerLayoutData
  }
  answerKey: {
    assignment_id: string
    approval_status: string | null
    generation_status: string | null
    answer_key: {
      schema_version?: number
      generated_mode?: string
      generated_at?: string
      items: WorkerAnswerKeyItem[]
    } | null
    grading_config: Record<string, unknown> | null
  } | null
  pages: SubmissionPageFile[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toNumber(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeRegion(region: unknown): WorkerRegion | null {
  if (!isObject(region)) return null
  if (typeof region.id !== 'string' || !region.id.trim()) return null
  if (typeof region.kind !== 'string' || !region.kind.trim()) return null

  const bbox =
    Array.isArray(region.bbox_norm) && region.bbox_norm.length === 4
      ? (region.bbox_norm.map((v) => Number(v)) as [number, number, number, number])
      : null

  const polygon =
    Array.isArray(region.polygon_norm) && region.polygon_norm.length >= 3
      ? (region.polygon_norm
          .map((p) =>
            Array.isArray(p) && p.length === 2 ? [Number(p[0]), Number(p[1])] : null
          )
          .filter(Boolean) as [number, number][])
      : null

  return {
    id: region.id,
    kind: region.kind,
    label: typeof region.label === 'string' ? region.label : null,
    question_no:
      region.question_no === null || region.question_no === undefined
        ? null
        : Number(region.question_no),
    subquestion_no:
      typeof region.subquestion_no === 'string' ? region.subquestion_no : null,
    part_no: typeof region.part_no === 'string' ? region.part_no : null,
    group_id: typeof region.group_id === 'string' ? region.group_id : null,
    identity_type:
      typeof region.identity_type === 'string' ? region.identity_type : null,
    score_weight:
      region.score_weight === null || region.score_weight === undefined
        ? null
        : Number(region.score_weight),
    answer_type: typeof region.answer_type === 'string' ? region.answer_type : null,
    grader: isObject(region.grader) ? region.grader : null,
    bbox_norm: bbox,
    polygon_norm: polygon,
  }
}

function normalizeLayoutData(raw: unknown, assignmentId: string): WorkerLayoutData {
  if (!isObject(raw)) {
    throw new Error('layout_data must be an object')
  }

  const rawPages = Array.isArray(raw.pages) ? raw.pages : []
  const normalizedPages: WorkerPage[] = rawPages.map((page, idx) => {
    const pageObj = isObject(page) ? page : {}
    const pageNumber = toNumber(pageObj.page_number, idx + 1)

    const rawRegions = Array.isArray(pageObj.regions) ? pageObj.regions : []
    const regions = rawRegions.map(normalizeRegion).filter(Boolean) as WorkerRegion[]

    return {
      page_number: pageNumber,
      regions,
    }
  })

  return {
    schema_version: toNumber(raw.schema_version, 2),
    assignment_id:
      typeof raw.assignment_id === 'string' ? raw.assignment_id : assignmentId,
    document_type: typeof raw.document_type === 'string' ? raw.document_type : 'worksheet',
    default_coordinate_space:
      typeof raw.default_coordinate_space === 'string'
        ? raw.default_coordinate_space
        : 'normalized',
    page_count: toNumber(raw.page_count, normalizedPages.length || 1),
    pages: normalizedPages,
    settings: isObject(raw.settings) ? raw.settings : {},
  }
}

export async function loadContext(submissionId: string): Promise<WorkerContext> {
  const { data: submission, error: submissionError } = await supabase
    .from('submissions')
    .select(`
      id,
      assignment_id,
      student_id,
      status,
      pipeline_version,
      layout_spec_id,
      layout_spec_version
    `)
    .eq('id', submissionId)
    .single()

  if (submissionError || !submission) {
    throw new Error(submissionError?.message || 'Submission not found')
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from('assignments')
    .select(`
      id,
      title,
      section_id
    `)
    .eq('id', submission.assignment_id)
    .single()

  if (assignmentError || !assignment) {
    throw new Error(assignmentError?.message || 'Assignment not found')
  }

  const { data: layoutSpec, error: layoutSpecError } = await supabase
    .from('assignment_layout_specs')
    .select(`
      id,
      assignment_id,
      version,
      spec_name,
      layout_status,
      is_active,
      layout_data
    `)
    .eq('assignment_id', assignment.id)
    .eq('is_active', true)
    .single()

  if (layoutSpecError || !layoutSpec) {
    throw new Error(layoutSpecError?.message || 'Active layout spec not found')
  }

  const normalizedLayout = normalizeLayoutData(layoutSpec.layout_data, assignment.id)

  const { data: pages, error: pagesError } = await supabase
    .from('submission_files')
    .select(`
      id,
      submission_id,
      storage_path,
      mime_type,
      page_number,
      uploaded_at
    `)
    .eq('submission_id', submission.id)
    .order('page_number', { ascending: true })

  if (pagesError) {
    throw new Error(pagesError.message)
  }

  if (!pages || pages.length === 0) {
    throw new Error('Submission files not found')
  }

  const { data: answerKey, error: answerKeyError } = await supabase
    .from('assignment_answer_keys')
    .select(`
      assignment_id,
      approval_status,
      generation_status,
      answer_key,
      grading_config
    `)
    .eq('assignment_id', assignment.id)
    .maybeSingle()

  if (answerKeyError) {
    throw new Error(answerKeyError.message)
  }

  return {
    submission: {
      id: submission.id,
      assignment_id: submission.assignment_id,
      student_id: submission.student_id ?? null,
      status: submission.status ?? null,
      pipeline_version: submission.pipeline_version ?? null,
      layout_spec_id: submission.layout_spec_id ?? null,
      layout_spec_version: submission.layout_spec_version ?? null,
    },
    assignment: {
      id: assignment.id,
      title: assignment.title ?? null,
      section_id: assignment.section_id ?? null,
    },
    layoutSpec: {
      id: layoutSpec.id,
      version: Number(layoutSpec.version),
      spec_name: layoutSpec.spec_name ?? null,
      layout_status: layoutSpec.layout_status ?? null,
      layout_data: normalizedLayout,
    },
    answerKey: answerKey
      ? {
          assignment_id: answerKey.assignment_id,
          approval_status: answerKey.approval_status ?? null,
          generation_status: answerKey.generation_status ?? null,
          answer_key: isObject(answerKey.answer_key)
            ? {
                ...answerKey.answer_key,
                items: Array.isArray(answerKey.answer_key.items)
                  ? (answerKey.answer_key.items as WorkerAnswerKeyItem[])
                  : [],
              }
            : null,
          grading_config: isObject(answerKey.grading_config)
            ? answerKey.grading_config
            : null,
        }
      : null,
    pages: (pages ?? []).map((p) => ({
      id: p.id,
      submission_id: p.submission_id,
      storage_path: p.storage_path,
      mime_type: p.mime_type ?? null,
      page_number: Number(p.page_number),
      uploaded_at: p.uploaded_at ?? null,
    })),
  }
}