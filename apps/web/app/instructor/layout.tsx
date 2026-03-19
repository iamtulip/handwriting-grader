import type { ReactNode } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function InstructorLayout({
  children,
}: {
  children: ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name, email, role')
    .eq('id', user.id)
    .maybeSingle()

  const role = profile?.role ?? 'student'

  if (!['instructor', 'admin'].includes(role)) {
    redirect('/student')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-72 bg-slate-950 text-white p-6 flex flex-col">
        <div>
          <div className="text-2xl font-black tracking-tight">
            Instructor Dashboard
          </div>
          <div className="text-sm text-slate-400 mt-1">
            Academic Operations
          </div>
        </div>

        <nav className="mt-10 space-y-2 text-sm">
          <Link
            href="/instructor"
            className="block rounded-lg px-3 py-2 hover:bg-slate-800 transition-colors"
          >
            Overview
          </Link>

          <Link
            href="/instructor/sections"
            className="block rounded-lg px-3 py-2 hover:bg-slate-800 transition-colors"
          >
            Sections
          </Link>

          <Link
            href="/instructor/assignments"
            className="block rounded-lg px-3 py-2 hover:bg-slate-800 transition-colors"
          >
            Assignments
          </Link>

          <Link
            href="/admin/roster"
            className="block rounded-lg px-3 py-2 hover:bg-slate-800 transition-colors"
          >
            Roster Upload
          </Link>
        </nav>

        <div className="mt-auto pt-8 border-t border-slate-800 text-sm">
          <div className="font-semibold">
            {profile?.full_name ?? 'Instructor'}
          </div>
          <div className="text-slate-400 break-all">
            {profile?.email ?? user.email}
          </div>
          <div className="text-sky-400 mt-1 uppercase tracking-wide text-xs">
            {role}
          </div>
        </div>
      </aside>

      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}