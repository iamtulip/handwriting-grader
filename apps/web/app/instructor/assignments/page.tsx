'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type AssignmentItem = {
  id: string
  title: string
  description: string | null
  assignment_type: string | null
  week_number: number | null
  class_date: string | null
  open_at: string | null
  due_at: string | null
  close_at: string | null
  end_of_friday_at: string | null
  section_id: string | null
  created_at: string | null
  updated_at: string | null
  course_code: string | null
  section_number: number | null
  term: string | null
  submission_count: number
  needs_review_count: number
  graded_count: number
  uploaded_count: number
  avg_total_score: number
  is_archived?: boolean
}

export default function InstructorAssignmentsPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AssignmentItem[]>([])
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [sectionFilter, setSectionFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [weekFilter, setWeekFilter] = useState<string>('all')
  const [search, setSearch] = useState<string>('')

  async function loadData() {
    const params = new URLSearchParams()

    if (sectionFilter !== 'all') params.set('sectionId', sectionFilter)
    if (typeFilter !== 'all') params.set('type', typeFilter)
    if (weekFilter !== 'all') params.set('week', weekFilter)

    const queryString = params.toString()
    const url = `/api/instructor/assignments${queryString ? `?${queryString}` : ''}`

    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || 'Failed to load assignments')
    }

    setItems(data.items ?? [])
  }

  useEffect(() => {
    const run = async () => {
      try {
        await loadData()
      } catch (e: any) {
        setStatus({ type: 'error', text: e.message || 'โหลด assignments ไม่สำเร็จ' })
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [sectionFilter, typeFilter, weekFilter])

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items

    return items.filter((item) => {
      const haystack = [
        item.title,
        item.description,
        item.course_code,
        item.term,
        item.assignment_type,
        item.week_number != null ? String(item.week_number) : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(q)
    })
  }, [items, search])

  const sectionOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of items) {
      if (item.section_id && item.course_code && item.section_number != null) {
        map.set(
          item.section_id,
          `${item.course_code} - Sec ${item.section_number}${item.term ? ` (${item.term})` : ''}`
        )
      }
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }))
  }, [items])

  const weekOptions = useMemo(() => {
    const set = new Set<number>()
    for (const item of items) {
      if (item.week_number != null) set.add(item.week_number)
    }
    return Array.from(set).sort((a, b) => a - b)
  }, [items])

  const stats = useMemo(() => {
    return {
      assignment_count: filteredItems.length,
      submission_count: filteredItems.reduce((sum, x) => sum + Number(x.submission_count ?? 0), 0),
      needs_review_count: filteredItems.reduce((sum, x) => sum + Number(x.needs_review_count ?? 0), 0),
      avg_total_score:
        filteredItems.length > 0
          ? filteredItems.reduce((sum, x) => sum + Number(x.avg_total_score ?? 0), 0) /
            filteredItems.length
          : 0,
    }
  }, [filteredItems])

  if (loading) {
    return <div className="p-8">กำลังโหลด assignments...</div>
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Assignments</h1>
          <p className="text-slate-600 mt-2 text-lg">
            จัดการงาน แบบฝึกหัด และข้อสอบของแต่ละ section
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/instructor/dashboard"
            className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-colors"
          >
            กลับ Dashboard
          </Link>

          <Link
            href="/instructor/assignments/new"
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors"
          >
            + Create Assignment
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
        <StatCard title="Assignments" value={String(stats.assignment_count)} />
        <StatCard title="Submissions" value={String(stats.submission_count)} />
        <StatCard
          title="Needs Review"
          value={String(stats.needs_review_count)}
          valueClassName="text-red-600"
        />
        <StatCard
          title="Avg Score"
          value={stats.avg_total_score.toFixed(2)}
          valueClassName="text-blue-600"
        />
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="font-bold text-slate-900 text-lg mb-4">Filters</div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Search</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่องาน / section / type"
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Section</label>
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 bg-white"
            >
              <option value="all">All Sections</option>
              {sectionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 bg-white"
            >
              <option value="all">All Types</option>
              <option value="weekly_exercise">weekly_exercise</option>
              <option value="quiz">quiz</option>
              <option value="midterm">midterm</option>
              <option value="final">final</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Week</label>
            <select
              value={weekFilter}
              onChange={(e) => setWeekFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 bg-white"
            >
              <option value="all">All Weeks</option>
              {weekOptions.map((week) => (
                <option key={week} value={String(week)}>
                  Week {week}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50">
          <div className="font-bold text-slate-900 text-lg">Assignment List</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200 text-slate-500">
              <tr>
                <th className="text-left p-4 font-medium">Title</th>
                <th className="text-left p-4 font-medium">Section</th>
                <th className="text-left p-4 font-medium">Type</th>
                <th className="text-left p-4 font-medium">Week</th>
                <th className="text-left p-4 font-medium">Class Date</th>
                <th className="text-left p-4 font-medium">Due</th>
                <th className="text-right p-4 font-medium">Submissions</th>
                <th className="text-right p-4 font-medium">Needs Review</th>
                <th className="text-right p-4 font-medium">Avg Score</th>
                <th className="text-right p-4 font-medium">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <div className="font-bold text-slate-900">{item.title}</div>
                    <div className="text-xs text-slate-500 mt-1">{item.id}</div>
                  </td>

                  <td className="p-4 text-slate-600">
                    {item.course_code && item.section_number != null
                      ? `${item.course_code} - Sec ${item.section_number}${item.term ? ` (${item.term})` : ''}`
                      : '-'}
                  </td>

                  <td className="p-4 text-slate-600">{item.assignment_type ?? '-'}</td>
                  <td className="p-4 text-slate-600">{item.week_number ?? '-'}</td>
                  <td className="p-4 text-slate-600">{item.class_date ?? '-'}</td>
                  <td className="p-4 text-slate-600">{formatDateTime(item.due_at)}</td>

                  <td className="p-4 text-right font-semibold text-slate-900">
                    {item.submission_count ?? 0}
                  </td>

                  <td className="p-4 text-right font-semibold text-red-600">
                    {item.needs_review_count ?? 0}
                  </td>

                  <td className="p-4 text-right font-semibold text-blue-600">
                    {Number(item.avg_total_score ?? 0).toFixed(2)}
                  </td>

                  <td className="p-4">
                    <div className="flex justify-end gap-2 flex-wrap">
                      <Link
                        href={`/instructor/assignments/${item.id}`}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                      >
                        Workspace
                      </Link>

                      <Link
                        href={`/instructor/assignments/${item.id}/files`}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                      >
                        Files
                      </Link>

                      <Link
                        href={`/instructor/assignments/${item.id}/answer-key`}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                      >
                        Answer Key
                      </Link>

                      <Link
                        href={`/instructor/assignments/${item.id}/layout`}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
                      >
                        Layout
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-10 text-center text-slate-500">
                    ไม่พบ assignment ตามเงื่อนไขที่เลือก
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
      <div className={`text-3xl font-extrabold mt-2 ${valueClassName}`}>{value}</div>
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