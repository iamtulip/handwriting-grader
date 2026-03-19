'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

export default function InstructorAssignmentDetailPage() {
  const params = useParams<{ assignmentId: string }>()
  const assignmentId = params.assignmentId

  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  const [data, setData] = useState<any>(null)
  const [status, setStatus] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  async function loadData() {
    const res = await fetch(`/api/instructor/assignments/${assignmentId}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })

    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to load assignment detail')
    setData(json)
  }

  useEffect(() => {
    const run = async () => {
      try {
        await loadData()
      } catch (e: any) {
        setStatus({
          type: 'error',
          text: e.message || 'โหลด assignment ไม่สำเร็จ',
        })
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [assignmentId])

  async function onUploadFile(file: File) {
    setUploading(true)
    setStatus(null)

    try {
      const form = new FormData()
      form.append('file', file)

      const res = await fetch(
        `/api/instructor/assignments/${assignmentId}/source-pdf`,
        {
          method: 'POST',
          body: form,
        }
      )

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Upload failed')

      setStatus({ type: 'success', text: 'อัปโหลด PDF สำเร็จ' })
      await loadData()
    } catch (e: any) {
      setStatus({
        type: 'error',
        text: e.message || 'อัปโหลด PDF ไม่สำเร็จ',
      })
    } finally {
      setUploading(false)
    }
  }

  async function removePdf() {
    setRemoving(true)
    setStatus(null)

    try {
      const res = await fetch(
        `/api/instructor/assignments/${assignmentId}/source-pdf`,
        {
          method: 'DELETE',
          headers: { Accept: 'application/json' },
        }
      )

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Delete failed')

      setStatus({ type: 'success', text: 'ลบ source PDF สำเร็จ' })
      await loadData()
    } catch (e: any) {
      setStatus({
        type: 'error',
        text: e.message || 'ลบ source PDF ไม่สำเร็จ',
      })
    } finally {
      setRemoving(false)
    }
  }

  async function generateAnswerKey() {
    setGenerating(true)
    setStatus(null)

    try {
      const res = await fetch(
        `/api/instructor/assignments/${assignmentId}/generate-answer-key`,
        {
          method: 'POST',
          headers: { Accept: 'application/json' },
        }
      )

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Generate failed')

      setStatus({
        type: 'success',
        text: `สร้าง AI answer key scaffold สำเร็จ (${json.preview?.item_count ?? 0} items)`,
      })
      await loadData()
    } catch (e: any) {
      setStatus({
        type: 'error',
        text: e.message || 'สร้าง answer key ไม่สำเร็จ',
      })
    } finally {
      setGenerating(false)
    }
  }

  async function approveAnswerKey() {
    setApproving(true)
    setStatus(null)

    try {
      const res = await fetch(
        `/api/instructor/assignments/${assignmentId}/answer-key`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ action: 'approve' }),
        }
      )

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Approve failed')

      setStatus({ type: 'success', text: 'อนุมัติ answer key สำเร็จ' })
      await loadData()
    } catch (e: any) {
      setStatus({
        type: 'error',
        text: e.message || 'อนุมัติ answer key ไม่สำเร็จ',
      })
    } finally {
      setApproving(false)
    }
  }

  async function rejectAnswerKey() {
    setRejecting(true)
    setStatus(null)

    try {
      const res = await fetch(
        `/api/instructor/assignments/${assignmentId}/answer-key`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            action: 'reject',
            generation_notes: 'Rejected by instructor/reviewer for manual revision',
          }),
        }
      )

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Reject failed')

      setStatus({
        type: 'success',
        text: 'เปลี่ยนสถานะ answer key เป็น rejected แล้ว',
      })
      await loadData()
    } catch (e: any) {
      setStatus({
        type: 'error',
        text: e.message || 'reject answer key ไม่สำเร็จ',
      })
    } finally {
      setRejecting(false)
    }
  }

  if (loading) {
    return <div className="p-8">กำลังโหลด Assignment Workspace...</div>
  }

  if (!data) {
    return <div className="p-8 text-red-600">ไม่พบข้อมูล assignment</div>
  }

  const canGenerate = data.sourcePdf?.exists && data.layoutSpec

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">
            {data.assignment.title}
          </h1>
          <p className="text-slate-600 mt-2 text-lg">
            {data.section
              ? `${data.section.course_code} - Sec ${data.section.section_number} (${data.section.term})`
              : 'Unknown section'}
          </p>
          <div className="text-sm text-slate-500 mt-3">
            Assignment ID: {data.assignment.id}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/instructor/assignments"
            className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
          >
            กลับรายการงาน
          </Link>

          <Link
            href={`/instructor/assignments/${data.assignment.id}/layout`}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700"
          >
            เปิด Layout Editor
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
        <StatCard
          title="Submissions"
          value={String(data.summary.submission_count ?? 0)}
        />
        <StatCard
          title="Needs Review"
          value={String(data.summary.needs_review_count ?? 0)}
          valueClassName="text-red-600"
        />
        <StatCard
          title="Graded"
          value={String(data.summary.graded_count ?? 0)}
          valueClassName="text-emerald-600"
        />
        <StatCard
          title="Avg Score"
          value={Number(data.summary.avg_total_score ?? 0).toFixed(2)}
          valueClassName="text-blue-600"
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="font-bold text-slate-800 text-lg mb-4">
            Assignment Metadata
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <Row label="Title" value={data.assignment.title ?? '-'} />
            <Row label="Type" value={data.assignment.assignment_type ?? '-'} />
            <Row
              label="Week Number"
              value={String(data.assignment.week_number ?? '-')}
            />
            <Row label="Class Date" value={data.assignment.class_date ?? '-'} />
            <Row label="Open At" value={formatDateTime(data.assignment.open_at)} />
            <Row label="Due At" value={formatDateTime(data.assignment.due_at)} />
            <Row
              label="Close At"
              value={formatDateTime(data.assignment.close_at)}
            />
            <Row
              label="End of Friday At"
              value={formatDateTime(data.assignment.end_of_friday_at)}
            />
          </div>

          <div className="mt-6 border-t border-slate-200 pt-6">
            <div className="font-bold text-slate-800 mb-2">Description</div>
            <div className="text-slate-600 whitespace-pre-wrap">
              {data.assignment.description || '-'}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <WorkspaceCard
            title="Source PDF"
            status={data.sourcePdf?.exists ? 'uploaded' : 'missing'}
          >
            <div className="space-y-4">
              {data.sourcePdf?.exists ? (
                <>
                  <div className="space-y-2 text-sm text-slate-600">
                    <div>
                      Filename:{' '}
                      <span className="font-semibold text-slate-900">
                        {data.sourcePdf.original_filename}
                      </span>
                    </div>
                    <div>
                      Size:{' '}
                      <span className="font-semibold text-slate-900">
                        {formatFileSize(data.sourcePdf.file_size_bytes)}
                      </span>
                    </div>
                    <div>
                      Uploaded At:{' '}
                      <span className="font-semibold text-slate-900">
                        {formatDateTime(data.sourcePdf.uploaded_at)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={`/instructor/assignments/${assignmentId}/source-pdf`}
                      className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                    >
                      Preview PDF
                    </Link>

                    <a
                      href={`/api/instructor/assignments/${assignmentId}/source-pdf/url?mode=download`}
                      className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                    >
                      Download PDF
                    </a>

                    <label className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 cursor-pointer">
                      {uploading ? 'กำลังแทนที่...' : 'Replace PDF'}
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        disabled={uploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) onUploadFile(file)
                          e.currentTarget.value = ''
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      disabled={removing}
                      onClick={removePdf}
                      className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:bg-red-300"
                    >
                      {removing ? 'กำลังลบ...' : 'Remove PDF'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="text-sm text-slate-600">
                    ยังไม่มีไฟล์ PDF ต้นฉบับของ assignment นี้
                  </div>

                  <label className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 cursor-pointer">
                    {uploading ? 'กำลังอัปโหลด...' : 'Upload PDF'}
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) onUploadFile(file)
                        e.currentTarget.value = ''
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          </WorkspaceCard>

          <WorkspaceCard
            title="Layout Spec"
            status={
              data.layoutSpec
                ? `${data.layoutSpec.layout_status} • v${data.layoutSpec.version}`
                : 'not_created'
            }
            actions={
              <Link
                href={`/instructor/assignments/${data.assignment.id}/layout`}
                className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
              >
                จัดการ Layout
              </Link>
            }
          >
            <div className="space-y-2 text-sm text-slate-600">
              <div>Spec Name: {data.layoutSpec?.spec_name ?? '-'}</div>
              <div>Page Count: {data.layoutSpec?.page_count ?? '-'}</div>
              <div>Schema Version: {data.layoutSpec?.schema_version ?? '-'}</div>
              <div>Approved At: {formatDateTime(data.layoutSpec?.approved_at)}</div>
            </div>
          </WorkspaceCard>

          <WorkspaceCard
            title="Answer Key"
            status={data.answerKey?.approval_status ?? 'draft'}
            actions={
              <Link
                href={`/instructor/assignments/${assignmentId}/answer-key`}
                className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
              >
                Edit JSON
              </Link>
            }
          >
            <div className="space-y-3 text-sm text-slate-600">
              <div>Exists: {data.answerKey?.exists ? 'YES' : 'NO'}</div>
              <div>Items: {data.answerKey?.item_count ?? 0}</div>
              <div>
                Generation Status: {data.answerKey?.generation_status ?? 'not_started'}
              </div>
              <div>
                Generated by AI: {data.answerKey?.generated_by_ai ? 'YES' : 'NO'}
              </div>
              <div>AI Model: {data.answerKey?.ai_model ?? '-'}</div>
              <div>Approval Status: {data.answerKey?.approval_status ?? '-'}</div>
              <div>Approved At: {formatDateTime(data.answerKey?.approved_at)}</div>
              <div>Updated At: {formatDateTime(data.answerKey?.updated_at)}</div>
              <div>Notes: {data.answerKey?.generation_notes ?? '-'}</div>

              <div className="pt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={!canGenerate || generating}
                  onClick={generateAnswerKey}
                  className="px-3 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:bg-purple-300"
                >
                  {generating ? 'กำลังสร้าง...' : 'Generate AI Answer Key'}
                </button>

                <button
                  type="button"
                  disabled={!data.answerKey?.exists || approving}
                  onClick={approveAnswerKey}
                  className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:bg-emerald-300"
                >
                  {approving ? 'กำลังอนุมัติ...' : 'Approve'}
                </button>

                <button
                  type="button"
                  disabled={!data.answerKey?.exists || rejecting}
                  onClick={rejectAnswerKey}
                  className="px-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:bg-amber-300"
                >
                  {rejecting ? 'กำลัง reject...' : 'Reject'}
                </button>
              </div>
            </div>
          </WorkspaceCard>

          <WorkspaceCard title="Publishing / Workflow" status="mvp">
            <div className="space-y-2 text-sm text-slate-600">
              <div>Upload PDF: {data.sourcePdf?.exists ? 'ready' : 'pending'}</div>
              <div>Layout Spec: {data.layoutSpec ? 'ready' : 'pending'}</div>
              <div>
                Generate AI answer key:{' '}
                {data.answerKey?.exists ? 'ready' : 'pending'}
              </div>
              <div>
                Approve answer key:{' '}
                {data.answerKey?.approval_status === 'approved'
                  ? 'ready'
                  : 'pending'}
              </div>
              <div>Publish for grading: planned</div>
            </div>
          </WorkspaceCard>
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
      <div className={`text-3xl font-extrabold mt-2 ${valueClassName}`}>
        {value}
      </div>
    </div>
  )
}

function WorkspaceCard({
  title,
  status,
  actions,
  children,
}: {
  title: string
  status: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="font-bold text-slate-900">{title}</div>
          <div className="text-sm text-slate-500 mt-1">Status: {status}</div>
        </div>
        {actions}
      </div>
      {children}
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

function formatFileSize(value?: number | null) {
  if (!value || value <= 0) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(2)} MB`
}