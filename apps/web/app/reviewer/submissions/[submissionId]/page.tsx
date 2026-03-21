// apps/web/app/reviewer/submissions/[submissionId]/page.tsx
'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import RoiOverlayViewer from './RoiOverlayViewer'

type ResultRow = {
  id: string
  submission_id: string
  item_no: string
  extracted_raw: string | null
  extracted_normalized: string | null
  ai_confidence: number | null
  auto_score: number | null
  final_score: number | null
  is_overridden: boolean | null
  reviewer_notes: string | null
  page_number: number | null
  roi_id: string | null
  layout_spec_version: number | null
  selected_candidate_id: string | null
  is_human_override: boolean | null
  manual_reason: string | null
  confidence_score: number | null
  is_blank: boolean | null
  evidence_map?: {
    fusion?: {
      agreement?: boolean
      disagreement_reason?: string | null
      needs_review_signal?: boolean
      candidate_count?: number
      candidates?: Array<{
        engine_source?: string | null
        raw_text?: string | null
        normalized_value?: string | null
        confidence_score?: number | null
      }>
    }
    expected_value?: string | null
  } | null
}

type CandidateRow = {
  id: string
  submission_id: string
  roi_id: string
  rank: number
  raw_text: string | null
  normalized_value: string | null
  confidence_score: number | null
  engine_source: string | null
  page_number: number | null
}

export default function ReviewerSubmissionPage() {
  const params = useParams<{ submissionId: string }>()
  const submissionId = params.submissionId

  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [selectedResultId, setSelectedResultId] = useState<string>('')
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('')
  const [overrideValue, setOverrideValue] = useState('')
  const [overrideRaw, setOverrideRaw] = useState('')
  const [manualReason, setManualReason] = useState('')
  const [reviewerNotes, setReviewerNotes] = useState('')
  const [finalScore, setFinalScore] = useState('')

  async function loadData() {
    const res = await fetch(`/api/reviewer/submissions/${submissionId}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })

    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to load review workspace')

    setData(json)

    const firstResult = (json.grading_results ?? [])[0]
    if (firstResult) {
      setSelectedResultId(firstResult.id)
      setReviewerNotes(firstResult.reviewer_notes ?? '')
      setFinalScore(String(firstResult.final_score ?? firstResult.auto_score ?? 0))
      setOverrideValue(firstResult.extracted_normalized ?? '')
      setOverrideRaw(firstResult.extracted_raw ?? '')
      setManualReason(firstResult.manual_reason ?? '')
    }
  }

  useEffect(() => {
    const run = async () => {
      try {
        await loadData()
      } catch (e: any) {
        setStatus({ type: 'error', text: e.message || 'โหลด review workspace ไม่สำเร็จ' })
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [submissionId])

  const results: ResultRow[] = data?.grading_results ?? []
  const candidates: CandidateRow[] = data?.grading_candidates ?? []
  const files = data?.files ?? []

  const selectedResult = useMemo(
    () => results.find((r) => r.id === selectedResultId) ?? null,
    [results, selectedResultId]
  )

  const selectedCandidates = useMemo(() => {
    if (!selectedResult?.roi_id) return []
    return candidates.filter((c) => c.roi_id === selectedResult.roi_id)
  }, [candidates, selectedResult])

  useEffect(() => {
    if (!selectedResult) return

    setReviewerNotes(selectedResult.reviewer_notes ?? '')
    setFinalScore(String(selectedResult.final_score ?? selectedResult.auto_score ?? 0))
    setOverrideValue(selectedResult.extracted_normalized ?? '')
    setOverrideRaw(selectedResult.extracted_raw ?? '')
    setManualReason(selectedResult.manual_reason ?? '')
    setSelectedCandidateId(selectedResult.selected_candidate_id ?? '')
  }, [selectedResultId, selectedResult])

  async function doConfirm() {
    if (!selectedResultId) {
      setStatus({ type: 'error', text: 'กรุณาเลือก result ก่อน' })
      return
    }

    setBusyAction('confirm')
    setStatus(null)

    try {
      const res = await fetch(`/api/reviewer/submissions/${submissionId}/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          action: 'confirm',
          result_id: selectedResultId,
          selected_candidate_id: selectedCandidateId || null,
          final_score: Number(finalScore || '0'),
          reviewer_notes: reviewerNotes || null,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Confirm failed')

      setStatus({ type: 'success', text: 'Confirm สำเร็จ' })
      await loadData()
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'Confirm ไม่สำเร็จ' })
    } finally {
      setBusyAction(null)
    }
  }

  async function doOverride() {
    if (!selectedResultId) {
      setStatus({ type: 'error', text: 'กรุณาเลือก result ก่อน' })
      return
    }

    if (!manualReason.trim()) {
      setStatus({ type: 'error', text: 'กรุณาระบุ manual reason' })
      return
    }

    setBusyAction('override')
    setStatus(null)

    try {
      const res = await fetch(`/api/reviewer/submissions/${submissionId}/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          action: 'override',
          result_id: selectedResultId,
          override_value: overrideValue || null,
          override_raw: overrideRaw || null,
          final_score: Number(finalScore || '0'),
          reviewer_notes: reviewerNotes || null,
          manual_reason: manualReason.trim(),
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Override failed')

      setStatus({ type: 'success', text: 'Override สำเร็จ' })
      await loadData()
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'Override ไม่สำเร็จ' })
    } finally {
      setBusyAction(null)
    }
  }

  async function finalizeReview() {
    setBusyAction('finalize')
    setStatus(null)

    try {
      const res = await fetch(`/api/reviewer/submissions/${submissionId}/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          action: 'finalize_review',
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Finalize failed')

      setStatus({ type: 'success', text: 'Finalize review สำเร็จ' })
      await loadData()
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'Finalize ไม่สำเร็จ' })
    } finally {
      setBusyAction(null)
    }
  }

  if (loading) {
    return <div className="p-8">กำลังโหลด review workspace...</div>
  }

  const submission = data?.submission
  const assignment = submission?.assignments
  const section = submission?.assignments?.sections
  const student = data?.student

  return (
    <div className="space-y-8 max-w-[1500px] mx-auto">
      <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Review Workspace</h1>
          <p className="text-slate-600 mt-2 text-lg">
            {assignment?.title ?? '-'}
          </p>
          <div className="text-sm text-slate-500 mt-2">
            Submission ID: {submissionId}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/reviewer/dashboard"
            className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
          >
            กลับ Dashboard
          </Link>
        </div>
      </header>

      {status && (
        <div
          className={`rounded-xl border p-4 text-sm font-semibold ${
            status.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {status.text}
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <InfoCard title="Submission Status" value={submission?.status ?? '-'} />
        <InfoCard title="Current Stage" value={submission?.current_stage ?? '-'} />
        <InfoCard title="Total Score" value={String(submission?.total_score ?? 0)} />
        <InfoCard title="Fraud Flag" value={submission?.fraud_flag ? 'TRUE' : 'FALSE'} />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <div className="font-bold text-slate-900 text-lg">Submission Info</div>
          <InfoRow label="Assignment" value={assignment?.title ?? '-'} />
          <InfoRow
            label="Section"
            value={
              section?.course_code && section?.section_number != null
                ? `${section.course_code} - Sec ${section.section_number} (${section.term ?? '-'})`
                : '-'
            }
          />
          <InfoRow label="Type" value={assignment?.assignment_type ?? '-'} />
          <InfoRow label="Week" value={String(assignment?.week_number ?? '-')} />
          <InfoRow label="Student" value={student?.full_name ?? '-'} />
          <InfoRow label="Student ID" value={student?.student_id_number ?? '-'} />
          <InfoRow label="Email" value={student?.email ?? '-'} />
          <InfoRow label="Submitted At" value={formatDateTime(submission?.submitted_at)} />
          <InfoRow
            label="Paper Student ID"
            value={submission?.extracted_paper_student_id ?? '-'}
          />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <div className="font-bold text-slate-900 text-lg">Claim Info</div>
          <InfoRow label="Reviewer" value={data?.reviewer?.full_name ?? '-'} />
          <InfoRow label="Role" value={data?.reviewer?.role ?? '-'} />
          <InfoRow
            label="Claimed At"
            value={formatDateTime(data?.claim?.claimed_at)}
          />
          <InfoRow
            label="Expires At"
            value={formatDateTime(data?.claim?.expires_at)}
          />
          <div className="pt-2">
            <button
              type="button"
              disabled={busyAction === 'finalize'}
              onClick={finalizeReview}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:bg-emerald-300"
            >
              {busyAction === 'finalize' ? 'กำลังปิดงาน...' : 'Finalize Review'}
            </button>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50">
          <div className="font-bold text-slate-900 text-lg">Submitted Files</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200 text-slate-500">
              <tr>
                <th className="text-left p-4 font-medium">Page</th>
                <th className="text-left p-4 font-medium">Uploaded At</th>
                <th className="text-right p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {files.map((file: any) => (
                <tr key={file.id} className="hover:bg-slate-50">
                  <td className="p-4 font-semibold text-slate-900">{file.page_number}</td>
                  <td className="p-4 text-slate-600">{formatDateTime(file.created_at)}</td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <a
                        href={`/api/reviewer/submissions/${submissionId}/files/${file.id}/url?mode=preview`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                      >
                        Preview
                      </a>
                      <a
                        href={`/api/reviewer/submissions/${submissionId}/files/${file.id}/url?mode=download`}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                      >
                        Download
                      </a>
                    </div>
                  </td>
                </tr>
              ))}

              {files.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-10 text-center text-slate-500">
                    ยังไม่มีไฟล์คำตอบ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {files.length > 0 && data?.layout_spec && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <RoiOverlayViewer
            pdfUrl={`/api/reviewer/submissions/${submissionId}/files/${files[0].id}/url?mode=preview`}
            layoutData={data.layout_spec.layout_data}
            selectedRoiId={selectedResult?.roi_id ?? null}
            onSelectRoi={(roiId) => {
              const found = results.find((r) => r.roi_id === roiId)
              if (found) setSelectedResultId(found.id)
            }}
          />
        </section>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_1.2fr] gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 bg-slate-50">
            <div className="font-bold text-slate-900 text-lg">Grading Results</div>
          </div>

          <div className="max-h-[700px] overflow-auto divide-y divide-slate-100">
            {results.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => setSelectedResultId(result.id)}
                className={`w-full text-left p-4 hover:bg-slate-50 ${
                  selectedResultId === result.id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-bold text-slate-900">
                    Item {result.item_no}
                  </div>
                  <div className="text-sm text-slate-500">
                    Page {result.page_number ?? '-'}
                  </div>
                </div>

                <div className="mt-2 text-sm text-slate-600">
                  ROI: {result.roi_id ?? '-'}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Normalized: {result.extracted_normalized ?? '-'}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Auto Score: {result.auto_score ?? 0} • Final Score: {result.final_score ?? 0}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Override: {result.is_human_override ? 'YES' : 'NO'}
                </div>
              </button>
            ))}

            {results.length === 0 && (
              <div className="p-10 text-center text-slate-500">
                ยังไม่มี grading results
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5">
          <div className="font-bold text-slate-900 text-lg">Review Panel</div>

          {selectedResult ? (
            <>
              <InfoRow label="Item No" value={selectedResult.item_no} />
              <InfoRow label="ROI ID" value={selectedResult.roi_id ?? '-'} />
              <InfoRow label="Extracted Raw" value={selectedResult.extracted_raw ?? '-'} />
              <InfoRow
                label="Extracted Normalized"
                value={selectedResult.extracted_normalized ?? '-'}
              />
              <InfoRow label="AI Confidence" value={String(selectedResult.ai_confidence ?? '-')} />
              <InfoRow label="Auto Score" value={String(selectedResult.auto_score ?? 0)} />
              <InfoRow label="Final Score" value={String(selectedResult.final_score ?? 0)} />

              {selectedResult?.evidence_map?.fusion && (
                <div className="border-t border-slate-200 pt-5 space-y-2">
                  <div className="font-bold text-slate-900">Fusion Diagnostics</div>
                  <div className="text-sm text-slate-600">
                    agreement: {selectedResult.evidence_map.fusion.agreement ? 'true' : 'false'}
                  </div>
                  <div className="text-sm text-slate-600">
                    reason: {selectedResult.evidence_map.fusion.disagreement_reason ?? '-'}
                  </div>
                  <div className="text-sm text-slate-600">
                    needs_review_signal:{' '}
                    {selectedResult.evidence_map.fusion.needs_review_signal ? 'true' : 'false'}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <label className="block">
                  <div className="text-sm font-bold text-slate-700 mb-2">
                    Candidate
                  </div>
                  <select
                    value={selectedCandidateId}
                    onChange={(e) => setSelectedCandidateId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 bg-white"
                  >
                    <option value="">-- keep current --</option>
                    {selectedCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        rank {candidate.rank} • {candidate.normalized_value ?? candidate.raw_text ?? '-'} • conf {candidate.confidence_score ?? '-'}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <div className="text-sm font-bold text-slate-700 mb-2">
                    Final Score
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={finalScore}
                    onChange={(e) => setFinalScore(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-4 py-3"
                  />
                </label>

                <label className="block">
                  <div className="text-sm font-bold text-slate-700 mb-2">
                    Reviewer Notes
                  </div>
                  <textarea
                    value={reviewerNotes}
                    onChange={(e) => setReviewerNotes(e.target.value)}
                    className="w-full min-h-[100px] rounded-lg border border-slate-300 px-4 py-3"
                  />
                </label>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busyAction === 'confirm'}
                    onClick={doConfirm}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:bg-blue-300"
                  >
                    {busyAction === 'confirm' ? 'กำลังบันทึก...' : 'Confirm'}
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-5 space-y-3">
                <div className="font-bold text-slate-900">Manual Override</div>

                <label className="block">
                  <div className="text-sm font-bold text-slate-700 mb-2">
                    Override Raw
                  </div>
                  <input
                    value={overrideRaw}
                    onChange={(e) => setOverrideRaw(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-4 py-3"
                  />
                </label>

                <label className="block">
                  <div className="text-sm font-bold text-slate-700 mb-2">
                    Override Normalized
                  </div>
                  <input
                    value={overrideValue}
                    onChange={(e) => setOverrideValue(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-4 py-3"
                  />
                </label>

                <label className="block">
                  <div className="text-sm font-bold text-slate-700 mb-2">
                    Manual Reason
                  </div>
                  <textarea
                    value={manualReason}
                    onChange={(e) => setManualReason(e.target.value)}
                    className="w-full min-h-[100px] rounded-lg border border-slate-300 px-4 py-3"
                  />
                </label>

                <button
                  type="button"
                  disabled={busyAction === 'override'}
                  onClick={doOverride}
                  className="px-4 py-2 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700 disabled:bg-amber-300"
                >
                  {busyAction === 'override' ? 'กำลัง override...' : 'Override'}
                </button>
              </div>

              <div className="border-t border-slate-200 pt-5">
                <div className="font-bold text-slate-900 mb-3">Candidates</div>
                <div className="space-y-2">
                  {selectedCandidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className="rounded-lg border border-slate-200 p-3 text-sm"
                    >
                      <div className="font-semibold text-slate-900">
                        rank {candidate.rank}
                      </div>
                      <div className="text-slate-600">
                        raw: {candidate.raw_text ?? '-'}
                      </div>
                      <div className="text-slate-600">
                        normalized: {candidate.normalized_value ?? '-'}
                      </div>
                      <div className="text-slate-600">
                        confidence: {candidate.confidence_score ?? '-'}
                      </div>
                    </div>
                  ))}

                  {selectedCandidates.length === 0 && (
                    <div className="text-sm text-slate-500">
                      ไม่มี candidates สำหรับ ROI นี้
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-slate-500">กรุณาเลือก grading result ด้านซ้าย</div>
          )}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50">
          <div className="font-bold text-slate-900 text-lg">Recent Grading Events</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200 text-slate-500">
              <tr>
                <th className="text-left p-4 font-medium">Time</th>
                <th className="text-left p-4 font-medium">Action</th>
                <th className="text-left p-4 font-medium">ROI</th>
                <th className="text-left p-4 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.grading_events ?? []).map((event: any) => (
                <tr key={event.id} className="hover:bg-slate-50">
                  <td className="p-4 text-slate-600">{formatDateTime(event.created_at)}</td>
                  <td className="p-4 font-semibold text-slate-900">{event.action_type}</td>
                  <td className="p-4 text-slate-600">{event.roi_id ?? '-'}</td>
                  <td className="p-4 text-slate-600">{event.manual_reason ?? '-'}</td>
                </tr>
              ))}

              {(data?.grading_events ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="p-10 text-center text-slate-500">
                    ยังไม่มี grading events
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="text-sm text-slate-500 font-medium">{title}</div>
      <div className="text-xl font-extrabold text-slate-900 mt-2">{value}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-100 p-3">
      <div className="text-slate-500 font-medium">{label}</div>
      <div className="text-slate-900 font-semibold text-right">{value}</div>
    </div>
  )
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString('th-TH')
  } catch {
    return value
  }
}