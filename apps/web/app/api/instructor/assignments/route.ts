//apps/web/app/api/instructor/assignments/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: me } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const myRole = me?.role ?? 'student'
  if (!['instructor', 'admin'].includes(myRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const sectionId = url.searchParams.get('sectionId')
  const type = url.searchParams.get('type')
  const week = url.searchParams.get('week')

  let allowedSectionIds: string[] = []

  if (myRole === 'admin') {
    const { data: allSections } = await supabase
      .from('sections')
      .select('id')
      .limit(500)

    allowedSectionIds = (allSections ?? []).map((s) => s.id)
  } else {
    const { data: mine } = await supabase
      .from('instructor_sections')
      .select('section_id')
      .eq('instructor_id', user.id)

    allowedSectionIds = (mine ?? []).map((x) => x.section_id)
  }

  if (allowedSectionIds.length === 0) {
    return NextResponse.json({ items: [] })
  }

  let targetSectionIds = allowedSectionIds
  if (sectionId) {
    targetSectionIds = allowedSectionIds.includes(sectionId) ? [sectionId] : []
  }

  if (targetSectionIds.length === 0) {
    return NextResponse.json({ items: [] })
  }

  let query = supabase
    .from('v_instructor_assignment_summary')
    .select(`
      assignment_id,
      section_id,
      title,
      assignment_type,
      week_number,
      class_date,
      open_at,
      due_at,
      close_at,
      end_of_friday_at,
      submission_count,
      needs_review_count,
      graded_count,
      uploaded_count,
      ocr_pending_count,
      extract_pending_count,
      grade_pending_count,
      avg_total_score
    `)
    .in('section_id', targetSectionIds)
    .order('class_date', { ascending: false })

  if (type) {
    query = query.eq('assignment_type', type)
  }

  if (week && !Number.isNaN(Number(week))) {
    query = query.eq('week_number', Number(week))
  }

  const { data } = await query

  return NextResponse.json({ items: data ?? [] })
}