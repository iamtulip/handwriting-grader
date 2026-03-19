// apps/web/app/student/layout.tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()

  if (!data.user) redirect('/login')

  return (
    <div className="min-h-screen flex">
      <aside className="w-72 bg-slate-900 text-white p-6">
        <div className="mb-8">
          <div className="text-xl font-bold">Student Dashboard</div>
          <div className="text-xs text-slate-300 mt-1">Diamond V2 💎</div>
        </div>

        <nav className="space-y-2 text-sm">
          <Link className="block px-3 py-2 rounded hover:bg-slate-800 transition-colors" href="/student">Overview</Link>
          <Link className="block px-3 py-2 rounded hover:bg-slate-800 transition-colors" href="/student/weekly">Weekly Scores</Link>
          <Link className="block px-3 py-2 rounded hover:bg-slate-800 transition-colors" href="/student/attendance">Attendance</Link>
          <Link className="block px-3 py-2 rounded hover:bg-slate-800 transition-colors" href="/student/appeal">Appeal</Link>
        </nav>

        <div className="mt-10 text-xs text-slate-400">
          Logged in as <br/><span className="text-slate-200 font-semibold">{data.user.email}</span>
        </div>
      </aside>

      <main className="flex-1 bg-slate-50 p-6 md:p-10">{children}</main>
    </div>
  )
}