type Item = {
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
  googleRawByVariant: Array<{ variant: string; results: any[] }>
  ocr2RawByVariant: Array<{ variant: string; results: any[] }>
  candidates: any[]
  reason: string | null
}

function DecisionBadge({
  decision,
}: {
  decision: 'auto_graded' | 'needs_review'
}) {
  if (decision === 'auto_graded') {
    return (
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
        AUTO GRADED
      </span>
    )
  }

  return (
    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
      NEEDS REVIEW
    </span>
  )
}

function ConfidenceBadge({ value }: { value: number | null }) {
  const v = Number(value ?? 0)

  const tone =
    v >= 0.9
      ? 'bg-emerald-100 text-emerald-800'
      : v >= 0.7
      ? 'bg-amber-100 text-amber-800'
      : 'bg-rose-100 text-rose-800'

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
      Conf. {v.toFixed(2)}
    </span>
  )
}

function OCRBlock({
  title,
  rows,
}: {
  title: string
  rows: Array<{ variant: string; results: any[] }>
}) {
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <p className="text-sm font-semibold text-neutral-900">{title}</p>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">—</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, idx) => (
            <div key={`${title}-${idx}`} className="rounded-lg bg-neutral-50 p-2">
              <p className="text-xs font-medium text-neutral-500">{row.variant}</p>
              <p className="mt-1 break-words text-sm text-neutral-900">
                {Array.isArray(row.results) && row.results.length > 0
                  ? JSON.stringify(row.results)
                  : '—'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ExamItemCard({ item }: { item: Item }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-neutral-900">ข้อ {item.itemNo}</h3>
          <DecisionBadge decision={item.decision} />
          <ConfidenceBadge value={item.confidence} />
        </div>

        <div className="text-sm text-neutral-600">
          คะแนน {Number(item.finalScore ?? item.autoScore ?? 0).toFixed(2)}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-4">
          <div className="overflow-hidden rounded-xl border bg-neutral-50">
            {item.roiImageUrl ? (
              <img
                src={item.roiImageUrl}
                alt={`ROI item ${item.itemNo}`}
                className="h-auto w-full object-contain"
              />
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-neutral-500">
                ไม่มีภาพ ROI
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 xl:col-span-8">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border p-3">
              <p className="text-xs text-neutral-500">Expected answer</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">
                {item.expectedAnswer ?? '—'}
              </p>
            </div>

            <div className="rounded-xl border p-3">
              <p className="text-xs text-neutral-500">Answer type</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">
                {item.answerType ?? '—'}
              </p>
            </div>

            <div className="rounded-xl border p-3">
              <p className="text-xs text-neutral-500">Selected candidate</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">
                {item.selectedCandidateText ?? '—'}
              </p>
            </div>

            <div className="rounded-xl border p-3">
              <p className="text-xs text-neutral-500">Normalized</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">
                {item.selectedCandidateNormalized ?? '—'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <OCRBlock title="Google OCR" rows={item.googleRawByVariant} />
            <OCRBlock title="OCR ตัวที่ 2" rows={item.ocr2RawByVariant} />
          </div>

          <div className="rounded-xl border p-3">
            <p className="text-sm font-semibold text-neutral-900">Candidates</p>

            {item.candidates.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">—</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {item.candidates.map((candidate, index) => (
                  <span
                    key={`${item.itemNo}-candidate-${index}`}
                    className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-800"
                  >
                    {typeof candidate === 'string'
                      ? candidate
                      : JSON.stringify(candidate)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {item.reason ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-700">Reason</p>
              <p className="mt-1 text-sm text-amber-900">{item.reason}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}