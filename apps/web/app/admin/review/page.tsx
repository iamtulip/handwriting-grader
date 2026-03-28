import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type SubmissionRow = {
  id: string
  assignment_id: string
  student_id: string
  status: string | null
  current_stage: string | null
  pipeline_version: string | null
  last_error: string | null
  auto_total_score: number | null
  final_total_score: number | null
  updated_at: string | null
}

function formatNullable(value: string | null | undefined) {
  return value && value.trim() !== '' ? value : '-'
}

function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '-'
  return String(value)
}

function badgeClass(value: string | null | undefined) {
  const v = (value ?? '').toLowerCase()

  if (v === 'approved') {
    return 'border-green-200 bg-green-100 text-green-800'
  }

  if (v === 'reviewing') {
    return 'border-blue-200 bg-blue-100 text-blue-800'
  }

  if (v === 'needs_review') {
    return 'border-yellow-200 bg-yellow-100 text-yellow-800'
  }

  if (v.includes('error') || v.includes('failed')) {
    return 'border-red-200 bg-red-100 text-red-800'
  }

  return 'border-slate-200 bg-slate-100 text-slate-700'
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString('th-TH')
  } catch {
    return value
  }
}

export default async function ReviewQueuePage() {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('submissions')
    .select(`
      id,
      assignment_id,
      student_id,
      status,
      current_stage,
      pipeline_version,
      last_error,
      auto_total_score,
      final_total_score,
      updated_at
    `)
    .in('status', ['needs_review', 'reviewing'])
    .order('updated_at', { ascending: false })
    .limit(200)

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto max-w-5xl rounded-2xl border border-red-200 bg-white p-6 text-red-700 shadow-sm">
          Failed to load review queue: {error.message}
        </div>
      </div>
    )
  }

  const rows = (data ?? []) as SubmissionRow[]

  const stats = {
    total: rows.length,
    needsReview: rows.filter((row) => row.status === 'needs_review').length,
    reviewing: rows.filter((row) => row.status === 'reviewing').length,
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Review Queue</h1>
              <p className="mt-2 text-sm text-slate-600">
                เปิดดู submission ที่ต้องตรวจทบทวน พร้อมเข้า inspector ได้ทันที
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/instructor/dashboard"
                className="inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                กลับ Dashboard
              </Link>

              <Link
                href="/instructor/assignments"
                className="inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                ไปหน้า Assignments
              </Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">ทั้งหมดในคิว</div>
            <div className="mt-2 text-3xl font-extrabold text-slate-900">{stats.total}</div>
          </div>

          <div className="rounded-2xl border border-yellow-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Needs Review</div>
            <div className="mt-2 text-3xl font-extrabold text-yellow-600">{stats.needsReview}</div>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Reviewing</div>
            <div className="mt-2 text-3xl font-extrabold text-blue-600">{stats.reviewing}</div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div className="text-lg font-bold text-slate-900">Submission Queue</div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-white">
                <tr className="text-slate-500">
                  <th className="px-4 py-3 text-left font-medium">Submission</th>
                  <th className="px-4 py-3 text-left font-medium">Assignment</th>
                  <th className="px-4 py-3 text-left font-medium">Student</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Stage</th>
                  <th className="px-4 py-3 text-left font-medium">Pipeline</th>
                  <th className="px-4 py-3 text-left font-medium">Scores</th>
                  <th className="px-4 py-3 text-left font-medium">Last Error</th>
                  <th className="px-4 py-3 text-left font-medium">Updated</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                      ไม่มี submission ใน review queue
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4">
                        <div className="font-mono text-xs text-slate-900">{row.id}</div>
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-mono text-xs text-slate-900">{row.assignment_id}</div>
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-mono text-xs text-slate-900">{row.student_id}</div>
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${badgeClass(
                            row.status
                          )}`}
                        >
                          {formatNullable(row.status)}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-slate-700">
                        {formatNullable(row.current_stage)}
                      </td>

                      <td className="px-4 py-4 text-slate-700">
                        {formatNullable(row.pipeline_version)}
                      </td>

                      <td className="px-4 py-4 text-slate-700">
                        <div>auto: {formatNumber(row.auto_total_score)}</div>
                        <div>final: {formatNumber(row.final_total_score)}</div>
                      </td>

                      <td className="px-4 py-4 text-slate-700">
                        <div className="max-w-[280px] whitespace-pre-wrap break-words text-xs">
                          {formatNullable(row.last_error)}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-slate-700">
                        {formatDateTime(row.updated_at)}
                      </td>

                      <td className="px-4 py-4 text-right">
                        <Link
                          href={`/admin/review/${row.id}`}
                          className="inline-flex rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                        >
                          Open Inspector
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}