'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type SectionItem = {
  id: string
  course_code: string
  section_number: number
  term: string
}

type FormState = {
  section_id: string
  title: string
  description: string
  assignment_type: string
  week_number: string
  class_date: string
  open_at: string
  due_at: string
  close_at: string
  end_of_friday_at: string
}

export default function NewAssignmentPage() {
  const router = useRouter()

  const [loadingSections, setLoadingSections] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [sections, setSections] = useState<SectionItem[]>([])

  const [form, setForm] = useState<FormState>({
    section_id: '',
    title: '',
    description: '',
    assignment_type: 'weekly_exercise',
    week_number: '',
    class_date: '',
    open_at: '',
    due_at: '',
    close_at: '',
    end_of_friday_at: '',
  })

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/instructor/sections', {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load sections')

        const items = data.items ?? []
        setSections(items)
        if (items.length > 0) {
          setForm((prev) => ({ ...prev, section_id: items[0].id }))
        }
      } catch (e: any) {
        setStatus({ type: 'error', text: e.message || 'โหลด sections ไม่สำเร็จ' })
      } finally {
        setLoadingSections(false)
      }
    }
    run()
  }, [])

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const canSave = useMemo(() => {
    return (
      !saving &&
      form.section_id.trim().length > 0 &&
      form.title.trim().length > 0
    )
  }, [form, saving])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setStatus(null)

    try {
      const body = {
        section_id: form.section_id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        assignment_type: form.assignment_type,
        week_number:
          form.week_number.trim() === '' ? null : Number(form.week_number),
        class_date: form.class_date || null,
        open_at: form.open_at || null,
        due_at: form.due_at || null,
        close_at: form.close_at || null,
        end_of_friday_at: form.end_of_friday_at || null,
      }

      const res = await fetch('/api/instructor/assignments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Create failed')

      router.push(`/instructor/assignments/${data.item.id}`)
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'สร้าง assignment ไม่สำเร็จ' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Create Assignment</h1>
          <p className="text-slate-600 mt-2 text-lg">สร้างงานใหม่สำหรับ section ที่คุณดูแล</p>
        </div>

        <Link
          href="/instructor/assignments"
          className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
        >
          กลับรายการงาน
        </Link>
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
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Section">
            <select
              value={form.section_id}
              onChange={(e) => setField('section_id', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 bg-white"
              disabled={loadingSections}
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.course_code} - Sec {s.section_number} ({s.term})
                </option>
              ))}
            </select>
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

          <Field label="Title">
            <input
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
              placeholder="ชื่องาน"
            />
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
        </div>

        <Field label="Description">
          <textarea
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            className="w-full min-h-[140px] rounded-lg border border-slate-300 px-4 py-3"
            placeholder="คำอธิบายงาน"
          />
        </Field>

        <div className="flex justify-end border-t border-slate-200 pt-6">
          <button
            type="submit"
            disabled={!canSave}
            className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:bg-blue-300"
          >
            {saving ? 'กำลังสร้าง...' : 'Create Assignment'}
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