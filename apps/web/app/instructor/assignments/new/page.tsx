'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type WorkflowMode = 'course_assignment' | 'standalone_exam'
type AssignmentType = 'weekly_exercise' | 'quiz' | 'midterm' | 'final'

type SectionOption = {
  id: string
  course_code: string | null
  section_number: number | null
  term: string | null
}

type StatusMessage = {
  type: 'success' | 'error'
  text: string
}

const DEFAULT_ASSIGNMENT_TYPE: AssignmentType = 'quiz'

export default function InstructorAssignmentCreatePage() {
  const router = useRouter()

  const [workflowMode, setWorkflowMode] =
    useState<WorkflowMode>('course_assignment')
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [loadingSections, setLoadingSections] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [sections, setSections] = useState<SectionOption[]>([])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignmentType, setAssignmentType] =
    useState<AssignmentType>(DEFAULT_ASSIGNMENT_TYPE)
  const [sectionId, setSectionId] = useState('')
  const [weekNumber, setWeekNumber] = useState('')
  const [termLabel, setTermLabel] = useState('1/2026')
  const [classDate, setClassDate] = useState('')
  const [openAt, setOpenAt] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [closeAt, setCloseAt] = useState('')
  const [isOnlineClass, setIsOnlineClass] = useState(false)

  useState(() => {
    void (async () => {
      try {
        setLoadingSections(true)
        const res = await fetch('/api/instructor/sections', {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        })
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'โหลด sections ไม่สำเร็จ')
        }

        const items = (data.items ?? []) as SectionOption[]
        setSections(items)

        if (items.length > 0) {
          setSectionId(items[0].id)
        }
      } catch (e: any) {
        setStatus({
          type: 'error',
          text: e.message || 'โหลด sections ไม่สำเร็จ',
        })
      } finally {
        setLoadingSections(false)
      }
    })()
  })

  const sectionLabelMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of sections) {
      map.set(
        s.id,
        `${s.course_code ?? '-'} - Sec ${s.section_number ?? '-'}${
          s.term ? ` (${s.term})` : ''
        }`
      )
    }
    return map
  }, [sections])

  async function handleSubmit() {
    setStatus(null)

    if (!title.trim()) {
      setStatus({ type: 'error', text: 'กรุณากรอกชื่อ assignment' })
      return
    }

    if (workflowMode === 'course_assignment' && !sectionId) {
      setStatus({ type: 'error', text: 'กรุณาเลือก section' })
      return
    }

    setSubmitting(true)

    try {
      const body =
        workflowMode === 'course_assignment'
          ? {
              workflowMode,
              title: title.trim(),
              description: description.trim() || '',
              assignmentType,
              sectionId,
              weekNumber: weekNumber.trim() ? Number(weekNumber) : null,
              classDate: classDate || null,
              openAt: openAt || null,
              dueAt: dueAt || null,
              closeAt: closeAt || null,
              isOnlineClass,
            }
          : {
              workflowMode,
              title: title.trim(),
              description: description.trim() || '',
              assignmentType,
              termLabel: termLabel.trim() || '1/2026',
              classDate: classDate || null,
              openAt: openAt || null,
              dueAt: dueAt || null,
              closeAt: closeAt || null,
              isOnlineClass,
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

      if (!res.ok) {
        throw new Error(data.error || 'สร้าง assignment ไม่สำเร็จ')
      }

      setStatus({
        type: 'success',
        text: 'สร้าง assignment สำเร็จ กำลังนำไปยังหน้าถัดไป...',
      })

      router.push(data.redirectTo || `/instructor/assignments/${data.assignmentId}`)
    } catch (e: any) {
      setStatus({
        type: 'error',
        text: e.message || 'สร้าง assignment ไม่สำเร็จ',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">
            Create Assignment
          </h1>
          <p className="mt-2 text-lg text-slate-600">
            เลือกโหมดการสร้างโจทย์ ระหว่างรายวิชาปกติ และระบบตรวจข้อสอบแบบ
            standalone
          </p>
        </div>

        <Link
          href="/instructor/assignments"
          className="rounded-lg bg-slate-100 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-200"
        >
          กลับรายการ Assignments
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

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <button
          type="button"
          onClick={() => setWorkflowMode('course_assignment')}
          className={`rounded-2xl border p-6 text-left transition ${
            workflowMode === 'course_assignment'
              ? 'border-blue-500 bg-blue-50 shadow-sm'
              : 'border-slate-200 bg-white hover:bg-slate-50'
          }`}
        >
          <div className="text-lg font-bold text-slate-900">
            สร้างโจทย์ในรายวิชาที่มีอยู่
          </div>
          <div className="mt-2 text-sm text-slate-600">
            ใช้ section ที่ instructor ดูแลอยู่แล้ว เหมาะกับ assignment ปกติของรายวิชา
          </div>
        </button>

        <button
          type="button"
          onClick={() => setWorkflowMode('standalone_exam')}
          className={`rounded-2xl border p-6 text-left transition ${
            workflowMode === 'standalone_exam'
              ? 'border-emerald-500 bg-emerald-50 shadow-sm'
              : 'border-slate-200 bg-white hover:bg-slate-50'
          }`}
        >
          <div className="text-lg font-bold text-slate-900">
            สร้างชุดข้อสอบใหม่แบบ Standalone
          </div>
          <div className="mt-2 text-sm text-slate-600">
            ใช้สำหรับระบบตรวจข้อสอบ อัปโหลดรายชื่อ student id และอัปโหลดกระดาษคำตอบได้
          </div>
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <div className="text-xl font-bold text-slate-900">
            {workflowMode === 'course_assignment'
              ? 'Course Assignment Form'
              : 'Standalone Exam Form'}
          </div>
          <div className="mt-2 text-sm text-slate-600">
            {workflowMode === 'course_assignment'
              ? 'กรอกข้อมูล assignment ที่ผูกกับ section ปกติ'
              : 'กรอกข้อมูลสำหรับชุดข้อสอบที่ระบบจะสร้าง standalone section ให้โดยอัตโนมัติ'}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="ชื่อ Assignment / ชุดข้อสอบ">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
              placeholder="เช่น Midterm 1 - Handwritten Exam Demo"
            />
          </Field>

          <Field label="ประเภท">
            <select
              value={assignmentType}
              onChange={(e) => setAssignmentType(e.target.value as AssignmentType)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 bg-white"
            >
              <option value="weekly_exercise">weekly_exercise</option>
              <option value="quiz">quiz</option>
              <option value="midterm">midterm</option>
              <option value="final">final</option>
            </select>
          </Field>

          {workflowMode === 'course_assignment' ? (
            <Field label="Section">
              <select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                disabled={loadingSections}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 bg-white"
              >
                {loadingSections && <option>กำลังโหลด...</option>}
                {!loadingSections && sections.length === 0 && (
                  <option value="">ไม่พบ section</option>
                )}
                {!loadingSections &&
                  sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {sectionLabelMap.get(s.id)}
                    </option>
                  ))}
              </select>
            </Field>
          ) : (
            <Field label="Term Label">
              <input
                value={termLabel}
                onChange={(e) => setTermLabel(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-4 py-3"
                placeholder="เช่น 1/2026"
              />
            </Field>
          )}

          <Field label="Week Number">
            <input
              value={weekNumber}
              onChange={(e) => setWeekNumber(e.target.value)}
              disabled={workflowMode === 'standalone_exam'}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 disabled:bg-slate-100"
              placeholder="เช่น 3"
            />
          </Field>

          <Field label="Class Date">
            <input
              type="date"
              value={classDate}
              onChange={(e) => setClassDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
            />
          </Field>

          <Field label="Open At">
            <input
              type="datetime-local"
              value={openAt}
              onChange={(e) => setOpenAt(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
            />
          </Field>

          <Field label="Due At">
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
            />
          </Field>

          <Field label="Close At">
            <input
              type="datetime-local"
              value={closeAt}
              onChange={(e) => setCloseAt(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
            />
          </Field>

          <div className="md:col-span-2">
            <Field label="คำอธิบาย">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-4 py-3"
                placeholder="รายละเอียดเพิ่มเติม"
              />
            </Field>
          </div>

          <div className="md:col-span-2">
            <label className="inline-flex items-center gap-3">
              <input
                type="checkbox"
                checked={isOnlineClass}
                onChange={(e) => setIsOnlineClass(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium text-slate-700">
                เป็น online class
              </span>
            </label>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700 disabled:bg-blue-300"
          >
            {submitting ? 'กำลังสร้าง...' : 'Create and go to Files'}
          </button>

          <Link
            href="/instructor/assignments"
            className="rounded-lg bg-slate-100 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-200"
          >
            Cancel
          </Link>
        </div>
      </section>
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
    <div>
      <label className="mb-2 block text-sm font-bold text-slate-700">
        {label}
      </label>
      {children}
    </div>
  )
}