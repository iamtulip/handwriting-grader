'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type FormState = {
  title: string
  description: string
  assignment_type: string
  week_number: string
  class_date: string
  open_at: string
  due_at: string
  close_at: string
  end_of_friday_at: string
  is_online_class: boolean
}

export default function EditAssignmentPage() {
  const params = useParams<{ assignmentId: string }>()
  const router = useRouter()
  const assignmentId = params.assignmentId

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [form, setForm] = useState<FormState>({
    title: '',
    description: '',
    assignment_type: 'weekly_exercise',
    week_number: '',
    class_date: '',
    open_at: '',
    due_at: '',
    close_at: '',
    end_of_friday_at: '',
    is_online_class: false,
  })

  async function loadData() {
    const res = await fetch(`/api/instructor/assignments/${assignmentId}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to load assignment')

    const a = data.assignment

    setForm({
      title: a.title ?? '',
      description: a.description ?? '',
      assignment_type: a.assignment_type ?? 'weekly_exercise',
      week_number: a.week_number != null ? String(a.week_number) : '',
      class_date: toDateInput(a.class_date),
      open_at: toDateTimeLocal(a.open_at),
      due_at: toDateTimeLocal(a.due_at),
      close_at: toDateTimeLocal(a.close_at),
      end_of_friday_at: toDateTimeLocal(a.end_of_friday_at),
      is_online_class: Boolean(a.is_online_class ?? false),
    })
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

  const canSave = useMemo(() => {
    return form.title.trim().length > 0 && !saving && !deleting
  }, [form.title, saving, deleting])

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setStatus(null)

    try {
      const body = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        assignment_type: form.assignment_type,
        week_number: form.week_number.trim() === '' ? null : Number(form.week_number),
        class_date: form.class_date || null,
        open_at: form.open_at ? new Date(form.open_at).toISOString() : null,
        due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
        close_at: form.close_at ? new Date(form.close_at).toISOString() : null,
        end_of_friday_at: form.end_of_friday_at ? new Date(form.end_of_friday_at).toISOString() : null,
        is_online_class: Boolean(form.is_online_class),
      }

      const res = await fetch(`/api/instructor/assignments/${assignmentId}/manage`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Update failed')

      setStatus({ type: 'success', text: 'บันทึกการแก้ไข assignment สำเร็จ' })
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'บันทึกไม่สำเร็จ' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      'คุณแน่ใจหรือไม่ว่าต้องการลบ assignment นี้?\n\nถ้ามี submission แล้ว ระบบจะไม่อนุญาตให้ลบ'
    )
    if (!confirmed) return

    setDeleting(true)
    setStatus(null)

    try {
      const res = await fetch(`/api/instructor/assignments/${assignmentId}/manage`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Delete failed')

      router.push('/instructor/assignments')
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'ลบ assignment ไม่สำเร็จ' })
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return <div className="p-8">กำลังโหลด Edit Assignment...</div>
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Edit Assignment</h1>
          <p className="text-slate-600 mt-2 text-lg">แก้ไขข้อมูล assignment</p>
          <div className="text-sm text-slate-500 mt-2">Assignment ID: {assignmentId}</div>
        </div>

        <div className="flex gap-3">
          <Link
            href={`/instructor/assignments/${assignmentId}`}
            className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
          >
            กลับหน้า Workspace
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

      <form
        onSubmit={handleSave}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Title">
            <input
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
              placeholder="ชื่องาน"
            />
          </Field>

          <Field label="Type">
            <select
              value={form.assignment_type}
              onChange={(e) => setField('assignment_type', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 bg-white"
            >
              <option value="weekly_exercise">weekly_exercise</option>
              <option value="quiz">quiz</option>
              <option value="midterm">midterm</option>
              <option value="final">final</option>
            </select>
          </Field>

          <Field label="Week Number">
            <input
              type="number"
              value={form.week_number}
              onChange={(e) => setField('week_number', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
              placeholder="เช่น 6"
            />
          </Field>

          <Field label="Class Date">
            <input
              type="date"
              value={form.class_date}
              onChange={(e) => setField('class_date', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
            />
          </Field>

          <Field label="Open At">
            <input
              type="datetime-local"
              value={form.open_at}
              onChange={(e) => setField('open_at', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
            />
          </Field>

          <Field label="Due At">
            <input
              type="datetime-local"
              value={form.due_at}
              onChange={(e) => setField('due_at', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
            />
          </Field>

          <Field label="Close At">
            <input
              type="datetime-local"
              value={form.close_at}
              onChange={(e) => setField('close_at', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
            />
          </Field>

          <Field label="End of Friday At">
            <input
              type="datetime-local"
              value={form.end_of_friday_at}
              onChange={(e) => setField('end_of_friday_at', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
            />
          </Field>

          <Field label="Online Class">
            <label className="inline-flex items-center gap-3">
              <input
              type="checkbox"
              checked={form.is_online_class}
              onChange={(e) => setField('is_online_class', e.target.checked)}
              className="h-4 w-4"
            />
            <span>งานนี้เป็นแบบฝึกหัดสำหรับคลาสออนไลน์</span>
            </label>
          </Field>
        </div>

        <Field label="Description">
          <textarea
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            className="w-full min-h-[140px] rounded-lg border border-slate-300 px-4 py-3"
            placeholder="คำอธิบายงาน"
          />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-6">
          <button
            type="button"
            disabled={deleting}
            onClick={handleDelete}
            className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 disabled:bg-red-300"
          >
            {deleting ? 'กำลังลบ...' : 'Delete Assignment'}
          </button>

          <button
            type="submit"
            disabled={!canSave}
            className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:bg-blue-300"
          >
            {saving ? 'กำลังบันทึก...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-2">
      <div className="text-sm font-bold text-slate-700">{label}</div>
      {children}
    </label>
  )
}

function toDateInput(value?: string | null) {
  if (!value) return ''
  return value.slice(0, 10)
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return ''
  const d = new Date(value)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}