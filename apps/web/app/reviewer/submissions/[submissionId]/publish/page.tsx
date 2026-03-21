//apps/web/app/reviewer/submissions/[submissionId]/publish/page.tsx//
'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function ReviewerPublishPage() {
  const params = useParams<{ submissionId: string }>()
  const submissionId = params.submissionId

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [data, setData] = useState<any>(null)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function loadData() {
    const res = await fetch(`/api/reviewer/submissions/${submissionId}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })

    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to load submission')

    setData(json)
  }

  useEffect(() => {
    const run = async () => {
      try {
        await loadData()
      } catch (e: any) {
        setStatus({ type: 'error', text: e.message || 'โหลดข้อมูลไม่สำเร็จ' })
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [submissionId])

  async function publishNow() {
    setBusy(true)
    setStatus(null)

    try {
      const res = await fetch(`/api/reviewer/submissions/${submissionId}/publish`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Publish failed')

      setStatus({ type: 'success', text: 'เผยแพร่ผลให้ student สำเร็จ' })
      await loadData()
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'Publish ไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="p-8">กำลังโหลด publish page...</div>
  }

  const submission = data?.submission
  const assignment = submission?.assignments
  const section = assignment?.sections
  const student = data?.student

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Publish Result</h1>
          <p className="text-slate-600 mt-2 text-lg">{assignment?.title ?? '-'}</p>
          <div className="text-sm text-slate-500 mt-2">Submission ID: {submissionId}</div>
        </div>

        <div className="flex gap-3">
          <Link
            href={`/reviewer/submissions/${submissionId}`}
            className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
          >
            กลับ Review Workspace
          </Link>
        </div>
      </header>

      {status && (
        <div className={`rounded-xl border p-4 text-sm font-semibold ${
          status.type === 'success'
            ? 'border-green-200 bg-green-50 text-green-700'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {status.text}
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="Student" value={student?.full_name ?? '-'} />
        <Card title="Student ID" value={student?.student_id_number ?? '-'} />
        <Card title="Current Status" value={submission?.status ?? '-'} />
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <Row
          label="Section"
          value={
            section?.course_code && section?.section_number != null
              ? `${section.course_code} - Sec ${section.section_number} (${section.term ?? '-'})`
              : '-'
          }
        />
        <Row label="Total Score" value={String(submission?.total_score ?? 0)} />
        <Row label="Current Stage" value={submission?.current_stage ?? '-'} />
        <Row label="Submitted At" value={formatDateTime(submission?.submitted_at)} />
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <button
          type="button"
          disabled={busy || submission?.status === 'published'}
          onClick={publishNow}
          className="w-full px-4 py-3 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:bg-emerald-300"
        >
          {busy ? 'กำลัง publish...' : submission?.status === 'published' ? 'Published แล้ว' : 'Publish to Student'}
        </button>
      </section>
    </div>
  )
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="text-sm text-slate-500 font-medium">{title}</div>
      <div className="text-xl font-extrabold text-slate-900 mt-2">{value}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
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