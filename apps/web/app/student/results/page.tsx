//apps/web/app/student/results/page.tsx
'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function StudentResultsPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<any[]>([])
  const [status, setStatus] = useState('')

  async function loadData() {
    const res = await fetch('/api/student/weekly', {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })

    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to load results')

    const publishedOnly = (json.items ?? []).filter((x: any) => x.status === 'published')
    setItems(publishedOnly)
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
  }, [])

  if (loading) {
    return <div className="p-8">กำลังโหลดผลคะแนน...</div>
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <header className="border-b border-slate-200 pb-6">
        <h1 className="text-3xl font-extrabold text-slate-900">Published Results</h1>
        <p className="text-slate-600 mt-2 text-lg">ผลคะแนนที่เผยแพร่แล้ว</p>
      </header>

      {status && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {status}
        </div>
      )}

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200 text-slate-500">
              <tr>
                <th className="text-left p-4 font-medium">Week</th>
                <th className="text-left p-4 font-medium">Title</th>
                <th className="text-left p-4 font-medium">Type</th>
                <th className="text-left p-4 font-medium">Class Date</th>
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-right p-4 font-medium">Score</th>
                <th className="text-right p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item: any) => (
                <tr key={item.assignment_id} className="hover:bg-slate-50">
                  <td className="p-4 text-slate-600">{item.week_number ?? '-'}</td>
                  <td className="p-4 font-semibold text-slate-900">{item.title}</td>
                  <td className="p-4 text-slate-600">{item.assignment_type ?? '-'}</td>
                  <td className="p-4 text-slate-600">{item.class_date ?? '-'}</td>
                  <td className="p-4 text-slate-600">{item.status ?? '-'}</td>
                  <td className="p-4 text-right font-bold text-blue-600">
                    {Number(item.total_score ?? 0).toFixed(2)}
                  </td>
                  <td className="p-4 text-right">
                    <Link
                      href={`/student/assignments/${item.assignment_id}/result`}
                      className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                    >
                      ดูรายละเอียด
                    </Link>
                  </td>
                </tr>
              ))}

              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-500">
                    ยังไม่มีผลคะแนนที่เผยแพร่
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