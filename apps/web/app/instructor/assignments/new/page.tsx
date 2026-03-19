'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type SectionItem = {
  id: string
  course_code: string
  section_number: number
  term: string
}

export default function NewInstructorAssignmentPage() {
  const router = useRouter()

  const [sections, setSections] = useState<SectionItem[]>([])
  const [loadingSections, setLoadingSections] = useState(true)

  const [sectionId, setSectionId] = useState('')
  const [title, setTitle] = useState('')
  const [assignmentType, setAssignmentType] = useState<'weekly_exercise' | 'quiz' | 'midterm' | 'final'>('weekly_exercise')
  const [weekNumber, setWeekNumber] = useState('')
  const [classDate, setClassDate] = useState('')
  const [openAt, setOpenAt] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [closeAt, setCloseAt] = useState('')
  const [endOfFridayAt, setEndOfFridayAt] = useState('')
  const [description, setDescription] = useState('')

  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/instructor/sections', {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
          },
        })

        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load sections')

        setSections(data.items ?? [])
      } catch (e: any) {
        setStatus({
          type: 'error',
          text: e.message || 'โหลด sections ไม่สำเร็จ',
        })
      } finally {
        setLoadingSections(false)
      }
    }

    run()
  }, [])

  const isWeekly = useMemo(() => assignmentType === 'weekly_exercise', [assignmentType])

  const canSubmit = useMemo(() => {
    return !saving && sectionId.trim().length > 0 && title.trim().length > 0
  }, [saving, sectionId, title])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus(null)

    if (!sectionId.trim()) {
      setStatus({ type: 'error', text: 'กรุณาเลือก Section' })
      return
    }

    if (!title.trim()) {
      setStatus({ type: 'error', text: 'กรุณากรอกชื่องาน' })
      return
    }

    setSaving(true)

    try {
      const payload = {
        section_id: sectionId,
        title: title.trim(),
        assignment_type: assignmentType,
        week_number: weekNumber ? Number(weekNumber) : null,
        class_date: classDate || null,
        open_at: openAt ? new Date(openAt).toISOString() : null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        close_at: closeAt ? new Date(closeAt).toISOString() : null,
        end_of_friday_at: endOfFridayAt ? new Date(endOfFridayAt).toISOString() : null,
        description: description.trim() || null,
      }

      const res = await fetch('/api/instructor/assignments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'สร้าง assignment ไม่สำเร็จ')

      setStatus({
        type: 'success',
        text: 'สร้าง assignment สำเร็จ',
      })

      setTimeout(() => {
        router.push('/instructor/assignments')
      }, 700)
    } catch (e: any) {
      setStatus({
        type: 'error',
        text: e.message || 'เกิดข้อผิดพลาดในการสร้าง assignment',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">สร้าง Assignment</h1>
          <p className="text-slate-600 mt-2 text-lg">
            สร้างงานใหม่สำหรับ section ที่คุณรับผิดชอบ
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push('/instructor/assignments')}
          className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-colors"
        >
          ย้อนกลับ
        </button>
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

      <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Section *</label>
            <select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              disabled={loadingSections}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 bg-white"
              required
            >
              <option value="">-- เลือก section --</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.course_code} - Sec {s.section_number} ({s.term})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">ประเภทงาน *</label>
            <select
              value={assignmentType}
              onChange={(e) => setAssignmentType(e.target.value as any)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 bg-white"
            >
              <option value="weekly_exercise">weekly_exercise</option>
              <option value="quiz">quiz</option>
              <option value="midterm">midterm</option>
              <option value="final">final</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-bold text-slate-700 mb-2">ชื่องาน *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
              placeholder="เช่น Worksheet 1: Derivatives"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">สัปดาห์ที่</label>
            <input
              type="number"
              value={weekNumber}
              onChange={(e) => setWeekNumber(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
              placeholder="เช่น 3"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">วันที่เรียน</label>
            <input
              type="date"
              value={classDate}
              onChange={(e) => setClassDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">เปิดรับงาน</label>
            <input
              type="datetime-local"
              value={openAt}
              onChange={(e) => setOpenAt(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">กำหนดส่ง</label>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">ปิดรับงาน</label>
            <input
              type="datetime-local"
              value={closeAt}
              onChange={(e) => setCloseAt(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              ปิดรับวันศุกร์
            </label>
            <input
              type="datetime-local"
              value={endOfFridayAt}
              onChange={(e) => setEndOfFridayAt(e.target.value)}
              disabled={!isWeekly}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 disabled:bg-slate-100"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-bold text-slate-700 mb-2">คำอธิบาย</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full min-h-[140px] rounded-lg border border-slate-300 px-4 py-3"
              placeholder="รายละเอียดงาน ข้อกำหนด หรือคำชี้แจงเพิ่มเติม"
            />
          </div>
        </section>

        <div className="pt-2 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push('/instructor/assignments')}
            className="px-5 py-3 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50"
          >
            ยกเลิก
          </button>

          <button
            type="submit"
            disabled={!canSubmit}
            className="px-5 py-3 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:bg-blue-300"
          >
            {saving ? 'กำลังบันทึก...' : 'สร้าง Assignment'}
          </button>
        </div>
      </form>
    </div>
  )
}