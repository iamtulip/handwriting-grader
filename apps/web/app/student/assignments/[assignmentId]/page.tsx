//apps/web/app/student/assignments/[assignmentId]/page.tsx
'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'

type SubmissionFile = {
  id: string
  submission_id: string
  page_number: number
  storage_path: string
  created_at: string | null
}

export default function StudentAssignmentDetailPage() {
  const params = useParams<{ assignmentId: string }>()
  const assignmentId = params.assignmentId

  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [data, setData] = useState<any>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function loadData() {
    const res = await fetch(`/api/student/assignments/${assignmentId}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })

    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to load assignment')

    setData(json)
  }

  useEffect(() => {
    const run = async () => {
      try {
        await loadData()
      } catch (e: any) {
        setStatus({ type: 'error', text: e.message || 'โหลด assignment ไม่สำเร็จ' })
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [assignmentId])

  const canSubmit = useMemo(() => {
    if (!data?.assignment) return false
    const now = new Date()
    const openAt = data.assignment.open_at ? new Date(data.assignment.open_at) : null
    const closeAt = data.assignment.close_at ? new Date(data.assignment.close_at) : null

    if (openAt && now < openAt) return false
    if (closeAt && now > closeAt) return false
    return true
  }, [data])

  async function handleSubmit() {
    setStatus(null)

    if (selectedFiles.length === 0) {
      setStatus({ type: 'error', text: 'กรุณาเลือกไฟล์อย่างน้อย 1 ไฟล์' })
      return
    }

    setUploading(true)

    try {
      const form = new FormData()
      for (const file of selectedFiles) {
        form.append('files', file)
      }

      const res = await fetch(`/api/student/assignments/${assignmentId}/submit`, {
        method: 'POST',
        body: form,
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Submit failed')

      setStatus({ type: 'success', text: 'ส่งงานสำเร็จแล้ว' })
      setSelectedFiles([])
      await loadData()
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'ส่งงานไม่สำเร็จ' })
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return <div className="p-8">กำลังโหลด assignment...</div>
  }

  if (!data?.assignment) {
    return <div className="p-8 text-red-600">ไม่พบ assignment</div>
  }

  const assignment = data.assignment
  const submission = data.submission
  const files: SubmissionFile[] = data.files ?? []

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">{assignment.title}</h1>
          <p className="text-slate-600 mt-2 text-lg">
            {assignment.sections?.course_code} - Sec {assignment.sections?.section_number}{' '}
            {assignment.sections?.term ? `(${assignment.sections.term})` : ''}
          </p>
          <div className="text-sm text-slate-500 mt-2">
            นักศึกษา: {data.profile?.full_name ?? 'Student'}{' '}
            {data.profile?.student_id_number ? `(${data.profile.student_id_number})` : ''}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/student/weekly"
            className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
          >
            กลับรายการงาน
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
        <InfoCard title="Type" value={assignment.assignment_type ?? '-'} />
        <InfoCard title="Week" value={String(assignment.week_number ?? '-')} />
        <InfoCard title="Class Date" value={assignment.class_date ?? '-'} />
        <InfoCard title="Status" value={submission?.status ?? 'not_submitted'} />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="font-bold text-slate-900 text-lg">Assignment Details</div>

          <Row label="Description" value={assignment.description ?? '-'} />
          <Row label="Open At" value={formatDateTime(assignment.open_at)} />
          <Row label="Due At" value={formatDateTime(assignment.due_at)} />
          <Row label="Close At" value={formatDateTime(assignment.close_at)} />
          <Row label="End of Friday At" value={formatDateTime(assignment.end_of_friday_at)} />

          <div className="pt-2">
            {canSubmit ? (
              <span className="inline-flex px-3 py-1 rounded-full text-sm font-semibold bg-emerald-100 text-emerald-700">
                เปิดรับส่ง
              </span>
            ) : (
              <span className="inline-flex px-3 py-1 rounded-full text-sm font-semibold bg-amber-100 text-amber-700">
                ยังไม่เปิดหรือปิดรับส่งแล้ว
              </span>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="font-bold text-slate-900 text-lg">Submit Answer Files</div>

          <div className="text-sm text-slate-600">
            รองรับการอัปโหลดหลายไฟล์ โดยระบบจะบันทึกเป็นหน้า 1, 2, 3 ตามลำดับไฟล์ที่เลือก
          </div>

          <label className="inline-flex items-center justify-center px-4 py-3 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 cursor-pointer">
            เลือกไฟล์คำตอบ
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                setSelectedFiles(files)
                e.currentTarget.value = ''
              }}
            />
          </label>

          <div className="space-y-2">
            {selectedFiles.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="rounded-lg border border-slate-200 px-4 py-3 text-sm"
              >
                หน้า {idx + 1}: {file.name}
              </div>
            ))}

            {selectedFiles.length === 0 && (
              <div className="text-sm text-slate-500">ยังไม่ได้เลือกไฟล์</div>
            )}
          </div>

          <button
            type="button"
            disabled={!canSubmit || uploading || selectedFiles.length === 0}
            onClick={handleSubmit}
            className="w-full px-4 py-3 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:bg-emerald-300"
          >
            {uploading ? 'กำลังส่งงาน...' : 'Submit Assignment'}
          </button>
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
              {files.map((file) => (
                <tr key={file.id} className="hover:bg-slate-50">
                  <td className="p-4 font-semibold text-slate-900">{file.page_number}</td>
                  <td className="p-4 text-slate-600">{formatDateTime(file.created_at)}</td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2 flex-wrap">
                      <a
                        href={`/api/student/assignments/${assignmentId}/submission-file/${file.id}/url?mode=preview`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                      >
                        Preview
                      </a>

                      <a
                        href={`/api/student/assignments/${assignmentId}/submission-file/${file.id}/url?mode=download`}
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
                    ยังไม่มีไฟล์ที่ส่ง
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {submission && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="font-bold text-slate-900 text-lg">Submission Summary</div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InfoCard title="Submission Status" value={submission.status ?? '-'} />
            <InfoCard title="Current Stage" value={submission.current_stage ?? '-'} />
            <InfoCard title="Total Score" value={String(submission.total_score ?? 0)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <Row label="Submitted At" value={formatDateTime(submission.submitted_at)} />
            <Row label="Updated At" value={formatDateTime(submission.updated_at)} />
            <Row
              label="Fraud Flag"
              value={submission.fraud_flag ? 'TRUE' : 'FALSE'}
            />
            <Row
              label="Extracted Paper Student ID"
              value={submission.extracted_paper_student_id ?? '-'}
            />
          </div>
        </section>
      )}
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