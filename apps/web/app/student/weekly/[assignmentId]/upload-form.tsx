//apps/web/app/student/weekly/[assignmentId]/upload-form.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'


export default function UploadSubmissionForm({
  assignmentId,
  studentId,
  currentStatus,
  openAt,
  closeAt,
}: {
  assignmentId: string
  studentId: string
  currentStatus: string
  openAt?: string | null
  closeAt?: string | null
}) {
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const now = new Date()
  const openDate = openAt ? new Date(openAt) : null
  const closeDate = closeAt ? new Date(closeAt) : null

  const notOpenYet = openDate ? now < openDate : false
  const alreadyClosed = closeDate ? now > closeDate : false
  const disabled = submitting || notOpenYet || alreadyClosed

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)

    if (!files.length) {
      setError('กรุณาเลือกไฟล์อย่างน้อย 1 ไฟล์')
      return
    }

    try {
      setSubmitting(true)

      const formData = new FormData()
      for (const file of files) {
        formData.append('files', file)
      }
         formData.append('studentId',studentId)
      const res = await fetch(`/api/student/assignments/${assignmentId}/submit`, {
        method: 'POST',
        body: formData,
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(data?.error || 'ส่งงานไม่สำเร็จ')
      }

      setMessage('อัปโหลดคำตอบสำเร็จแล้ว')
      setFiles([])
      router.refresh()
    } catch (err: any) {
      setError(err?.message || 'ส่งงานไม่สำเร็จ')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
      <div className="font-bold text-slate-800 text-lg border-b border-slate-100 pb-2">
        ส่งงาน / อัปโหลดคำตอบ
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
          <div className="text-slate-500">สถานะปัจจุบัน</div>
          <div className="font-bold text-slate-900 mt-1">{currentStatus || 'not_submitted'}</div>
        </div>

        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
          <div className="text-slate-500">ช่วงเวลาที่ส่งได้</div>
          <div className="font-bold text-slate-900 mt-1">
            {openAt ? new Date(openAt).toLocaleString('th-TH') : '-'} ถึง{' '}
            {closeAt ? new Date(closeAt).toLocaleString('th-TH') : '-'}
          </div>
        </div>
      </div>

      {notOpenYet && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-700">
          งานนี้ยังไม่เปิดให้ส่ง
        </div>
      )}

      {alreadyClosed && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
          งานนี้ปิดรับส่งแล้ว
        </div>
      )}

      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-700">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            เลือกไฟล์คำตอบ (รองรับหลายหน้า)
          </label>
          <input
            type="file"
            multiple
            accept="image/*,.pdf"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="block w-full rounded-lg border border-slate-300 px-3 py-2"
            disabled={disabled}
          />
          <div className="mt-2 text-xs text-slate-500">
            แนะนำให้อัปโหลดตามลำดับหน้า เช่น หน้า 1, หน้า 2, หน้า 3
          </div>
        </div>

        {files.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="font-semibold text-slate-700 mb-2">ไฟล์ที่เลือก</div>
            <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
              {files.map((file, idx) => (
                <li key={`${file.name}-${idx}`}>
                  {file.name} ({Math.round(file.size / 1024)} KB)
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={disabled}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'กำลังอัปโหลด...' : 'อัปโหลดคำตอบ'}
          </button>

          <span className="text-sm text-slate-500">
            ถ้าเคยส่งแล้ว การอัปโหลดใหม่จะถือเป็นการส่งทับไฟล์เดิม
          </span>
        </div>
      </form>
    </section>
  )
}