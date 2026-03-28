import type { ExamCandidate, ExamEvidenceMap, ExamGradingItem } from '@/lib/admin/exam-grading'

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

function InfoBlock({
  label,
  value,
}: {
  label: string
  value: string | number | null
}) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-neutral-900">
        {value == null || value === '' ? '—' : String(value)}
      </p>
    </div>
  )
}

function OCRResultLine({ result }: { result: any }) {
  if (typeof result === 'string') {
    return (
      <div className="rounded-md bg-white px-2 py-1 text-sm text-neutral-800">
        {result}
      </div>
    )
  }

  const text =
    typeof result === 'object' && result !== null
      ? String(result.text ?? JSON.stringify(result))
      : String(result)

  const confidence =
    typeof result === 'object' && result !== null
      ? Number(result.confidence ?? NaN)
      : NaN

  return (
    <div className="rounded-md bg-white px-2 py-1 text-sm text-neutral-800">
      <span>{text}</span>
      {Number.isFinite(confidence) ? (
        <span className="ml-2 text-xs text-neutral-500">
          ({confidence.toFixed(2)})
        </span>
      ) : null}
    </div>
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
              <p className="text-xs font-medium text-neutral-500">
                {row.variant}
              </p>

              {Array.isArray(row.results) && row.results.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {row.results.map((result, resultIndex) => (
                    <OCRResultLine
                      key={`${title}-${idx}-${resultIndex}`}
                      result={result}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm text-neutral-500">—</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CandidateCard({
  candidate,
  index,
}: {
  candidate: ExamCandidate
  index: number
}) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-neutral-500">
          #{index + 1}
        </span>

        <div className="flex flex-wrap gap-2">
          {candidate.engineSource ? (
            <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-700">
              {candidate.engineSource}
            </span>
          ) : null}

          {candidate.kind ? (
            <span className="rounded-full bg-sky-100 px-2 py-1 text-xs text-sky-700">
              {candidate.kind}
            </span>
          ) : null}

          {candidate.confidenceScore != null ? (
            <span className="rounded-full bg-violet-100 px-2 py-1 text-xs text-violet-700">
              {candidate.confidenceScore.toFixed(2)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <InfoBlock label="Raw" value={candidate.rawText} />
        <InfoBlock label="Normalized" value={candidate.normalizedValue} />
        <InfoBlock label="Numeric" value={candidate.numericValue} />
        <InfoBlock label="Unit" value={candidate.unit} />
      </div>
    </div>
  )
}

function CandidateSection({
  title,
  candidates,
}: {
  title: string
  candidates: ExamCandidate[]
}) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-sm font-semibold text-neutral-900">{title}</p>

      {candidates.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">—</p>
      ) : (
        <div className="mt-3 space-y-3">
          {candidates.map((candidate, index) => (
            <CandidateCard
              key={`${title}-${index}-${candidate.rawText ?? candidate.normalizedValue ?? 'candidate'}`}
              candidate={candidate}
              index={index}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EvidenceMapCard({ evidenceMap }: { evidenceMap: ExamEvidenceMap | null }) {
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
      <p className="text-sm font-semibold text-sky-900">Confidence Evidence</p>

      {!evidenceMap ? (
        <p className="mt-2 text-sm text-sky-700">—</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          <InfoBlock
            label="c1"
            value={evidenceMap.c1 != null ? evidenceMap.c1.toFixed(2) : '—'}
          />
          <InfoBlock
            label="c2"
            value={evidenceMap.c2 != null ? evidenceMap.c2.toFixed(2) : '—'}
          />
          <InfoBlock
            label="m"
            value={evidenceMap.m != null ? evidenceMap.m.toFixed(2) : '—'}
          />
          <InfoBlock label="Formula" value={evidenceMap.formula} />
        </div>
      )}
    </div>
  )
}

function BboxText({
  bbox,
}: {
  bbox: [number, number, number, number] | null
}) {
  if (!bbox) return <>—</>

  return <>{bbox.map((value) => value.toFixed(4)).join(', ')}</>
}

export function ExamItemCard({ item }: { item: ExamGradingItem }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <InfoBlock label="Expected answer" value={item.expectedAnswer} />
            <InfoBlock label="Answer type" value={item.answerType} />
            <InfoBlock
              label="Selected candidate"
              value={item.selectedCandidateText}
            />
            <InfoBlock
              label="Normalized"
              value={item.selectedCandidateNormalized}
            />
            <InfoBlock label="ROI ID" value={item.roiId} />
            <InfoBlock label="Question no" value={item.questionNo} />
            <InfoBlock label="Page" value={item.pageNumber} />
            <InfoBlock label="Score weight" value={item.scoreWeight} />
            <InfoBlock label="Auto score" value={item.autoScore} />
            <InfoBlock label="Final score" value={item.finalScore} />
            <InfoBlock
              label="BBox"
              value={item.bboxNorm ? item.bboxNorm.map((v) => v.toFixed(4)).join(', ') : '—'}
            />
            <InfoBlock label="Reason" value={item.reason} />
          </div>

          <EvidenceMapCard evidenceMap={item.evidenceMap} />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <OCRBlock title="Google OCR" rows={item.googleRawByVariant} />
            <OCRBlock title="OCR ตัวที่ 2" rows={item.ocr2RawByVariant} />
          </div>

          <CandidateSection
            title="Merged candidates"
            candidates={item.mergedCandidates}
          />

          <CandidateSection
            title="Persisted candidates"
            candidates={item.persistedCandidates}
          />
        </div>
      </div>
    </div>
  )
}