'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

type StatusMessage = {
  type: 'success' | 'error'
  text: string
}

type RosterItem = {
  id: string
  studentIdNumber: string
  fullName: string
  major: string | null
  createdAt: string | null
  matchedUserId: string | null
  matchedUserFullName: string | null
  matchStatus: 'matched' | 'unmatched'
}

type RosterResponse = {
  assignment: {
    id: string
    title: string
    workflowMode: 'course_assignment' | 'standalone_exam'
    assignmentType: string | null
  }
  section: {
    id: string
    courseCode: string | null
    sectionNumber: number | null
    term: string | null
    sectionKind: 'course' | 'standalone_exam'
    isSystemGenerated: boolean
  }
  summary: {
    totalRows: number
    matchedRows: number
    unmatchedRows: number
  }
  items: RosterItem[]
}

type ParsedImportRow = {
  studentIdNumber: string
  fullName: string
  major?: string | null
}

function parseRosterText(input: string): ParsedImportRow[] {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return []

  const cleaned = lines.filter((line, index) => {
    if (index !== 0) return true
    const lower = line.toLowerCase()
    return !(
      lower.includes('student_id') ||
      lower.includes('student id') ||
      lower.includes('studentid') ||
      lower.includes('full_name') ||
      lower.includes('full name') ||
      line.includes('รหัส') ||
      line.includes('ชื่อ')
    )
  })

  const rows: ParsedImportRow[] = []
  const seen = new Set<string>()

  for (const line of cleaned) {
    const parts = line.includes('\t')
      ? line.split('\t')
      : line.split(',')

    const studentIdNumber = String(parts[0] ?? '').trim()
    const fullName = String(parts[1] ?? '').trim()
    const major = String(parts[2] ?? '').trim() || null

    if (!studentIdNumber || !fullName) continue
    if (seen.has(studentIdNumber)) continue

    seen.add(studentIdNumber)
    rows.push({
      studentIdNumber,
      fullName,
      major,
    })
  }

  return rows
}

export default function AssignmentRosterPage() {
  const params = useParams<{ assignmentId: string }>()
  const assignmentId = params?.assignmentId

  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [data, setData] = useState<RosterResponse | null>(null)

  const [studentIdNumber, setStudentIdNumber] = useState('')
  const [fullName, setFullName] = useState('')
  const [major, setMajor] = useState('')
  const [adding, setAdding] = useState(false)

  const [importText, setImportText] = useState('')
  const [replaceAll, setReplaceAll] = useState(false)
  const [importing, setImporting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!assignmentId) return

    void (async () => {
      try {
        setLoading(true)
        const res = await fetch(
          `/api/instructor/assignments/${assignmentId}/roster`,
          {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
          }
        )

        const payload = await res.json()

        if (!res.ok) {
          throw new Error(payload.error || 'โหลด roster ไม่สำเร็จ')
        }

        setData(payload)
      } catch (e: any) {
        setStatus({
          type: 'error',
          text: e.message || 'โหลด roster ไม่สำเร็จ',
        })
      } finally {
        setLoading(false)
      }
    })()
  }, [assignmentId, refreshKey])

  const parsedRows = useMemo(() => parseRosterText(importText), [importText])

  async function refresh() {
    setRefreshKey((v) => v + 1)
  }

  async function handleAddOne() {
    if (!assignmentId) return

    setStatus(null)

    if (!studentIdNumber.trim() || !fullName.trim()) {
      setStatus({
        type: 'error',
        text: 'กรุณากรอก Student ID และชื่อ',
      })
      return
    }

    setAdding(true)

    try {
      const res = await fetch(
        `/api/instructor/assignments/${assignmentId}/roster`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            action: 'add_one',
            studentIdNumber: studentIdNumber.trim(),
            fullName: fullName.trim(),
            major: major.trim() || null,
          }),
        }
      )

      const payload = await res.json()

      if (!res.ok) {
        throw new Error(payload.error || 'เพิ่มรายชื่อไม่สำเร็จ')
      }

      setStatus({
        type: 'success',
        text: 'เพิ่มรายชื่อสำเร็จ',
      })

      setStudentIdNumber('')
      setFullName('')
      setMajor('')
      await refresh()
    } catch (e: any) {
      setStatus({
        type: 'error',
        text: e.message || 'เพิ่มรายชื่อไม่สำเร็จ',
      })
    } finally {
      setAdding(false)
    }
  }

  async function handleImport() {
    if (!assignmentId) return

    setStatus(null)

    if (parsedRows.length === 0) {
      setStatus({
        type: 'error',
        text: 'ไม่พบข้อมูลที่ import ได้',
      })
      return
    }

    setImporting(true)

    try {
      const res = await fetch(
        `/api/instructor/assignments/${assignmentId}/roster`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            action: 'import_rows',
            rows: parsedRows,
            replaceAll,
          }),
        }
      )

      const payload = await res.json()

      if (!res.ok) {
        throw new Error(payload.error || 'import roster ไม่สำเร็จ')
      }

      setStatus({
        type: 'success',
        text: `นำเข้ารายชื่อสำเร็จ ${payload.insertedCount ?? parsedRows.length} รายการ`,
      })

      setImportText('')
      setReplaceAll(false)
      await refresh()
    } catch (e: any) {
      setStatus({
        type: 'error',
        text: e.message || 'import roster ไม่สำเร็จ',
      })
    } finally {
      setImporting(false)
    }
  }

  async function handleDelete(rosterId: string) {
    if (!assignmentId) return

    const confirmed = window.confirm('ต้องการลบรายชื่อนี้ใช่หรือไม่')
    if (!confirmed) return

    setDeletingId(rosterId)
    setStatus(null)

    try {
      const res = await fetch(
        `/api/instructor/assignments/${assignmentId}/roster`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            action: 'delete_row',
            rosterId,
          }),
        }
      )

      const payload = await res.json()

      if (!res.ok) {
        throw new Error(payload.error || 'ลบรายชื่อไม่สำเร็จ')
      }

      setStatus({
        type: 'success',
        text: 'ลบรายชื่อสำเร็จ',
      })

      await refresh()
    } catch (e: any) {
      setStatus({
        type: 'error',
        text: e.message || 'ลบรายชื่อไม่สำเร็จ',
      })
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return <div className="p-8">กำลังโหลด roster...</div>
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Roster</h1>
          <p className="mt-2 text-lg text-slate-600">
            จัดการรายชื่อผู้เข้าสอบสำหรับ assignment นี้
          </p>

          {data ? (
            <div className="mt-3 space-y-1 text-sm text-slate-600">
              <div>
                <span className="font-semibold text-slate-800">Assignment:</span>{' '}
                {data.assignment.title}
              </div>
              <div>
                <span className="font-semibold text-slate-800">Workflow:</span>{' '}
                {data.assignment.workflowMode}
              </div>
              <div>
                <span className="font-semibold text-slate-800">Section:</span>{' '}
                {data.section.courseCode} - Sec {data.section.sectionNumber}{' '}
                {data.section.term ? `(${data.section.term})` : ''}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/instructor/assignments"
            className="rounded-lg bg-slate-100 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-200"
          >
            กลับ Assignments
          </Link>

          {assignmentId ? (
            <Link
              href={`/instructor/assignments/${assignmentId}`}
              className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-800"
            >
              เปิด Assignment
            </Link>
          ) : null}
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

      {data ? (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard label="จำนวนรายชื่อ" value={data.summary.totalRows} />
            <StatCard
              label="จับคู่กับ user_profiles ได้"
              value={data.summary.matchedRows}
              tone="emerald"
            />
            <StatCard
              label="ยังไม่ match"
              value={data.summary.unmatchedRows}
              tone="amber"
            />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <div className="text-xl font-bold text-slate-900">เพิ่มรายชื่อทีละคน</div>
              <div className="mt-2 text-sm text-slate-600">
                ใช้สำหรับเพิ่มหรือแก้ไขรายชื่อบางคนอย่างรวดเร็ว
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Student ID">
                <input
                  value={studentIdNumber}
                  onChange={(e) => setStudentIdNumber(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                  placeholder="เช่น 6612345678"
                />
              </Field>

              <Field label="Full Name">
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                  placeholder="ชื่อ-นามสกุล"
                />
              </Field>

              <Field label="Major">
                <input
                  value={major}
                  onChange={(e) => setMajor(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                  placeholder="สาขา (ถ้ามี)"
                />
              </Field>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={handleAddOne}
                disabled={adding}
                className="rounded-lg bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700 disabled:bg-blue-300"
              >
                {adding ? 'กำลังบันทึก...' : 'เพิ่มรายชื่อ'}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <div className="text-xl font-bold text-slate-900">Import รายชื่อแบบหลายรายการ</div>
              <div className="mt-2 text-sm text-slate-600">
                วางข้อมูลทีละบรรทัดในรูปแบบ
                <span className="mx-1 font-mono">student_id, full_name, major</span>
                หรือใช้ tab คั่นคอลัมน์ก็ได้
              </div>
            </div>

            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={10}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 font-mono text-sm"
              placeholder={`6612345678, Student A, Mathematics
6612345680, Student B, Mathematics`}
            />

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={replaceAll}
                  onChange={(e) => setReplaceAll(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium text-slate-700">
                  ลบ roster เดิมทั้งหมดก่อน import
                </span>
              </label>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                ตรวจพบ {parsedRows.length} รายการ
              </span>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={handleImport}
                disabled={importing}
                className="rounded-lg bg-emerald-600 px-5 py-3 font-bold text-white hover:bg-emerald-700 disabled:bg-emerald-300"
              >
                {importing ? 'กำลัง import...' : 'Import Roster'}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50 p-5">
              <div className="font-bold text-slate-900 text-lg">Roster List</div>
              <div className="mt-1 text-sm text-slate-600">
                รายชื่อที่อยู่ใน official roster ของ section นี้
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-white text-slate-500">
                  <tr>
                    <th className="p-4 text-left font-medium">Student ID</th>
                    <th className="p-4 text-left font-medium">ชื่อ</th>
                    <th className="p-4 text-left font-medium">Major</th>
                    <th className="p-4 text-left font-medium">Match Status</th>
                    <th className="p-4 text-left font-medium">Matched User</th>
                    <th className="p-4 text-right font-medium">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {data.items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="p-4 font-medium text-slate-900">
                        {item.studentIdNumber}
                      </td>
                      <td className="p-4 text-slate-700">{item.fullName}</td>
                      <td className="p-4 text-slate-700">{item.major ?? '-'}</td>
                      <td className="p-4">
                        {item.matchStatus === 'matched' ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                            matched
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                            unmatched
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-slate-700">
                        {item.matchedUserFullName ?? '-'}
                      </td>
                      <td className="p-4">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            disabled={deletingId === item.id}
                            className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:bg-red-300"
                          >
                            {deletingId === item.id ? 'กำลังลบ...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {data.items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-slate-500">
                        ยังไม่มีรายชื่อใน roster
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
            <div className="text-sm font-semibold text-sky-900">
              หมายเหตุ
            </div>
            <div className="mt-2 text-sm text-sky-800">
              รายชื่อที่แสดงว่า <span className="font-semibold">matched</span>{' '}
              คือ student id ที่พบใน <span className="font-mono">user_profiles.student_id_number</span>{' '}
              แล้ว ซึ่งสำคัญมากเพราะเวลาสร้าง submission จริง ระบบจะต้องอ้างไปที่
              <span className="mx-1 font-mono">user_profiles.id</span>
              เพื่อให้ pipeline ตรวจข้อสอบทำงานต่อได้
            </div>
          </section>
        </>
      ) : null}
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

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string | number
  tone?: 'default' | 'emerald' | 'amber'
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50'
      : tone === 'amber'
      ? 'border-amber-200 bg-amber-50'
      : 'border-slate-200 bg-white'

  return (
    <div className={`rounded-xl border p-5 shadow-sm ${toneClass}`}>
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-extrabold text-slate-900">{value}</div>
    </div>
  )
}