//apps/web/app/student/assignments/[assignmentId]/result/page.tsx
'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

export default function StudentResultPage() {
  const params = useParams<{ assignmentId: string }>()
  const assignmentId = params.assignmentId

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [status, setStatus] = useState<string>('')

  async function loadData() {
    const res = await fetch(`/api/student/assignments/${assignmentId}/result`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })

    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to load result')

    setData(json)
  }

  useEffect(() => {
    const run = async () => {
      try {
        await loadData()
      } catch (e: any) {
        setStatus(e.message || 'โหลดผลคะแนนไม่สำเร็จ')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [assignmentId])

  if (loading) {
    return <div className="p-8">กำลังโหลดผลคะแนน...</div>
  }

  if (!data) {
    return <div className="p-8 text-red-600">{status || 'ไม่พบข้อมูลผลคะแนน'}</div>
  }

  const submission = data.submission
  const assignment = submission.assignments
  const section = assignment.sections
  const results = data.results ?? []
  const appeals = data.appeals ?? []

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Result</h1>
          <p className="text-slate-600 mt-2 text-lg">{assignment?.title ?? '-'}</p>
          <div className="text-sm text-slate-500 mt-2">
            {section?.course_code} - Sec {section?.section_number} ({section?.term})
          </div>
        </div>

        <div className="flex gap-3">
          <Link
            href="/student/results"
            className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
          >
            กลับหน้าผลคะแนน
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card title="Status" value={submission?.status ?? '-'} />
        <Card title="Total Score" value={String(submission?.total_score ?? 0)} />
        <Card title="Current Stage" value={submission?.current_stage ?? '-'} />
        <Card title="Submitted At" value={formatDateTime(submission?.submitted_at)} />
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50">
          <div className="font-bold text-slate-900 text-lg">Result Breakdown</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200 text-slate-500">
              <tr>
                <th className="text-left p-4 font-medium">Item</th>
                <th className="text-left p-4 font-medium">Page</th>
                <th className="text-left p-4 font-medium">Detected Answer</th>
                <th className="text-right p-4 font-medium">Auto Score</th>
                <th className="text-right p-4 font-medium">Final Score</th>
                <th className="text-left p-4 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.map((row: any) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="p-4 font-semibold text-slate-900">{row.item_no}</td>
                  <td className="p-4 text-slate-600">{row.page_number ?? '-'}</td>
                  <td className="p-4 text-slate-600">{row.extracted_normalized ?? '-'}</td>
                  <td className="p-4 text-right text-slate-700">{row.auto_score ?? 0}</td>
                  <td className="p-4 text-right font-bold text-blue-600">{row.final_score ?? 0}</td>
                  <td className="p-4 text-slate-600">
                    {row.reviewer_notes ?? row.manual_reason ?? (row.is_human_override ? 'Manual override' : '-')}
                  </td>
                </tr>
              ))}

              {results.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-slate-500">
                    ยังไม่มีรายละเอียดผลคะแนน
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="font-bold text-slate-900 text-lg">Appeals</div>
          <Link
            href="/student/appeal"
            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700"
          >
            ยื่นคำร้อง
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200 text-slate-500">
              <tr>
                <th className="text-left p-4 font-medium">Created At</th>
                <th className="text-left p-4 font-medium">Reason</th>
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-left p-4 font-medium">Resolution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {appeals.map((appeal: any) => (
                <tr key={appeal.id} className="hover:bg-slate-50">
                  <td className="p-4 text-slate-600">{formatDateTime(appeal.created_at)}</td>
                  <td className="p-4 text-slate-600">{appeal.reason}</td>
                  <td className="p-4 text-slate-600">{appeal.status}</td>
                  <td className="p-4 text-slate-600">{appeal.resolution_notes ?? '-'}</td>
                </tr>
              ))}

              {appeals.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-10 text-center text-slate-500">
                    ยังไม่มีคำร้องสำหรับงานนี้
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

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="text-sm text-slate-500 font-medium">{title}</div>
      <div className="text-xl font-extrabold text-slate-900 mt-2">{value}</div>
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