export type ExamStatus =
  | 'draft'
  | 'layout_ready'
  | 'answer_key_ready'
  | 'ready_for_upload'
  | 'processing'
  | 'completed'

export type ExamSummaryRow = {
  id: string
  title: string
  courseCode: string
  termLabel: string
  totalItems: number
  totalPages: number
  totalStudents: number
  processedCount: number
  status: ExamStatus
  updatedAt: string
}

export type NeedsReviewRow = {
  submissionId: string
  examId: string
  examTitle: string
  studentId: string
  studentName: string
  scoreLabel: string
  avgConfidence: number
  decision: 'auto_graded' | 'needs_review'
}

export type ExamOverviewData = ExamSummaryRow & {
  description: string | null
  progress: Array<{
    key: string
    label: string
    done: boolean
  }>
}

export type ExamDashboardData = {
  overview: {
    totalExams: number
    readyForUpload: number
    processing: number
    needsReview: number
  }
  recentExams: ExamSummaryRow[]
  needsReviewItems: NeedsReviewRow[]
}

const MOCK_EXAMS: ExamSummaryRow[] = [
  {
    id: 'exam-midterm-math1',
    title: 'Midterm 1 - Mathematics 1',
    courseCode: '746-111',
    termLabel: '1/2026',
    totalItems: 20,
    totalPages: 4,
    totalStudents: 120,
    processedCount: 48,
    status: 'processing',
    updatedAt: '2026-03-27 20:40',
  },
  {
    id: 'exam-quiz-limits',
    title: 'Quiz - Limits and Continuity',
    courseCode: '746-111',
    termLabel: '1/2026',
    totalItems: 10,
    totalPages: 2,
    totalStudents: 45,
    processedCount: 45,
    status: 'completed',
    updatedAt: '2026-03-27 18:10',
  },
  {
    id: 'exam-worksheet-derivatives',
    title: 'Worksheet - Derivatives',
    courseCode: '746-113',
    termLabel: '1/2026',
    totalItems: 15,
    totalPages: 3,
    totalStudents: 0,
    processedCount: 0,
    status: 'answer_key_ready',
    updatedAt: '2026-03-26 14:20',
  },
  {
    id: 'exam-practice-series',
    title: 'Practice - Infinite Series',
    courseCode: '746-111',
    termLabel: '1/2026',
    totalItems: 12,
    totalPages: 3,
    totalStudents: 0,
    processedCount: 0,
    status: 'draft',
    updatedAt: '2026-03-25 10:05',
  },
]

const MOCK_NEEDS_REVIEW: NeedsReviewRow[] = [
  {
    submissionId: 'sub-001',
    examId: 'exam-midterm-math1',
    examTitle: 'Midterm 1 - Mathematics 1',
    studentId: '6612345678',
    studentName: 'Student A',
    scoreLabel: '12 / 20',
    avgConfidence: 0.63,
    decision: 'needs_review',
  },
  {
    submissionId: 'sub-002',
    examId: 'exam-midterm-math1',
    examTitle: 'Midterm 1 - Mathematics 1',
    studentId: '6612345680',
    studentName: 'Student B',
    scoreLabel: '15 / 20',
    avgConfidence: 0.71,
    decision: 'needs_review',
  },
]

function computeOverview(data: ExamSummaryRow[]) {
  return {
    totalExams: data.length,
    readyForUpload: data.filter((row) =>
      ['answer_key_ready', 'ready_for_upload'].includes(row.status)
    ).length,
    processing: data.filter((row) => row.status === 'processing').length,
    needsReview: MOCK_NEEDS_REVIEW.length,
  }
}

export async function getExamDashboardData(): Promise<ExamDashboardData> {
  return {
    overview: computeOverview(MOCK_EXAMS),
    recentExams: MOCK_EXAMS,
    needsReviewItems: MOCK_NEEDS_REVIEW,
  }
}

export async function getExamListData(): Promise<ExamSummaryRow[]> {
  return MOCK_EXAMS
}

export async function getExamOverviewData(
  examId: string
): Promise<ExamOverviewData | null> {
  const found = MOCK_EXAMS.find((row) => row.id === examId)
  if (!found) return null

  return {
    ...found,
    description: 'ระบบนี้ใช้สำหรับกำหนด ROI, answer key, อัปโหลดคำตอบ และตรวจข้อสอบอัตโนมัติ',
    progress: [
      { key: 'exam_info', label: 'ข้อมูลชุดข้อสอบ', done: true },
      { key: 'layout', label: 'ROI Layout', done: found.status !== 'draft' },
      {
        key: 'answer_key',
        label: 'Answer Key',
        done: ['answer_key_ready', 'ready_for_upload', 'processing', 'completed'].includes(found.status),
      },
      {
        key: 'students',
        label: 'ผู้เข้าสอบ / Student ID',
        done: found.totalStudents > 0,
      },
      {
        key: 'uploads',
        label: 'อัปโหลดกระดาษคำตอบ',
        done: found.processedCount > 0,
      },
      {
        key: 'results',
        label: 'ผลตรวจ',
        done: ['processing', 'completed'].includes(found.status),
      },
    ],
  }
}