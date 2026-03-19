import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()

  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1) ดึง profile จาก user_profiles
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name, student_id_number, registration_status')
    .eq('id', auth.user.id)
    .maybeSingle()

  // 2) ใช้ student_sections เป็น source of truth
  const { data: studentSections } = await supabase
    .from('student_sections')
    .select('section_id')
    .eq('student_id', auth.user.id)

  const sectionIds = (studentSections ?? []).map((x) => x.section_id)
  const primarySectionId = sectionIds[0] ?? null

  // 3) ดึง assignments ของ section ที่นักศึกษาอยู่
  let assignments: any[] = []
  if (sectionIds.length > 0) {
    const { data } = await supabase
      .from('assignments')
      .select('id, title, week_number, class_date, assignment_type, open_at, close_at, created_at')
      .in('section_id', sectionIds)
      .order('class_date', { ascending: false })
      .limit(50)

    assignments = data ?? []
  }

  // 4) ดึง submissions ของนักศึกษาคนนี้
  const { data: subs } = await supabase
    .from('submissions')
    .select('id, assignment_id, status, current_stage, total_score, submitted_at, created_at, fraud_flag')
    .eq('student_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const subMap = new Map<string, any>()
  for (const s of subs ?? []) {
    subMap.set(s.assignment_id, s)
  }

  // 5) merge สำหรับ recent overview
  const merged = assignments.map((a) => {
    const s = subMap.get(a.id)
    return {
      assignment_id: a.id,
      title: a.title ?? `Assignment ${a.week_number ?? ''}`,
      week_number: a.week_number ?? null,
      class_date: a.class_date ?? null,
      status: s?.status ?? 'not_submitted',
      total_score: s?.total_score ?? 0,
      submitted_at: s?.submitted_at ?? null,
      fraud_flag: s?.fraud_flag ?? false,
      needs_review:
        s?.status === 'needs_review' ||
        s?.current_stage === 'review_required',
    }
  })

  const totalAssignments = assignments.length
  const submittedCount = (subs ?? []).length
  const needsReviewCount = merged.filter((x) => x.needs_review).length
  const fraudCount = (subs ?? []).filter((x) => x.fraud_flag === true).length

  const avgScore =
    submittedCount > 0
      ? (subs ?? []).reduce((sum, x) => sum + (x.total_score ?? 0), 0) / submittedCount
      : 0

  return NextResponse.json({
    profile: {
      full_name: profile?.full_name ?? 'Student',
      student_id_number: profile?.student_id_number ?? '-',
      registration_status: profile?.registration_status ?? 'pending',
      section_id: primarySectionId,
    },
    stats: {
      totalAssignments,
      submittedCount,
      avgScore,
      needsReviewCount,
      fraudCount,
    },
    recent: merged.slice(0, 10),
  })
}