import type { ExamStatus } from '@/lib/admin/exam-grading-dashboard'

const LABEL_MAP: Record<ExamStatus, string> = {
  draft: 'Draft',
  layout_ready: 'Layout Ready',
  answer_key_ready: 'Answer Key Ready',
  ready_for_upload: 'Ready for Upload',
  processing: 'Processing',
  completed: 'Completed',
}

const TONE_MAP: Record<ExamStatus, string> = {
  draft: 'bg-neutral-100 text-neutral-700',
  layout_ready: 'bg-sky-100 text-sky-700',
  answer_key_ready: 'bg-violet-100 text-violet-700',
  ready_for_upload: 'bg-emerald-100 text-emerald-700',
  processing: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-800',
}

export function ExamStatusBadge({ status }: { status: ExamStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${TONE_MAP[status]}`}
    >
      {LABEL_MAP[status]}
    </span>
  )
}