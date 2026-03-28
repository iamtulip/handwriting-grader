'use client'

import Link from 'next/link'
import { RosterUpload } from '../../components/roster/RosterUpload'

export default function AdminPage() {
  return (
    <div className="min-h-screen py-10 bg-slate-50">
      <div className="mx-auto max-w-6xl space-y-6 px-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Admin Console</h1>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/admin/review"
              className="inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Open Need Review Queue
            </Link>
          </div>
        </div>

        <RosterUpload />
      </div>
    </div>
  )
}