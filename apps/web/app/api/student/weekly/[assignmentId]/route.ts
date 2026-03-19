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
  { params }: { params: { assignmentId: string } }
) {
  const supabase = await createClient()

  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const assignmentId = params.assignmentId

  // 1) ดึง assignment
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
      close_at,
      is_online_class,
      weight_attendance,
      weight_submit_in_class,
      weight_submit_same_day,
      weight_submit_late,
      weight_accuracy
    `)
    .eq('id', assignmentId)
    .maybeSingle()

  if (aErr || !assignment) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  }

  // 2) เช็คว่า assignment นี้อยู่ใน section ของ student จริง
  const { data: studentSection } = await supabase
    .from('student_sections')
    .select('section_id')
    .eq('student_id', auth.user.id)
    .eq('section_id', assignment.section_id)
    .maybeSingle()

  if (!studentSection) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 3) ดึง submission ของ student คนนี้
  const { data: submission } = await supabase
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
    .eq('student_id', auth.user.id)
    .maybeSingle()

  // 4) ดึง grading results
  let grading = {
    total_final_score: 0,
    total_auto_score: 0,
    is_blank_any: false,
    roi_count: 0,
    ai_percentage: 0,
  }

  if (submission?.id) {
    const { data: grs } = await supabase
      .from('grading_results')
      .select('auto_score, final_score, is_blank')
      .eq('submission_id', submission.id)

    const list = grs ?? []

    const totalAutoScore = list.reduce((s, r) => s + Number(r.auto_score ?? 0), 0)
    const totalFinalScore = list.reduce((s, r) => s + Number(r.final_score ?? 0), 0)
    const isBlankAny = list.some((r) => r.is_blank === true)
    const roiCount = list.length

    // MVP heuristic:
    // ถ้ามี roi_count > 0 ให้คำนวณเปอร์เซ็นต์จาก auto_score / roi_count
    // (ภายหลังค่อยอัปเกรดเป็น max_points ต่อข้อจริง)
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

  // 5) ดึง attendance จริงจาก class_sessions + attendance_checkins
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
    starts_at: string
    ends_at: string
    class_date: string
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
        .eq('student_id', auth.user.id)
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

  // 6) meta score
  const classEndsAt = classSession?.ends_at ?? null
  const endOfDay = assignment.class_date ? buildEndOfDay(assignment.class_date) : null
  const endOfFriday = assignment.class_date ? buildEndOfFriday(assignment.class_date) : null

  const meta = calculateMetaScore({
    assignmentType: assignment.assignment_type ?? 'weekly_exercise',
    isOnlineClass: assignment.is_online_class ?? false,
    weights: {
      attendance: Number(assignment.weight_attendance ?? 1.0),
      submitInClass: Number(assignment.weight_submit_in_class ?? 1.5),
      submitSameDay: Number(assignment.weight_submit_same_day ?? 1.0),
      submitLate: Number(assignment.weight_submit_late ?? 0.5),
      accuracy: Number(assignment.weight_accuracy ?? 2.5),
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