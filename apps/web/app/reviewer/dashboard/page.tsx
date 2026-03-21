//apps/web/app/reviewer/dashboard/page.tsx
'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type DashboardItem = {
  id: string
  assignment_id: string
  student_id: string
  status: string | null
  total_score: number | null
  max_score: number | null
  submitted_at: string | null
  updated_at: string | null
  current_stage: string | null
  fraud_flag: boolean | null
  extracted_paper_student_id: string | null
  assignment: {
    id: string | null
    title: string | null
    assignment_type: string | null
    week_number: number | null
    class_date: string | null
    due_at: string | null
    close_at: string | null
  }
  section: {
    id: string | null
    course_code: string | null
    section_number: number | null
    term: string | null
  }
  claim: null | {
    id: string
    reviewer_id: string | null
    reviewer_user_id: string | null
    claimed_at: string | null
    expires_at: string | null
    expired: boolean
    is_mine: boolean
  }
}

export default function ReviewerDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [busySubmissionId, setBusySubmissionId] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [showOnlyNeedsReview, setShowOnlyNeedsReview] = useState(true)
  const [showOnlyMine, setShowOnlyMine] = useState(false)
  const [search, setSearch] = useState('')

  async function loadData() {
    const res = await fetch('/api/reviewer/dashboard', {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })

    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to load reviewer dashboard')

    setData(json)
  }

  useEffect(() => {
    const run = async () => {
      try {
        await loadData()
      } catch (e: any) {
        setStatus({ type: 'error', text: e.message || 'โหลด reviewer dashboard ไม่สำเร็จ' })
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  const items: DashboardItem[] = data?.items ?? []

  const filteredItems = useMemo(() => {
    let result = [...items]

    if (showOnlyNeedsReview) {
      result = result.filter(
        (x) => x.status === 'needs_review' || x.current_stage === 'review_required'
      )
    }

    if (showOnlyMine) {
      result = result.filter((x) => x.claim?.is_mine === true)
    }

    const q = search.trim().toLowerCase()
    if (q) {
      result = result.filter((x) => {
        const haystack = [
          x.assignment?.title,
          x.assignment?.assignment_type,
          x.assignment?.week_number != null ? String(x.assignment.week_number) : '',
          x.section?.course_code,
          x.section?.section_number != null ? String(x.section.section_number) : '',
          x.section?.term,
          x.extracted_paper_student_id,
          x.id,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return haystack.includes(q)
      })
    }

    return result
  }, [items, showOnlyNeedsReview, showOnlyMine, search])

  async function claimSubmission(submissionId: string) {
    setBusySubmissionId(submissionId)
    setStatus(null)

    try {
      const res = await fetch(`/api/reviewer/submissions/${submissionId}/claim`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Claim failed')

      setStatus({ type: 'success', text: 'Claim submission สำเร็จ' })
      await loadData()
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'Claim ไม่สำเร็จ' })
    } finally {
      setBusySubmissionId(null)
    }
  }

  async function releaseSubmission(submissionId: string) {
    setBusySubmissionId(submissionId)
    setStatus(null)

    try {
      const res = await fetch(`/api/reviewer/submissions/${submissionId}/release`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Release failed')

      setStatus({ type: 'success', text: 'Release submission สำเร็จ' })
      await loadData()
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'Release ไม่สำเร็จ' })
    } finally {
      setBusySubmissionId(null)
    }
  }

  if (loading) {
    return <div className="p-8">กำลังโหลด reviewer dashboard...</div>
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Reviewer Dashboard</h1>
          <p className="text-slate-600 mt-2 text-lg">
            คิวงานสำหรับตรวจคำตอบและยืนยันผลการอ่านของระบบ
          </p>
          <div className="text-sm text-slate-500 mt-2">
            {data?.profile?.full_name ?? 'Reviewer'} • {data?.profile?.role ?? '-'}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/reviewer"
            className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
          >
            Reviewer Home
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

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Total Queue" value={String(data?.stats?.total_queue ?? 0)} />
        <StatCard
          title="Needs Review"
          value={String(data?.stats?.needs_review ?? 0)}
          valueClassName="text-red-600"
        />
        <StatCard
          title="My Active Claims"
          value={String(data?.stats?.my_claims_active ?? 0)}
          valueClassName="text-blue-600"
        />
        <StatCard
          title="Expiring Soon"
          value={String(data?.stats?.expiring_soon ?? 0)}
          valueClassName="text-amber-600"
        />
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="font-bold text-slate-900 text-lg mb-4">Filters</div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-4 items-end">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Search</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาจาก assignment / course / submission id"
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
            />
          </div>

          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-3">
            <input
              type="checkbox"
              checked={showOnlyNeedsReview}
              onChange={(e) => setShowOnlyNeedsReview(e.target.checked)}
            />
            <span className="text-sm font-medium text-slate-700">Needs review only</span>
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-3">
            <input
              type="checkbox"
              checked={showOnlyMine}
              onChange={(e) => setShowOnlyMine(e.target.checked)}
            />
            <span className="text-sm font-medium text-slate-700">My claims only</span>
          </label>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50">
          <div className="font-bold text-slate-900 text-lg">Review Queue</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200 text-slate-500">
              <tr>
                <th className="text-left p-4 font-medium">Assignment</th>
                <th className="text-left p-4 font-medium">Section</th>
                <th className="text-left p-4 font-medium">Submitted</th>
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-left p-4 font-medium">Claim</th>
                <th className="text-right p-4 font-medium">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredItems.map((item) => {
                const claimBusy = busySubmissionId === item.id
                const claimText = item.claim
                  ? item.claim.is_mine
                    ? `Claimed by me until ${formatDateTime(item.claim.expires_at)}`
                    : item.claim.expired
                    ? 'Expired claim'
                    : `Claimed until ${formatDateTime(item.claim.expires_at)}`
                  : 'Unclaimed'

                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="p-4">
                      <div className="font-bold text-slate-900">
                        {item.assignment?.title ?? '-'}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Submission ID: {item.id}</div>
                      <div className="text-xs text-slate-500">
                        Type: {item.assignment?.assignment_type ?? '-'} • Week:{' '}
                        {item.assignment?.week_number ?? '-'}
                      </div>
                    </td>

                    <td className="p-4 text-slate-600">
                      {item.section?.course_code && item.section?.section_number != null
                        ? `${item.section.course_code} - Sec ${item.section.section_number}`
                        : '-'}
                      <div className="text-xs text-slate-500 mt-1">{item.section?.term ?? '-'}</div>
                    </td>

                    <td className="p-4 text-slate-600">
                      <div>{formatDateTime(item.submitted_at)}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        Stage: {item.current_stage ?? '-'}
                      </div>
                    </td>

                    <td className="p-4">
                      <div className="flex flex-col gap-2">
                        <Badge
                          text={item.status ?? '-'}
                          tone={
                            item.status === 'needs_review' ? 'danger' : 'neutral'
                          }
                        />
                        {item.fraud_flag ? (
                          <Badge text="fraud_flag = TRUE" tone="danger" />
                        ) : null}
                        {item.extracted_paper_student_id ? (
                          <Badge
                            text={`paper id: ${item.extracted_paper_student_id}`}
                            tone="neutral"
                          />
                        ) : null}
                      </div>
                    </td>

                    <td className="p-4 text-slate-600">
                      <div>{claimText}</div>
                    </td>

                    <td className="p-4">
                      <div className="flex justify-end gap-2 flex-wrap">
                        {item.claim?.is_mine ? (
                          <button
                            type="button"
                            disabled={claimBusy}
                            onClick={() => releaseSubmission(item.id)}
                            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:bg-amber-300"
                          >
                            {claimBusy ? 'กำลังทำงาน...' : 'Release'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={claimBusy || (!!item.claim && !item.claim.expired)}
                            onClick={() => claimSubmission(item.id)}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:bg-blue-300"
                          >
                            {claimBusy ? 'กำลังทำงาน...' : 'Claim'}
                          </button>
                        )}

                        <Link
                          href={`/reviewer/submissions/${item.id}`}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                        >
                          Open Review
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-slate-500">
                    ไม่พบรายการในคิวตรวจ
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

function StatCard({
  title,
  value,
  valueClassName = 'text-slate-900',
}: {
  title: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="text-sm text-slate-500 font-medium">{title}</div>
      <div className={`text-3xl font-extrabold mt-2 ${valueClassName}`}>{value}</div>
    </div>
  )
}

function Badge({
  text,
  tone,
}: {
  text: string
  tone: 'neutral' | 'danger'
}) {
  const cls =
    tone === 'danger'
      ? 'bg-red-100 text-red-700'
      : 'bg-slate-100 text-slate-700'

  return (
    <span className={`inline-flex w-fit px-2 py-1 rounded-full text-xs font-semibold ${cls}`}>
      {text}
    </span>
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