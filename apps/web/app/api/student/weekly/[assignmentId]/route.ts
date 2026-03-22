import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateMetaScore } from '@/lib/scoring/meta-score'

export const runtime = 'nodejs'

function buildEndOfDay(dateStr: string) {
  return `${dateStr}T23:59:59`
}

function buildEndOfFriday(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`)
  const day = d.getDay() // 0 Sun ... 5 Fri
  const diffToFriday = (5 - day + 7) % 7
  d.setDate(d.getDate() + diffToFriday)

  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')

  return `${yyyy}-${mm}-${dd}T23:59:59`
}

export async function GET(
  _: Request,
  context: { params: Promise<{ assignmentId: string }> }
) {
  const { assignmentId } = await context.params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1) ดึง assignment แบบใช้เฉพาะคอลัมน์ที่มีจริงก่อน
  const { data: assignment, error: aErr } = await supabase
    .from('assignments')
    .select(`
      id,
      section_id,
      title,
      assignment_type,
      week_number,
      class_date,
      open_at,
      due_at,
      close_at,
      end_of_friday_at,
      is_online_class
    `)
    .eq('id', assignmentId)
    .maybeSingle()

  if (aErr || !assignment) {
    return NextResponse.json(
      { error: aErr?.message || 'Assignment not found' },
      { status: 404 }
    )
  }

  // 2) เช็กว่า assignment นี้อยู่ใน section ของ student จริง
  const { data: studentSection, error: ssErr } = await supabase
    .from('student_sections')
    .select('section_id')
    .eq('student_id', user.id)
    .eq('section_id', assignment.section_id)
    .maybeSingle()

  if (ssErr) {
    return NextResponse.json({ error: ssErr.message }, { status: 500 })
  }

  if (!studentSection) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 3) ดึง submission ของ student คนนี้
  const { data: submission, error: subErr } = await supabase
    .from('submissions')
    .select(`
      id,
      status,
      current_stage,
      submitted_at,
      total_score,
      fraud_flag,
      extracted_paper_student_id
    `)
    .eq('assignment_id', assignmentId)
    .eq('student_id', user.id)
    .maybeSingle()

  if (subErr) {
    return NextResponse.json({ error: subErr.message }, { status: 500 })
  }

  // 4) ดึง grading results
  let grading = {
    total_final_score: 0,
    total_auto_score: 0,
    is_blank_any: false,
    roi_count: 0,
    ai_percentage: 0,
  }

  if (submission?.id) {
    const { data: grs, error: grErr } = await supabase
      .from('grading_results')
      .select('auto_score, final_score, is_blank')
      .eq('submission_id', submission.id)

    if (grErr) {
      return NextResponse.json({ error: grErr.message }, { status: 500 })
    }

    const list = grs ?? []
    const totalAutoScore = list.reduce((s, r) => s + Number(r.auto_score ?? 0), 0)
    const totalFinalScore = list.reduce((s, r) => s + Number(r.final_score ?? 0), 0)
    const isBlankAny = list.some((r) => r.is_blank === true)
    const roiCount = list.length

    const aiPercentage =
      roiCount > 0 && !isBlankAny
        ? Math.min(100, (totalAutoScore / roiCount) * 100)
        : 0

    grading = {
      total_final_score: totalFinalScore,
      total_auto_score: totalAutoScore,
      is_blank_any: isBlankAny,
      roi_count: roiCount,
      ai_percentage: aiPercentage,
    }
  }

  // 5) attendance แบบ fallback-safe
  let attendance = {
    has_checkin: false,
    is_on_time: null as boolean | null,
    check_in_time: null as string | null,
    session_id: null as string | null,
    starts_at: null as string | null,
    ends_at: null as string | null,
  }

  let classSession: {
    id: string
    starts_at: string | null
    ends_at: string | null
    class_date: string | null
  } | null = null

  if (assignment.section_id && assignment.class_date) {
    const { data: session } = await supabase
      .from('class_sessions')
      .select('id, starts_at, ends_at, class_date')
      .eq('section_id', assignment.section_id)
      .eq('class_date', assignment.class_date)
      .maybeSingle()

    if (session) {
      classSession = session

      const { data: checkin } = await supabase
        .from('attendance_checkins')
        .select('session_id, check_in_time, is_on_time')
        .eq('session_id', session.id)
        .eq('student_id', user.id)
        .maybeSingle()

      if (checkin) {
        attendance = {
          has_checkin: true,
          is_on_time: checkin.is_on_time ?? null,
          check_in_time: checkin.check_in_time ?? null,
          session_id: checkin.session_id ?? null,
          starts_at: session.starts_at ?? null,
          ends_at: session.ends_at ?? null,
        }
      } else {
        attendance = {
          has_checkin: false,
          is_on_time: null,
          check_in_time: null,
          session_id: session.id ?? null,
          starts_at: session.starts_at ?? null,
          ends_at: session.ends_at ?? null,
        }
      }
    }
  }

  // 6) meta score แบบใช้ default weights ก่อน
  const classEndsAt = classSession?.ends_at ?? null
  const endOfDay = assignment.class_date ? buildEndOfDay(assignment.class_date) : null
  const endOfFriday =
    assignment.class_date ? buildEndOfFriday(assignment.class_date) : null

  const meta = calculateMetaScore({
    assignmentType: assignment.assignment_type ?? 'weekly_exercise',
    isOnlineClass: assignment.is_online_class ?? false,
    weights: {
      attendance: 1.0,
      submitInClass: 1.5,
      submitSameDay: 1.0,
      submitLate: 0.5,
      accuracy: 2.5,
    },
    studentData: {
      isBlank: grading.is_blank_any,
      aiPercentage: grading.ai_percentage,
      submittedAt: submission?.submitted_at ?? null,
      attendanceOnTime: attendance.is_on_time,
    },
    timeWindows: {
      classEndsAt,
      endOfDay,
      endOfFriday,
    },
  })

  return NextResponse.json({
    assignment,
    submission: submission ?? {
      id: null,
      status: 'not_submitted',
      current_stage: null,
      submitted_at: null,
      total_score: 0,
      fraud_flag: false,
      extracted_paper_student_id: null,
    },
    grading,
    attendance,
    meta,
  })
}