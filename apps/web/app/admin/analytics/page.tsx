//apps/web/app/admin/analytics/page.tsx
'use client'

import { useEffect, useState } from 'react'

export default function AdminAnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/admin/analytics', {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load analytics')
        setData(json)
      } catch (e: any) {
        setError(e.message || 'โหลด analytics ไม่สำเร็จ')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  if (loading) {
    return <div className="p-8">กำลังโหลด analytics...</div>
  }

  if (error) {
    return <div className="p-8 text-red-600">{error}</div>
  }

  const s = data?.stats ?? {}

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="border-b border-slate-200 pb-6">
        <h1 className="text-3xl font-extrabold text-slate-900">Admin Analytics</h1>
        <p className="text-slate-600 mt-2 text-lg">
          ภาพรวมการทำงานของระบบตรวจข้อสอบ
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card title="Sections" value={String(s.sections ?? 0)} />
        <Card title="Assignments" value={String(s.assignments ?? 0)} />
        <Card title="Submissions" value={String(s.submissions ?? 0)} />
        <Card title="Avg Score" value={String(s.avg_score ?? 0)} />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card title="Needs Review" value={String(s.needs_review ?? 0)} />
        <Card title="Graded" value={String(s.graded ?? 0)} />
        <Card title="Published" value={String(s.published ?? 0)} />
        <Card title="Appeals Open" value={String(s.appeals_open ?? 0)} />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card title="Instructors" value={String(s.instructors ?? 0)} />
        <Card title="Reviewers" value={String(s.reviewers ?? 0)} />
        <Card title="Students" value={String(s.students ?? 0)} />
        <Card title="OCR Processing" value={String(s.ocr_processing ?? 0)} />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Extraction Processing" value={String(s.extraction_processing ?? 0)} />
      </section>
    </div>
  )
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="text-sm text-slate-500 font-medium">{title}</div>
      <div className="text-3xl font-extrabold text-slate-900 mt-2">{value}</div>
    </div>
  )
}