//apps/web/app/api/admin/analytics/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: me, error: meError } = await supabase
    .from('user_profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (meError) {
    return NextResponse.json({ error: meError.message }, { status: 500 })
  }

  if ((me?.role ?? 'student') !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [
    sectionsRes,
    assignmentsRes,
    submissionsRes,
    appealsRes,
    usersRes,
    ocrJobsRes,
    extractionJobsRes,
  ] = await Promise.all([
    supabase.from('sections').select('id', { count: 'exact', head: true }),
    supabase.from('assignments').select('id', { count: 'exact', head: true }),
    supabase.from('submissions').select('id, status, total_score'),
    supabase.from('appeals').select('id, status'),
    supabase.from('user_profiles').select('id, role'),
    supabase.from('ocr_jobs').select('id, status'),
    supabase.from('extraction_jobs').select('id, status'),
  ])

  if (submissionsRes.error) {
    return NextResponse.json({ error: submissionsRes.error.message }, { status: 500 })
  }

  const submissions = submissionsRes.data ?? []
  const appeals = appealsRes.data ?? []
  const users = usersRes.data ?? []
  const ocrJobs = ocrJobsRes.data ?? []
  const extractionJobs = extractionJobsRes.data ?? []

  const avgScore =
    submissions.length > 0
      ? submissions.reduce((sum, s: any) => sum + Number(s.total_score ?? 0), 0) /
        submissions.length
      : 0

  return NextResponse.json({
    profile: {
      full_name: me?.full_name ?? 'Admin',
      role: 'admin',
    },
    stats: {
      sections: sectionsRes.count ?? 0,
      assignments: assignmentsRes.count ?? 0,
      submissions: submissions.length,
      needs_review: submissions.filter((x: any) => x.status === 'needs_review').length,
      graded: submissions.filter((x: any) => x.status === 'graded').length,
      published: submissions.filter((x: any) => x.status === 'published').length,
      appeals_open: appeals.filter((x: any) => ['open', 'in_review'].includes(x.status)).length,
      avg_score: Number(avgScore.toFixed(2)),
      instructors: users.filter((x: any) => x.role === 'instructor').length,
      reviewers: users.filter((x: any) => x.role === 'reviewer').length,
      students: users.filter((x: any) => x.role === 'student').length,
      ocr_processing: ocrJobs.filter((x: any) => x.status === 'processing').length,
      extraction_processing: extractionJobs.filter((x: any) => x.status === 'processing').length,
    },
  })
}