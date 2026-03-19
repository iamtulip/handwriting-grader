import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()

  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1) ใช้ student_sections เป็น source of truth
  const { data: studentSections } = await supabase
    .from('student_sections')
    .select('section_id')
    .eq('student_id', auth.user.id)

  const sectionIds = (studentSections ?? []).map((x) => x.section_id)

  if (sectionIds.length === 0) {
    return NextResponse.json({ items: [] })
  }

  // 2) ดึง assignments ของ section ที่นักศึกษาอยู่
  const { data: assignments } = await supabase
    .from('assignments')
    .select(`
      id,
      title,
      week_number,
      class_date,
      assignment_type,
      section_id,
      open_at,
      close_at,
      is_online_class,
      created_at
    `)
    .in('section_id', sectionIds)
    .order('class_date', { ascending: false })

  // 3) ดึง submissions ของนักศึกษาคนนี้
  const { data: subs } = await supabase
    .from('submissions')
    .select(`
      assignment_id,
      status,
      total_score,
      submitted_at,
      fraud_flag
    `)
    .eq('student_id', auth.user.id)

  const subMap = new Map<string, any>()
  for (const s of subs ?? []) {
    subMap.set(s.assignment_id, s)
  }

  // 4) merge ข้อมูล
  const items = (assignments ?? []).map((a) => {
    const s = subMap.get(a.id)

    return {
      assignment_id: a.id,
      title: a.title ?? `Assignment ${a.week_number ?? ''}`,
      assignment_type: a.assignment_type ?? 'weekly_exercise',
      week_number: a.week_number ?? null,
      class_date: a.class_date ?? null,
      section_id: a.section_id ?? null,
      open_at: a.open_at ?? null,
      close_at: a.close_at ?? null,
      is_online_class: a.is_online_class ?? false,
      status: s?.status ?? 'not_submitted',
      total_score: s?.total_score ?? 0,
      submitted_at: s?.submitted_at ?? null,
      fraud_flag: s?.fraud_flag ?? false,
    }
  })

  return NextResponse.json({ items })
}