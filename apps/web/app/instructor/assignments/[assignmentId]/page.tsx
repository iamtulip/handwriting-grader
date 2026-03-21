
//apps/web/app/instructor/assignments/[assignmentId]/page.tsx
'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type StatusMessage = {
  type: 'success' | 'error'
  text: string
}

type AssignmentDetailResponse = {
  assignment: {
    id: string
    title: string
    description?: string | null
    assignment_type?: string | null
    week_number?: number | null
    class_date?: string | null
    open_at?: string | null
    due_at?: string | null
    close_at?: string | null
    end_of_friday_at?: string | null
    created_at?: string | null
    updated_at?: string | null
  }
  section: {
    id: string
    course_code?: string | null
    section_number?: string | number | null
    term?: string | null
  } | null
  sourcePdf: {
    exists: boolean
    id?: string | null
    original_filename?: string | null
    mime_type?: string | null
    file_size_bytes?: number | null
    uploaded_at?: string | null
    storage_path?: string | null
  }
  layoutSpec: {
    id: string
    version?: number | null
    is_active?: boolean | null
    schema_version?: number | null
    spec_name?: string | null
    page_count?: number | null
    layout_status?: string | null
    approved_at?: string | null
    created_at?: string | null
  } | null
  activeLayoutSpec?: {
    id: string
    version?: number | null
    is_active?: boolean | null
    schema_version?: number | null
    spec_name?: string | null
    page_count?: number | null
    layout_status?: string | null
    approved_at?: string | null
    created_at?: string | null
  } | null
  latestLayoutSpec?: {
    id: string
    version?: number | null
    is_active?: boolean | null
    schema_version?: number | null
    spec_name?: string | null
    page_count?: number | null
    layout_status?: string | null
    approved_at?: string | null
    created_at?: string | null
  } | null
  layoutVersions?: Array<{
    id: string
    version?: number | null
    is_active?: boolean | null
    schema_version?: number | null
    spec_name?: string | null
    page_count?: number | null
    layout_status?: string | null
    approved_at?: string | null
    created_at?: string | null
  }>
  answerKey: {
    exists: boolean
    updated_at?: string | null
    source_pdf_path?: string | null
    source_file_id?: string | null
    generation_status?: string | null
    generated_by_ai?: boolean | null
    ai_model?: string | null
    approval_status?: string | null
    approved_by?: string | null
    approved_at?: string | null
    generation_notes?: string | null
    last_generation_error?: string | null
    grading_config?: any
    item_count?: number
  }
  summary?: {
    submission_count?: number
    needs_review_count?: number
    graded_count?: number
    uploaded_count?: number
    ocr_pending_count?: number
    extract_pending_count?: number
    grade_pending_count?: number
    avg_total_score?: number
  }
}

export default function InstructorAssignmentDetailPage() {
  const params = useParams<{ assignmentId: string }>()
  const router = useRouter()
  const assignmentId = params.assignmentId

  const [data, setData] = useState<AssignmentDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  async function loadData() {
    const res = await fetch(`/api/instructor/assignments/${assignmentId}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })

    const json = await res.json()
    if (!res.ok) {
      throw new Error(json.error || 'Failed to load assignment details')
    }

    setData(json)
  }

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true)
        setStatus(null)
        await loadData()
      } catch (e: any) {
        setStatus({
          type: 'error',
          text: e?.message || 'โหลดข้อมูล assignment ไม่สำเร็จ',
        })
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [assignmentId])

  const sourceReady = !!data?.sourcePdf?.exists
  const layoutReady = !!data?.layoutSpec
  const activeLayoutReady = !!data?.activeLayoutSpec
  const approvedLayoutReady =
    !!data?.activeLayoutSpec &&
    ['approved', 'active', 'ready'].includes(
      String(data?.activeLayoutSpec?.layout_status ?? '').toLowerCase()
    )

  const canGenerate = sourceReady && layoutReady
  const canApproveAnswerKey = !!data?.answerKey?.exists
  const canRejectAnswerKey = !!data?.answerKey?.exists

  const sectionLabel = useMemo(() => {
    if (!data?.section) return 'Unknown section'

    return `${data.section.course_code ?? '-'} - Sec ${data.section.section_number ?? '-'} (${data.section.term ?? '-'})`
  }, [data?.section])

  async function handleUploadSourcePdf() {
    if (!selectedFile) {
      setStatus({ type: 'error', text: 'กรุณาเลือกไฟล์ PDF ก่อน' })
      return
    }

    setUploading(true)
    setStatus(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const res = await fetch(
        `/api/instructor/assignments/${assignmentId}/source-pdf`,
        {
          method: 'POST',
          body: formData,
        }
      )

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Upload source PDF failed')
      }

      setSelectedFile(null)
      setStatus({ type: 'success', text: 'อัปโหลด source PDF สำเร็จ' })
      await loadData()
      router.refresh()
    } catch (e: any) {
      setStatus({
        type: 'error',
        text: e?.message || 'อัปโหลด source PDF ไม่สำเร็จ',
      })
    } finally {
      setUploading(false)
    }
  }

  async function handleRemoveSourcePdf() {
    setRemoving(true)
    setStatus(null)

    try {
      const res = await fetch(
        `/api/instructor/assignments/${assignmentId}/source-pdf`,
        {
          method: 'DELETE',
        }
      )

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Remove source PDF failed')
      }

      setStatus({ type: 'success', text: 'ลบ source PDF สำเร็จ' })
      await loadData()
      router.refresh()
    } catch (e: any) {
      setStatus({
        type: 'error',
        text: e?.message || 'ลบ source PDF ไม่สำเร็จ',
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
        `/api/instructor/assignments/${assignmentId}/answer-key/generate`,
        {
          method: 'POST',
          headers: { Accept: 'application/json' },
        }
      )

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Generate answer key failed')
      }

      setStatus({ type: 'success', text: 'สั่งสร้าง answer key สำเร็จ' })
      await loadData()
      router.refresh()
    } catch (e: any) {
      setStatus({
        type: 'error',
        text: e?.message || 'สร้าง answer key ไม่สำเร็จ',
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
        `/api/instructor/assignments/${assignmentId}/answer-key/approve`,
        {
          method: 'POST',
          headers: { Accept: 'application/json' },
        }
      )

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Approve answer key failed')
      }

      setStatus({ type: 'success', text: 'อนุมัติ answer key สำเร็จ' })
      await loadData()
      router.refresh()
    } catch (e: any) {
      setStatus({
        type: 'error',
        text: e?.message || 'อนุมัติ answer key ไม่สำเร็จ',
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
        `/api/instructor/assignments/${assignmentId}/answer-key/reject`,
        {
          method: 'POST',
          headers: { Accept: 'application/json' },
        }
      )

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Reject answer key failed')
      }

      setStatus({ type: 'success', text: 'ส่ง answer key กลับแก้ไขสำเร็จ' })
      await loadData()
      router.refresh()
    } catch (e: any) {
      setStatus({
        type: 'error',
        text: e?.message || 'ส่ง answer key กลับแก้ไขไม่สำเร็จ',
      })
    } finally {
      setRejecting(false)
    }
  }

  if (loading) {
    return <div className="p-8">กำลังโหลดข้อมูล assignment...</div>
  }

  if (!data) {
    return <div className="p-8 text-red-600">ไม่พบข้อมูล assignment</div>
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">
            {data.assignment.title}
          </h1>
          <div className="text-slate-600 mt-2">{sectionLabel}</div>
          <div className="text-sm text-slate-500 mt-2">
            Assignment ID: {data.assignment.id}
          </div>
        </div>

        <div className="flex gap-3">
          <Link
            href="/instructor/dashboard"
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
        <InfoCard
          title="Submissions"
          value={String(data.summary?.submission_count ?? 0)}
        />
        <InfoCard
          title="Needs Review"
          value={String(data.summary?.needs_review_count ?? 0)}
        />
        <InfoCard
          title="Graded"
          value={String(data.summary?.graded_count ?? 0)}
        />
        <InfoCard
          title="Avg Score"
          value={String(data.summary?.avg_total_score ?? 0)}
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <div className="font-bold text-slate-900 text-lg">Assignment Info</div>
          <InfoRow label="Title" value={data.assignment.title ?? '-'} />
          <InfoRow
            label="Description"
            value={data.assignment.description ?? '-'}
          />
          <InfoRow
            label="Type"
            value={data.assignment.assignment_type ?? '-'}
          />
          <InfoRow
            label="Week"
            value={String(data.assignment.week_number ?? '-')}
          />
          <InfoRow
            label="Class Date"
            value={formatDateTime(data.assignment.class_date)}
          />
          <InfoRow
            label="Open At"
            value={formatDateTime(data.assignment.open_at)}
          />
          <InfoRow
            label="Due At"
            value={formatDateTime(data.assignment.due_at)}
          />
          <InfoRow
            label="Close At"
            value={formatDateTime(data.assignment.close_at)}
          />
          <InfoRow
            label="Updated At"
            value={formatDateTime(data.assignment.updated_at)}
          />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <div className="font-bold text-slate-900 text-lg">Workflow Readiness</div>
          <ReadinessRow label="Source PDF" ready={sourceReady} />
          <ReadinessRow label="Any Layout" ready={layoutReady} />
          <ReadinessRow label="Active Layout" ready={activeLayoutReady} />
          <ReadinessRow label="Approved Layout" ready={approvedLayoutReady} />
          <ReadinessRow label="Can Generate Answer Key" ready={canGenerate} />
          <ReadinessRow
            label="Answer Key Exists"
            ready={!!data.answerKey?.exists}
          />
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="font-bold text-slate-900 text-lg">Source PDF</div>

          {data.sourcePdf?.exists ? (
            <div className="space-y-3">
              <InfoRow
                label="Filename"
                value={data.sourcePdf.original_filename ?? '-'}
              />
              <InfoRow
                label="MIME Type"
                value={data.sourcePdf.mime_type ?? '-'}
              />
              <InfoRow
                label="Size"
                value={formatBytes(data.sourcePdf.file_size_bytes)}
              />
              <InfoRow
                label="Uploaded At"
                value={formatDateTime(data.sourcePdf.uploaded_at)}
              />

              <div className="flex flex-wrap gap-3 pt-2">
                <a
                  href={`/api/instructor/assignments/${assignmentId}/source-pdf/url?mode=preview`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800"
                >
                  Preview PDF
                </a>

                <a
                  href={`/api/instructor/assignments/${assignmentId}/source-pdf/url?mode=download`}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700"
                >
                  Download PDF
                </a>

                <button
                  type="button"
                  onClick={handleRemoveSourcePdf}
                  disabled={removing}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:bg-red-300"
                >
                  {removing ? 'กำลังลบ...' : 'Remove PDF'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-slate-500">ยังไม่มี source PDF</div>

              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm"
              />

              <button
                type="button"
                onClick={handleUploadSourcePdf}
                disabled={uploading || !selectedFile}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:bg-emerald-300"
              >
                {uploading ? 'กำลังอัปโหลด...' : 'Upload Source PDF'}
              </button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="font-bold text-slate-900 text-lg">Layout Spec</div>

          {data.layoutSpec ? (
            <div className="space-y-3">
              <InfoRow label="Spec Name" value={data.layoutSpec.spec_name ?? '-'} />
              <InfoRow label="Version" value={String(data.layoutSpec.version ?? '-')} />
              <InfoRow
                label="Schema Version"
                value={String(data.layoutSpec.schema_version ?? '-')}
              />
              <InfoRow
                label="Page Count"
                value={String(data.layoutSpec.page_count ?? '-')}
              />
              <InfoRow
                label="Layout Status"
                value={data.layoutSpec.layout_status ?? '-'}
              />
              <InfoRow
                label="Approved At"
                value={formatDateTime(data.layoutSpec.approved_at)}
              />
              <InfoRow
                label="Created At"
                value={formatDateTime(data.layoutSpec.created_at)}
              />

              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  href={`/instructor/assignments/${assignmentId}/layout`}
                  className="px-4 py-2 rounded-lg bg-violet-600 text-white font-semibold hover:bg-violet-700"
                >
                  Manage Layout
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-slate-500">ยังไม่มี layout spec</div>
              <Link
                href={`/instructor/assignments/${assignmentId}/layout`}
                className="inline-flex px-4 py-2 rounded-lg bg-violet-600 text-white font-semibold hover:bg-violet-700"
              >
                Create Layout
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="font-bold text-slate-900 text-lg">Answer Key</div>

          {data.answerKey?.exists ? (
            <div className="space-y-3">
              <InfoRow
                label="Generation Status"
                value={data.answerKey.generation_status ?? '-'}
              />
              <InfoRow
                label="Approval Status"
                value={data.answerKey.approval_status ?? '-'}
              />
              <InfoRow
                label="Generated by AI"
                value={data.answerKey.generated_by_ai ? 'TRUE' : 'FALSE'}
              />
              <InfoRow label="AI Model" value={data.answerKey.ai_model ?? '-'} />
              <InfoRow
                label="Item Count"
                value={String(data.answerKey.item_count ?? 0)}
              />
              <InfoRow
                label="Updated At"
                value={formatDateTime(data.answerKey.updated_at)}
              />
              <InfoRow
                label="Approved At"
                value={formatDateTime(data.answerKey.approved_at)}
              />
              <InfoRow
                label="Generation Notes"
                value={data.answerKey.generation_notes ?? '-'}
              />
              <InfoRow
                label="Last Error"
                value={data.answerKey.last_generation_error ?? '-'}
              />

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={approveAnswerKey}
                  disabled={approving || !canApproveAnswerKey}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:bg-emerald-300"
                >
                  {approving ? 'กำลังอนุมัติ...' : 'Approve Answer Key'}
                </button>

                <button
                  type="button"
                  onClick={rejectAnswerKey}
                  disabled={rejecting || !canRejectAnswerKey}
                  className="px-4 py-2 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:bg-amber-300"
                >
                  {rejecting ? 'กำลังส่งกลับ...' : 'Reject Answer Key'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-slate-500">ยังไม่มี answer key</div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="font-bold text-slate-900 text-lg">Publishing / Workflow</div>

          <div className="space-y-3">
            <InfoRow
              label="Source PDF Ready"
              value={sourceReady ? 'READY' : 'NOT READY'}
            />
            <InfoRow
              label="Layout Ready"
              value={layoutReady ? 'READY' : 'NOT READY'}
            />
            <InfoRow
              label="Approved Layout Ready"
              value={approvedLayoutReady ? 'READY' : 'NOT READY'}
            />
            <InfoRow
              label="Answer Key Exists"
              value={data.answerKey?.exists ? 'READY' : 'NOT READY'}
            />
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={generateAnswerKey}
              disabled={generating || !canGenerate}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:bg-indigo-300"
            >
              {generating ? 'กำลังสร้าง...' : 'Generate Answer Key'}
            </button>

            <Link
              href={`/instructor/assignments/${assignmentId}/submissions`}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800"
            >
              Open Submissions
            </Link>
          </div>

          {!canGenerate && (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              ต้องมี source PDF และ layout spec ก่อน จึงจะสร้าง answer key ได้
            </div>
          )}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="font-bold text-slate-900 text-lg mb-4">Layout Versions</div>

        {data.layoutVersions && data.layoutVersions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="text-left py-3 pr-4 font-medium">Version</th>
                  <th className="text-left py-3 pr-4 font-medium">Name</th>
                  <th className="text-left py-3 pr-4 font-medium">Status</th>
                  <th className="text-left py-3 pr-4 font-medium">Active</th>
                  <th className="text-left py-3 pr-4 font-medium">Created At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.layoutVersions.map((row) => (
                  <tr key={row.id}>
                    <td className="py-3 pr-4">{row.version ?? '-'}</td>
                    <td className="py-3 pr-4">{row.spec_name ?? '-'}</td>
                    <td className="py-3 pr-4">{row.layout_status ?? '-'}</td>
                    <td className="py-3 pr-4">{row.is_active ? 'TRUE' : 'FALSE'}</td>
                    <td className="py-3 pr-4">{formatDateTime(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-slate-500">ยังไม่มี layout versions</div>
        )}
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
      <div className="text-slate-900 font-semibold text-right whitespace-pre-wrap">
        {value}
      </div>
    </div>
  )
}

function ReadinessRow({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
      <div className="text-slate-500 font-medium">{label}</div>
      <div
        className={`font-bold ${
          ready ? 'text-emerald-600' : 'text-amber-600'
        }`}
      >
        {ready ? 'READY' : 'NOT READY'}
      </div>
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

function formatBytes(value?: number | null) {
  if (value == null) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(2)} MB`
}