export type LayoutDocumentType =
  | 'worksheet'
  | 'quiz'
  | 'midterm'
  | 'final'

export type LayoutCoordinateSpace = 'normalized'

export type RegionKind =
  | 'identity'
  | 'answer'
  | 'table_cell'
  | 'working'
  | 'instruction_ignored'

export type IdentityType =
  | 'student_id'
  | 'full_name'
  | 'section'
  | 'other'

export type AnswerType =
  | 'number'
  | 'text'
  | 'fraction'
  | 'expression'
  | 'multiple_choice'
  | 'table_value'

export type GraderMode =
  | 'deterministic'
  | 'exact_text'
  | 'accepted_values'
  | 'symbolic_equivalence'

export type Point = [number, number]
export type BBox = [number, number, number, number]

export interface LayoutTolerance {
  abs_tol: number
  rel_tol: number
}

export interface ExpectedFormat {
  allow_thai_digits?: boolean
  allow_decimal?: boolean
  allow_fraction?: boolean
  allow_text?: boolean
  pattern?: string
}

export interface RegionFlags {
  required?: boolean
  student_visible?: boolean
  review_if_empty?: boolean
}

export interface RegionGrader {
  mode: GraderMode
  tolerance?: LayoutTolerance
  accepted_values?: string[]
  case_sensitive?: boolean
  trim_spaces?: boolean
}

export interface LayoutRegion {
  id: string
  kind: RegionKind
  label?: string

  question_no?: string | null
  subquestion_no?: string | null
  part_no?: string | null
  group_id?: string | null

  identity_type?: IdentityType | null

  score_weight?: number
  answer_type?: AnswerType | null

  expected_format?: ExpectedFormat
  grader?: RegionGrader
  flags?: RegionFlags

  polygon_norm?: Point[]
  bbox_norm?: BBox
}

export interface LayoutPage {
  page_number: number
  page_label?: string
  source_width?: number | null
  source_height?: number | null
  template_ref?: {
    pdf_page_index: number
    rotation?: number
  }
  regions: LayoutRegion[]
}

export interface LayoutSettings {
  allow_multi_roi_per_question: boolean
  enable_identity_verification: boolean
  enable_working_regions: boolean
  default_answer_type: AnswerType
}

export interface AssignmentLayoutDataV2 {
  schema_version: 2
  document_type: LayoutDocumentType
  assignment_id?: string
  spec_name?: string
  page_count: number
  default_coordinate_space: LayoutCoordinateSpace
  settings: LayoutSettings
  pages: LayoutPage[]
}