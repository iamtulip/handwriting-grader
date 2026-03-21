'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'

type FileItem = {
  id: string
  assignment_id: string
  file_kind: 'source_pdf' | 'answer_key_pdf' | 'supporting_doc'
  storage_path: string
  original_filename: string | null
  mime_type: string | null
  file_size_bytes: number | null
  uploaded_by: string | null
  is_active: boolean
  uploaded_at: string | null
  replaced_at: string | null
}

export default function AssignmentFilesPage() {
  const params = useParams<{ assignmentId: string }>()
  const assignmentId = params.assignmentId

  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [items, setItems] = useState<FileItem[]>([])
  const [fileKind, setFileKind] = useState<'source_pdf' | 'answer_key_pdf' | 'supporting_doc'>(
    'source_pdf'
  )
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function loadData() {
    const res = await fetch(`/api/instructor/assignments/${assignmentId}/files`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to load files')

    setItems(data.items ?? [])
  }

  useEffect(() => {
    const run = async () => {
      try {
        await loadData()
      } catch (e: any) {
        setStatus({ type: 'error', text: e.message || 'โหลดไฟล์ไม่สำเร็จ' })
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [assignmentId])

  const grouped = useMemo(() => {
    return {
      source_pdf: items.filter((x) => x.file_kind === 'source_pdf'),
      answer_key_pdf: items.filter((x) => x.file_kind === 'answer_key_pdf'),
      supporting_doc: items.filter((x) => x.file_kind === 'supporting_doc'),
    }
  }, [items])

  async function handleUpload(file: File) {
    setUploading(true)
    setStatus(null)

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('file_kind', fileKind)

      const res = await fetch(`/api/instructor/assignments/${assignmentId}/files`, {
        method: 'POST',
        body: form,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')

      setStatus({ type: 'success', text: 'อัปโหลดไฟล์สำเร็จ' })
      await loadData()
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'อัปโหลดไฟล์ไม่สำเร็จ' })
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(fileId: string) {
    const ok = window.confirm('คุณต้องการลบไฟล์นี้ใช่หรือไม่')
    if (!ok) return

    setStatus(null)

    try {
      const res = await fetch(
        `/api/instructor/assignments/${assignmentId}/files/${fileId}`,
        {
          method: 'DELETE',
          headers: { Accept: 'application/json' },
        }
      )

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Delete failed')

      setStatus({ type: 'success', text: 'ลบไฟล์สำเร็จ' })
      await loadData()
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'ลบไฟล์ไม่สำเร็จ' })
    }
  }

  if (loading) {
    return <div className="p-8">กำลังโหลด files...</div>
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Assignment Files</h1>
          <p className="text-slate-600 mt-2 text-lg">
            จัดการไฟล์โจทย์ PDF เฉลย และเอกสารประกอบ
          </p>
          <div className="text-sm text-slate-500 mt-2">Assignment ID: {assignmentId}</div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/instructor/assignments/${assignmentId}`}
            className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
          >
            กลับ Workspace
          </Link>

          <Link
            href={`/instructor/assignments/${assignmentId}/answer-key`}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700"
          >
            ไปหน้า Answer Key
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

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="font-bold text-slate-900 text-lg mb-4">Upload File</div>

        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 items-end">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              File Kind
            </label>
            <select
              value={fileKind}
              onChange={(e) => setFileKind(e.target.value as any)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 bg-white"
            >
              <option value="source_pdf">source_pdf</option>
              <option value="answer_key_pdf">answer_key_pdf</option>
              <option value="supporting_doc">supporting_doc</option>
            </select>
          </div>

          <div>
            <label className="inline-flex items-center justify-center px-4 py-3 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 cursor-pointer">
              {uploading ? 'กำลังอัปโหลด...' : 'เลือกไฟล์และอัปโหลด'}
              <input
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.json,.txt"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleUpload(file)
                  e.currentTarget.value = ''
                }}
              />
            </label>
          </div>
        </div>
      </section>

      <FileGroup
        title="Source PDF"
        description="ไฟล์โจทย์หลักของ assignment"
        items={grouped.source_pdf}
        assignmentId={assignmentId}
        onDelete={handleDelete}
      />

      <FileGroup
        title="Answer Key PDF"
        description="ไฟล์เฉลยที่อาจารย์อัปโหลดเพิ่ม"
        items={grouped.answer_key_pdf}
        assignmentId={assignmentId}
        onDelete={handleDelete}
      />

      <FileGroup
        title="Supporting Documents"
        description="เอกสารประกอบอื่น ๆ"
        items={grouped.supporting_doc}
        assignmentId={assignmentId}
        onDelete={handleDelete}
      />
    </div>
  )
}

function FileGroup({
  title,
  description,
  items,
  assignmentId,
  onDelete,
}: {
  title: string
  description: string
  items: FileItem[]
  assignmentId: string
  onDelete: (fileId: string) => void
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-200 bg-slate-50">
        <div className="font-bold text-slate-900 text-lg">{title}</div>
        <div className="text-sm text-slate-500 mt-1">{description}</div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white border-b border-slate-200 text-slate-500">
            <tr>
              <th className="text-left p-4 font-medium">Filename</th>
              <th className="text-left p-4 font-medium">Type</th>
              <th className="text-left p-4 font-medium">Size</th>
              <th className="text-left p-4 font-medium">Uploaded At</th>
              <th className="text-left p-4 font-medium">Status</th>
              <th className="text-right p-4 font-medium">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="p-4">
                  <div className="font-semibold text-slate-900">
                    {item.original_filename ?? '-'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{item.id}</div>
                </td>

                <td className="p-4 text-slate-600">{item.mime_type ?? '-'}</td>
                <td className="p-4 text-slate-600">{formatFileSize(item.file_size_bytes)}</td>
                <td className="p-4 text-slate-600">{formatDateTime(item.uploaded_at)}</td>

                <td className="p-4">
                  {item.is_active ? (
                    <span className="px-2 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                      active
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                      inactive
                    </span>
                  )}
                </td>

                <td className="p-4">
                  <div className="flex justify-end gap-2 flex-wrap">
                    <a
                      href={`/api/instructor/assignments/${assignmentId}/files/${item.id}/url?mode=preview`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                    >
                      Preview
                    </a>

                    <a
                      href={`/api/instructor/assignments/${assignmentId}/files/${item.id}/url?mode=download`}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                    >
                      Download
                    </a>

                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-slate-500">
                  ยังไม่มีไฟล์ในกลุ่มนี้
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
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