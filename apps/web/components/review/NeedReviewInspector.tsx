'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Candidate = {
  id: string
  rank: number
  rawText: string | null
  normalizedValue: string | null
  confidenceScore: number | null
  engineSource: string | null
  isSelected: boolean
}

type RawVariantResult = {
  variant: string
  results: Array<{ text: string; confidence: number }>
}

type ReviewItem = {
  itemNo: string
  roiId: string | null
  pageNumber: number | null
  autoScore: number | null
  finalScore: number | null
  maxScore: number | null
  reviewerNotes: string | null
  confidenceScore: number | null
  selectedCandidateId: string | null
  gradeReason: string | null
  expectedAnswer: string | null
  expectedValues: string[]
  expectedType: string | null
  finalDecision: string | null
  c1: number | null
  c2: number | null
  m: number | null
  finalConfidence: number | null
  debugRoiUrl: string | null
  bboxNorm: [number, number, number, number] | null
  pageImageUrl: string | null
  candidates: Candidate[]
  googleRawByVariant: RawVariantResult[]
  paddleRawByVariant: RawVariantResult[]
  rawAnswerKeyItem: any
  answerKeyLookup: {
    resolvedItemNo: string | null
    found: boolean
  } | null
}

type SubmissionSummary = {
  id: string
  assignmentId: string
  studentId: string
  status: string | null
  currentStage: string | null
  pipelineVersion: string | null
  autoTotalScore: number | null
  finalTotalScore: number | null
  answerKeySourceUrl?: string | null
  answerKeySourceFilename?: string | null
  answerKeyApprovalStatus?: string | null
  answerKeyGenerationStatus?: string | null
}

type Props = {
  submission: SubmissionSummary
  items: ReviewItem[]
}

type DraftItem = {
  finalScore: string
  reviewerNotes: string
  selectedCandidateId: string
}

type CompareState = 'matched' | 'mismatch' | 'unknown'

function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '-'
  return String(value)
}

function formatNullable(value: string | null | undefined) {
  return value && value.trim() !== '' ? value : '-'
}

function badgeClass(value: string | null | undefined) {
  const v = (value ?? '').toLowerCase()

  if (v.includes('matched') || v === 'graded' || v === 'approved' || v.includes('auto')) {
    return 'bg-green-100 text-green-800 border-green-200'
  }

  if (
    v.includes('need') ||
    v.includes('review') ||
    v.includes('not_matched') ||
    v.includes('error') ||
    v.includes('failed') ||
    v.includes('no_answer_key') ||
    v.includes('no_candidates')
  ) {
    return 'bg-red-100 text-red-800 border-red-200'
  }

  return 'bg-slate-100 text-slate-700 border-slate-200'
}

function explainReason(item: ReviewItem) {
  if (item.gradeReason === 'no_answer_key') {
    return 'ยังไม่มีคำตอบคาดหวังในตัวตรวจอัตโนมัติ แต่หน้านี้พยายามดึงเฉลยจริงจากฐานข้อมูลมาแสดงให้ผู้ตรวจแล้ว'
  }

  if (item.gradeReason === 'no_candidates') {
    return 'OCR ไม่สามารถสร้าง candidate ที่ใช้ตรวจคะแนนได้'
  }

  if (item.gradeReason === 'not_matched') {
    return 'มี candidate แล้ว แต่ยังไม่ตรงกับคำตอบคาดหวังตามกติกา deterministic grading'
  }

  if (item.gradeReason === 'matched') {
    return 'ข้อนี้ตรงกับคำตอบคาดหวังแล้ว'
  }

  return 'ระบบต้องการให้ผู้ตรวจทบทวนผลลัพธ์ของข้อนี้'
}

function safeDefaultFinalScore(item: ReviewItem) {
  if (item.finalScore != null) return String(item.finalScore)
  if (item.autoScore != null) return String(item.autoScore)
  return '0'
}

function inferMaxScore(item: ReviewItem) {
  if (item.maxScore != null && item.maxScore > 0) return item.maxScore
  if (item.autoScore != null && item.autoScore > 0) return item.autoScore
  return 1
}

function normalizeCompareText(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/\s+/g, '')
    .replace(/[，,]/g, '')
    .replace(/[−–—]/g, '-')
    .trim()
}

function resolveReadableCandidate(item: ReviewItem, selectedCandidateId: string) {
  const selectedCandidate =
    item.candidates.find((c) => c.id === selectedCandidateId) ??
    item.candidates.find((c) => c.isSelected) ??
    item.candidates[0] ??
    null

  return {
    candidate: selectedCandidate,
    displayValue: selectedCandidate?.normalizedValue ?? selectedCandidate?.rawText ?? null,
  }
}

function translateStatus(value: string | null | undefined) {
  const v = (value ?? '').toLowerCase()

  if (!v) return '-'
  if (v === 'approved') return 'อนุมัติแล้ว'
  if (v === 'reviewing') return 'กำลังตรวจ'
  if (v === 'needs_review') return 'ต้องตรวจทาน'
  if (v === 'matched') return 'ตรงเฉลย'
  if (v === 'not_matched') return 'ไม่ตรงเฉลย'
  if (v === 'no_answer_key') return 'ไม่พบเฉลย'
  if (v === 'no_candidates') return 'ไม่พบ candidate'
  if (v === 'graded') return 'ตรวจแล้ว'
  if (v === 'auto_graded') return 'ตรวจอัตโนมัติ'
  if (v === 'failed') return 'ล้มเหลว'
  if (v === 'error') return 'ผิดพลาด'
  return value ?? '-'
}

function compareStateForItem(item: ReviewItem, draft?: DraftItem): CompareState {
  const selectedCandidateId = draft?.selectedCandidateId ?? item.selectedCandidateId ?? ''
  const readable = resolveReadableCandidate(item, selectedCandidateId)
  const readValue = readable.displayValue

  if (!item.expectedAnswer || !readValue) return 'unknown'

  return normalizeCompareText(readValue) === normalizeCompareText(item.expectedAnswer)
    ? 'matched'
    : 'mismatch'
}

function compareStateLabel(state: CompareState) {
  if (state === 'matched') return 'ตรงเฉลย'
  if (state === 'mismatch') return 'ไม่ตรงเฉลย'
  return 'ยังประเมินไม่ได้'
}

function itemTabClass(state: CompareState, isActive: boolean) {
  if (state === 'matched' && isActive) {
    return 'border-green-600 bg-green-100 text-green-900 shadow-sm ring-1 ring-green-300'
  }

  if (state === 'mismatch' && isActive) {
    return 'border-red-600 bg-red-100 text-red-900 shadow-sm ring-1 ring-red-300'
  }

  if (state === 'unknown' && isActive) {
    return 'border-slate-500 bg-slate-100 text-slate-900 shadow-sm ring-1 ring-slate-300'
  }

  if (state === 'matched') {
    return 'border-green-200 bg-green-50 text-green-800 hover:bg-green-100'
  }

  if (state === 'mismatch') {
    return 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100'
  }

  return 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
}

export default function NeedReviewInspector({ submission, items }: Props) {
  const router = useRouter()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [statusText, setStatusText] = useState<string | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false)
  const [isPending, startTransition] = useTransition()

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const an = Number(a.itemNo)
      const bn = Number(b.itemNo)
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn
      return a.itemNo.localeCompare(b.itemNo)
    })
  }, [items])

  const [drafts, setDrafts] = useState<Record<string, DraftItem>>(() => {
    const initial: Record<string, DraftItem> = {}
    for (const item of sortedItems) {
      initial[item.itemNo] = {
        finalScore: safeDefaultFinalScore(item),
        reviewerNotes: item.reviewerNotes ?? '',
        selectedCandidateId: item.selectedCandidateId ?? '',
      }
    }
    return initial
  })

  const selected = sortedItems[selectedIndex] ?? null
  const selectedDraft = selected ? drafts[selected.itemNo] : null

  const readableCandidate =
    selected && selectedDraft
      ? resolveReadableCandidate(selected, selectedDraft.selectedCandidateId)
      : null

  const displayedReadValue = readableCandidate?.displayValue ?? null

  const compareMatched =
    selected && displayedReadValue && selected.expectedAnswer
      ? normalizeCompareText(displayedReadValue) ===
        normalizeCompareText(selected.expectedAnswer)
      : false

  const computedFinalTotal = useMemo(() => {
    return sortedItems.reduce((sum, item) => {
      const raw = drafts[item.itemNo]?.finalScore ?? safeDefaultFinalScore(item)
      const n = Number(raw)
      return sum + (Number.isFinite(n) ? n : 0)
    }, 0)
  }, [drafts, sortedItems])

  function updateDraft(itemNo: string, patch: Partial<DraftItem>) {
    setDrafts((prev) => ({
      ...prev,
      [itemNo]: {
        ...prev[itemNo],
        ...patch,
      },
    }))
  }

  function quickSetScore(item: ReviewItem, mode: 'auto' | 'full' | 'zero' | 'half') {
    const maxScore = inferMaxScore(item)

    if (mode === 'auto') {
      updateDraft(item.itemNo, { finalScore: safeDefaultFinalScore(item) })
      return
    }

    if (mode === 'full') {
      updateDraft(item.itemNo, { finalScore: String(maxScore) })
      return
    }

    if (mode === 'zero') {
      updateDraft(item.itemNo, { finalScore: '0' })
      return
    }

    if (mode === 'half') {
      updateDraft(item.itemNo, { finalScore: String(maxScore / 2) })
    }
  }

  async function postReviewAction(body: any) {
    const res = await fetch(`/api/instructor/review/${submission.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data?.error || 'Request failed')
    }

    return data
  }

  function handleSaveItem(item: ReviewItem) {
    const draft = drafts[item.itemNo]
    if (!draft) return

    setStatusText(null)
    setErrorText(null)

    startTransition(async () => {
      try {
        await postReviewAction({
          action: 'save_item',
          item: {
            itemNo: item.itemNo,
            finalScore: Number(draft.finalScore),
            reviewerNotes: draft.reviewerNotes,
            selectedCandidateId: draft.selectedCandidateId || null,
          },
        })

        setStatusText(`บันทึกข้อ ${item.itemNo} เรียบร้อยแล้ว`)
        router.refresh()
      } catch (error: any) {
        setErrorText(error.message || 'บันทึกคะแนนไม่สำเร็จ')
      }
    })
  }

  function handleSaveAll() {
    setStatusText(null)
    setErrorText(null)

    startTransition(async () => {
      try {
        await postReviewAction({
          action: 'save_all',
          items: sortedItems.map((item) => ({
            itemNo: item.itemNo,
            finalScore: Number(drafts[item.itemNo]?.finalScore ?? 0),
            reviewerNotes: drafts[item.itemNo]?.reviewerNotes ?? '',
            selectedCandidateId: drafts[item.itemNo]?.selectedCandidateId || null,
          })),
        })

        setStatusText('บันทึกทุกข้อเรียบร้อยแล้ว')
        router.refresh()
      } catch (error: any) {
        setErrorText(error.message || 'บันทึกทั้งหมดไม่สำเร็จ')
      }
    })
  }

  function handleApproveSubmission() {
    const confirmed = window.confirm('ยืนยันอนุมัติชุดคำตอบนี้ใช่หรือไม่')
    if (!confirmed) return

    setStatusText(null)
    setErrorText(null)

    startTransition(async () => {
      try {
        await postReviewAction({
          action: 'approve',
        })

        setStatusText('อนุมัติชุดคำตอบเรียบร้อยแล้ว')
        router.refresh()
      } catch (error: any) {
        setErrorText(error.message || 'อนุมัติชุดคำตอบไม่สำเร็จ')
      }
    })
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      <div className="mx-auto max-w-[1800px] p-6 space-y-6">
        <div className="sticky top-3 z-30 rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                หน้าตรวจทานผลการตรวจ
              </h1>
              <p className="mt-2 text-base text-slate-600">
                รหัสชุดคำตอบ: <span className="font-mono">{submission.id}</span>
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span
                  className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${badgeClass(
                    submission.answerKeyApprovalStatus
                  )}`}
                >
                  สถานะเฉลย: {translateStatus(submission.answerKeyApprovalStatus)}
                </span>
                <span
                  className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${badgeClass(
                    submission.answerKeyGenerationStatus
                  )}`}
                >
                  สถานะการสร้างเฉลย: {translateStatus(submission.answerKeyGenerationStatus)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setShowTechnicalDetails((prev) => !prev)}
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-semibold text-slate-700 hover:bg-slate-50"
              >
                {showTechnicalDetails ? 'ซ่อนรายละเอียดเชิงเทคนิค' : 'แสดงรายละเอียดเชิงเทคนิค'}
              </button>

              {submission.answerKeySourceUrl && (
                <a
                  href={submission.answerKeySourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl bg-purple-700 px-5 py-3 text-base font-semibold text-white hover:bg-purple-800"
                >
                  เปิดไฟล์เฉลยต้นฉบับ
                </a>
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
                <div className="text-sm text-slate-500">คะแนนอัตโนมัติรวม</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">
                  {formatNumber(submission.autoTotalScore)}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
                <div className="text-sm text-slate-500">คะแนนสุดท้ายรวม</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">
                  {formatNumber(submission.finalTotalScore)}
                </div>
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4">
                <div className="text-sm text-blue-700">คะแนนฉบับร่างรวม</div>
                <div className="mt-1 text-2xl font-bold text-blue-800">{computedFinalTotal}</div>
              </div>

              <button
                type="button"
                onClick={handleSaveAll}
                disabled={isPending}
                className="rounded-xl bg-blue-700 px-5 py-3 text-base font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                บันทึกทั้งหมด
              </button>

              <button
                type="button"
                onClick={handleApproveSubmission}
                disabled={isPending}
                className="rounded-xl bg-emerald-700 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                อนุมัติชุดคำตอบ
              </button>
            </div>
          </div>

          {submission.answerKeySourceFilename && (
            <div className="mt-4 text-base text-slate-600">
              ไฟล์ต้นฉบับ: <span className="font-mono">{submission.answerKeySourceFilename}</span>
            </div>
          )}

          {(statusText || errorText) && (
            <div className="mt-5 space-y-2">
              {statusText && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-base font-semibold text-green-700">
                  {statusText}
                </div>
              )}
              {errorText && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-base font-semibold text-red-700">
                  {errorText}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sticky top-[176px] z-20 rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-900">เลือกข้อ</h2>
            <span className="rounded-full bg-slate-100 px-4 py-1.5 text-sm font-semibold text-slate-700">
              ทั้งหมด {sortedItems.length} ข้อ
            </span>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2">
            {sortedItems.map((item, index) => {
              const state = compareStateForItem(item, drafts[item.itemNo])

              return (
                <button
                  key={`${item.itemNo}-${item.roiId ?? index}`}
                  onClick={() => setSelectedIndex(index)}
                  className={`shrink-0 rounded-xl border px-6 py-4 text-lg font-bold tracking-tight transition ${itemTabClass(
                    state,
                    index === selectedIndex
                  )}`}
                  title={`ข้อ ${item.itemNo} • ${compareStateLabel(state)}`}
                >
                  ข้อ {item.itemNo}
                </button>
              )
            })}
          </div>
        </div>

        {!selected || !selectedDraft ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-lg text-slate-500 shadow-sm">
            ไม่พบรายการข้อสอบสำหรับแสดงผล
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight text-slate-900">ข้อ {selected.itemNo}</h2>
                  <p className="mt-2 text-base text-slate-600">{explainReason(selected)}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span
                    className={`rounded-full border px-4 py-2 text-sm font-semibold ${badgeClass(
                      selected.gradeReason
                    )}`}
                  >
                    เหตุผลการให้ตรวจทาน: {translateStatus(selected.gradeReason)}
                  </span>
                  <span
                    className={`rounded-full border px-4 py-2 text-sm font-semibold ${badgeClass(
                      selected.finalDecision
                    )}`}
                  >
                    ผลการตัดสินสุดท้าย: {translateStatus(selected.finalDecision)}
                  </span>
                  <span
                    className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                      compareMatched
                        ? 'border-green-200 bg-green-100 text-green-800'
                        : 'border-amber-200 bg-amber-100 text-amber-800'
                    }`}
                  >
                    การเปรียบเทียบ: {compareMatched ? 'ตรงกัน' : 'ควรตรวจด้วยตนเอง'}
                  </span>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(260px,0.9fr)_minmax(260px,0.9fr)_minmax(260px,0.9fr)_minmax(460px,1.15fr)]">
                <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 text-lg font-bold text-slate-800">ROI ที่ระบบใช้ตรวจ</div>

                  {selected.debugRoiUrl ? (
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <img
                        src={selected.debugRoiUrl}
                        alt={`ROI ${selected.roiId}`}
                        className="h-auto w-full"
                      />
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-base text-slate-500">
                      ไม่พบภาพ ROI crop
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-700">
                    <div>
                      ROI: <span className="font-mono">{formatNullable(selected.roiId)}</span>
                    </div>
                    <div>
                      หน้า: <span className="font-semibold">{formatNumber(selected.pageNumber)}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5">
                  <div className="text-lg font-bold text-emerald-800">เฉลยที่ควรได้</div>
                  <div className="mt-3 break-all text-5xl font-extrabold tracking-tight text-emerald-900">
                    {formatNullable(selected.expectedAnswer)}
                  </div>

                  <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4">
                    <div className="text-sm font-semibold text-emerald-700">ชนิดคำตอบที่คาดหวัง</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {formatNullable(selected.expectedType)}
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-emerald-200 bg-white p-4">
                    <div className="text-sm font-semibold text-emerald-700">ค่าทางเลือกของเฉลย</div>
                    <div className="mt-2 break-all text-base text-slate-900">
                      {selected.expectedValues.length > 0
                        ? selected.expectedValues.join(' | ')
                        : '-'}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-5">
                  <div className="text-lg font-bold text-blue-800">ค่าที่ OCR อ่านได้</div>
                  <div className="mt-3 break-all text-5xl font-extrabold tracking-tight text-blue-900">
                    {formatNullable(displayedReadValue)}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3">
                    <div className="rounded-xl border border-blue-200 bg-white p-4">
                      <div className="text-sm font-semibold text-blue-700">ข้อความดิบจาก OCR</div>
                      <div className="mt-1 whitespace-pre-wrap break-all font-mono text-base text-slate-900">
                        {formatNullable(readableCandidate?.candidate?.rawText ?? null)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-blue-200 bg-white p-4">
                      <div className="text-sm font-semibold text-blue-700">ข้อความที่ normalize แล้ว</div>
                      <div className="mt-1 whitespace-pre-wrap break-all font-mono text-base text-slate-900">
                        {formatNullable(readableCandidate?.candidate?.normalizedValue ?? null)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-5">
                  <div className="text-xl font-bold text-amber-900">การตรวจทานและให้คะแนน</div>

                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <label className="block text-base font-semibold text-slate-700">
                        คะแนนอัตโนมัติ
                      </label>
                      <input
                        readOnly
                        value={selected.autoScore ?? 0}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-3 text-lg font-semibold text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-base font-semibold text-slate-700">
                        คะแนนเต็ม
                      </label>
                      <input
                        readOnly
                        value={inferMaxScore(selected)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-3 text-lg font-semibold text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-base font-semibold text-slate-700">
                        คะแนนสุดท้าย
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={selectedDraft.finalScore}
                        onChange={(e) =>
                          updateDraft(selected.itemNo, { finalScore: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-xl font-bold text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => quickSetScore(selected, 'auto')}
                      className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      ใช้คะแนนอัตโนมัติ
                    </button>
                    <button
                      type="button"
                      onClick={() => quickSetScore(selected, 'full')}
                      className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
                    >
                      ให้เต็มคะแนน
                    </button>
                    <button
                      type="button"
                      onClick={() => quickSetScore(selected, 'half')}
                      className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
                    >
                      ให้ครึ่งคะแนน
                    </button>
                    <button
                      type="button"
                      onClick={() => quickSetScore(selected, 'zero')}
                      className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800"
                    >
                      ให้ศูนย์คะแนน
                    </button>
                  </div>

                  <div className="mt-4">
                    <label className="block text-base font-semibold text-slate-700">
                      Candidate ที่เลือกใช้
                    </label>
                    <select
                      value={selectedDraft.selectedCandidateId}
                      onChange={(e) =>
                        updateDraft(selected.itemNo, { selectedCandidateId: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base font-medium text-slate-900"
                    >
                      <option value="">-- ไม่เลือก candidate --</option>
                      {selected.candidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          #{candidate.rank} | {candidate.normalizedValue ?? candidate.rawText ?? '-'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-4">
                    <label className="block text-base font-semibold text-slate-700">
                      หมายเหตุของผู้ตรวจ
                    </label>
                    <textarea
                      value={selectedDraft.reviewerNotes}
                      onChange={(e) =>
                        updateDraft(selected.itemNo, { reviewerNotes: e.target.value })
                      }
                      rows={5}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base text-slate-900"
                      placeholder="ระบุเหตุผลหรือบันทึกประกอบการให้คะแนน"
                    />
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleSaveItem(selected)}
                      disabled={isPending}
                      className="rounded-xl bg-blue-700 px-5 py-3 text-base font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                    >
                      บันทึกข้อนี้
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-500">คะแนนอัตโนมัติ</div>
                  <div className="mt-2 text-2xl font-bold text-slate-900">
                    {formatNumber(selected.autoScore)}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-500">คะแนนสุดท้ายปัจจุบัน</div>
                  <div className="mt-2 text-2xl font-bold text-slate-900">
                    {formatNumber(selected.finalScore)}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-500">c1</div>
                  <div className="mt-2 text-2xl font-bold text-slate-900">
                    {formatNumber(selected.c1)}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-500">ความเชื่อมั่น OCR (c2)</div>
                  <div className="mt-2 text-2xl font-bold text-slate-900">
                    {formatNumber(selected.c2)}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-500">ค่า m</div>
                  <div className="mt-2 text-2xl font-bold text-slate-900">
                    {formatNumber(selected.m)}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-500">ความเชื่อมั่นสุดท้าย</div>
                  <div className="mt-2 text-2xl font-bold text-slate-900">
                    {formatNumber(selected.finalConfidence ?? selected.confidenceScore)}
                  </div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(460px,0.9fr)]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-2xl font-bold text-slate-900">ภาพหน้ากระดาษพร้อมกรอบ ROI</h3>
                <div className="mt-4">
                  {selected.pageImageUrl ? (
                    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                      <img
                        src={selected.pageImageUrl}
                        alt={`Page ${selected.pageNumber}`}
                        className="h-auto w-full"
                      />
                      {selected.bboxNorm && (
                        <div
                          className="absolute border-4 border-red-500 shadow-[0_0_0_9999px_rgba(239,68,68,0.08)]"
                          style={{
                            left: `${selected.bboxNorm[0] * 100}%`,
                            top: `${selected.bboxNorm[1] * 100}%`,
                            width: `${selected.bboxNorm[2] * 100}%`,
                            height: `${selected.bboxNorm[3] * 100}%`,
                          }}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-base text-slate-500">
                      ไม่พบภาพหน้ากระดาษ
                    </div>
                  )}
                </div>
              </div>

              {showTechnicalDetails && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-2xl font-bold text-slate-900">รายละเอียดเฉลย</h3>
                    {submission.answerKeySourceUrl && (
                      <a
                        href={submission.answerKeySourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-purple-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-800"
                      >
                        เปิด PDF เฉลย
                      </a>
                    )}
                  </div>

                  <div className="mt-4 space-y-2 text-base text-slate-700">
                    <div>
                      หมายเลขข้อที่ resolve ได้:{' '}
                      <span className="font-mono">
                        {selected.answerKeyLookup?.resolvedItemNo ?? '-'}
                      </span>
                    </div>
                    <div>
                      พบเฉลย:{' '}
                      <span className="font-semibold">
                        {selected.answerKeyLookup?.found ? 'พบ' : 'ไม่พบ'}
                      </span>
                    </div>
                  </div>

                  <pre className="mt-4 max-h-[420px] overflow-auto rounded-lg bg-slate-50 p-4 text-sm text-slate-800">
                    {JSON.stringify(selected.rawAnswerKeyItem ?? null, null, 2)}
                  </pre>
                </div>
              )}
            </section>

            {showTechnicalDetails && (
              <>
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-2xl font-bold text-slate-900">รายการ OCR Candidates</h3>
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-3 text-left text-sm font-semibold text-slate-700">อันดับ</th>
                          <th className="px-3 py-3 text-left text-sm font-semibold text-slate-700">สถานะ</th>
                          <th className="px-3 py-3 text-left text-sm font-semibold text-slate-700">ข้อความดิบ</th>
                          <th className="px-3 py-3 text-left text-sm font-semibold text-slate-700">ข้อความที่ normalize แล้ว</th>
                          <th className="px-3 py-3 text-left text-sm font-semibold text-slate-700">ความเชื่อมั่น</th>
                          <th className="px-3 py-3 text-left text-sm font-semibold text-slate-700">เอนจิน</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selected.candidates.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-3 py-6 text-center text-base text-slate-500">
                              ไม่พบ OCR candidate
                            </td>
                          </tr>
                        ) : (
                          selected.candidates.map((candidate) => (
                            <tr
                              key={candidate.id}
                              className={
                                candidate.id === selectedDraft.selectedCandidateId
                                  ? 'bg-blue-100 ring-1 ring-blue-300'
                                  : ''
                              }
                            >
                              <td className="px-3 py-3 text-sm">{candidate.rank}</td>
                              <td className="px-3 py-3 text-sm">
                                {candidate.id === selectedDraft.selectedCandidateId ? (
                                  <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                                    เลือกอยู่
                                  </span>
                                ) : (
                                  '-'
                                )}
                              </td>
                              <td className="px-3 py-3 whitespace-pre-wrap font-mono text-sm text-slate-800">
                                {formatNullable(candidate.rawText)}
                              </td>
                              <td className="px-3 py-3 whitespace-pre-wrap font-mono text-sm text-slate-800">
                                {formatNullable(candidate.normalizedValue)}
                              </td>
                              <td className="px-3 py-3 text-sm">{formatNumber(candidate.confidenceScore)}</td>
                              <td className="px-3 py-3 text-sm">{formatNullable(candidate.engineSource)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-2xl font-bold text-slate-900">ผล OCR ดิบจาก Google แยกตามเวอร์ชัน</h3>
                    <div className="mt-4 space-y-4">
                      {selected.googleRawByVariant.length === 0 ? (
                        <div className="text-base text-slate-500">ไม่มีข้อมูล OCR ดิบจาก Google</div>
                      ) : (
                        selected.googleRawByVariant.map((variant) => (
                          <div key={variant.variant} className="rounded-xl border border-slate-200 p-4">
                            <div className="text-lg font-semibold text-slate-900">{variant.variant}</div>
                            <div className="mt-2 space-y-2">
                              {variant.results.map((result, idx) => (
                                <div key={idx} className="rounded-lg bg-slate-50 p-3">
                                  <div className="text-sm text-slate-500">
                                    ความเชื่อมั่น: {formatNumber(result.confidence)}
                                  </div>
                                  <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
                                    {result.text}
                                  </pre>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-2xl font-bold text-slate-900">ผล OCR ดิบจาก Paddle แยกตามเวอร์ชัน</h3>
                    <div className="mt-4 space-y-4">
                      {selected.paddleRawByVariant.length === 0 ? (
                        <div className="text-base text-slate-500">ไม่มีข้อมูล OCR ดิบจาก Paddle</div>
                      ) : (
                        selected.paddleRawByVariant.map((variant) => (
                          <div key={variant.variant} className="rounded-xl border border-slate-200 p-4">
                            <div className="text-lg font-semibold text-slate-900">{variant.variant}</div>
                            <div className="mt-2 space-y-2">
                              {variant.results.length === 0 ? (
                                <div className="text-sm text-slate-500">
                                  ไม่มีข้อความจาก Paddle สำหรับเวอร์ชันนี้
                                </div>
                              ) : (
                                variant.results.map((result, idx) => (
                                  <div key={idx} className="rounded-lg bg-slate-50 p-3">
                                    <div className="text-sm text-slate-500">
                                      ความเชื่อมั่น: {formatNumber(result.confidence)}
                                    </div>
                                    <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
                                      {result.text}
                                    </pre>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}