import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { data: profile } = await supabase.from('user_profiles').select('student_id_number').eq('id', auth.user.id).maybeSingle()
    const { data: roster } = await supabase.from('official_rosters').select('section_id').eq('student_id_number', profile?.student_id_number).limit(1).maybeSingle()
    
    const sectionId = roster?.section_id
    if (!sectionId) return NextResponse.json({ items: [] })

    const { data: sessions } = await supabase
      .from('class_sessions')
      .select('id, class_date, starts_at, section_id')
      .eq('section_id', sectionId)
      .order('class_date', { ascending: false })
      .limit(50)

    const sessionIds = (sessions ?? []).map((s) => s.id)
    if (sessionIds.length === 0) return NextResponse.json({ items: [] })

    const { data: checkins } = await supabase
      .from('attendance_checkins')
      .select('session_id, check_in_time, is_on_time')
      .eq('student_id', auth.user.id)
      .in('session_id', sessionIds)

    const map = new Map<string, any>()
    for (const c of checkins ?? []) map.set(c.session_id, c)

    const items = (sessions ?? []).map((s) => {
      const c = map.get(s.id)
      return {
        class_date: s.class_date,
        starts_at: s.starts_at ?? null,
        check_in_time: c?.check_in_time ?? null,
        is_on_time: c?.is_on_time ?? null,
      }
    })

    return NextResponse.json({ items })
  } catch {
    // Fail-soft: ไม่พังแม้จะยังไม่ได้สร้างตารางเข้าเรียน
    return NextResponse.json({ items: [], note: 'ระบบบันทึกเวลาเรียนยังไม่เปิดใช้งานในรายวิชานี้ (MVP Mode)' })
  }
}