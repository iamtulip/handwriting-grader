import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type CourseAssignmentPayload = {
  workflowMode: 'course_assignment'
  title: string
  description?: string
  assignmentType?: 'weekly_exercise' | 'quiz' | 'midterm' | 'final'
  sectionId: string
  weekNumber?: number | null
  classDate?: string | null
  openAt?: string | null
  dueAt?: string | null
  closeAt?: string | null
  isOnlineClass?: boolean
}

type StandaloneExamPayload = {
  workflowMode: 'standalone_exam'
  title: string
  description?: string
  assignmentType?: 'weekly_exercise' | 'quiz' | 'midterm' | 'final'
  termLabel?: string
  classDate?: string | null
  openAt?: string | null
  dueAt?: string | null
  closeAt?: string | null
  isOnlineClass?: boolean
}

type RequestPayload = CourseAssignmentPayload | StandaloneExamPayload

const ALLOWED_ASSIGNMENT_TYPES = new Set([
  'weekly_exercise',
  'quiz',
  'midterm',
  'final',
])

function asNullableText(value: unknown): string | null {
  const s = String(value ?? '').trim()
  return s.length > 0 ? s : null
}

function asAssignmentType(value: unknown) {
  const s = String(value ?? 'quiz').trim()
  if (ALLOWED_ASSIGNMENT_TYPES.has(s)) return s
  return 'quiz'
}

async function requireInstructorOrAdmin(supabase: any) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: me, error: meError } = await supabase
    .from('user_profiles')
    .select('id, role, full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (meError || !me) {
    return {
      error: NextResponse.json(
        { error: meError?.message || 'Profile not found' },
        { status: 500 }
      ),
    }
  }

  if (!['instructor', 'admin'].includes(me.role ?? 'student')) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { user, me }
}

async function canUseSection(
  supabase: any,
  userId: string,
  role: string,
  sectionId: string
) {
  if (role === 'admin') return true

  const { data, error } = await supabase
    .from('instructor_sections')
    .select('section_id')
    .eq('instructor_id', userId)
    .eq('section_id', sectionId)
    .maybeSingle()

  if (error) return false
  return !!data
}

export async function POST(req: Request) {
  const supabase = await createClient()

  const auth = await requireInstructorOrAdmin(supabase)
  if ('error' in auth) return auth.error

  let body: RequestPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const workflowMode = String(body?.workflowMode ?? '').trim()

  if (!['course_assignment', 'standalone_exam'].includes(workflowMode)) {
    return NextResponse.json(
      { error: 'workflowMode is required' },
      { status: 400 }
    )
  }

  const title = asNullableText(body.title)
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const description = asNullableText(body.description)
  const assignmentType = asAssignmentType(body.assignmentType)
  const classDate = asNullableText((body as any).classDate)
  const openAt = asNullableText((body as any).openAt)
  const dueAt = asNullableText((body as any).dueAt)
  const closeAt = asNullableText((body as any).closeAt)
  const isOnlineClass = Boolean((body as any).isOnlineClass ?? false)

  if (workflowMode === 'course_assignment') {
    const payload = body as CourseAssignmentPayload

    const sectionId = asNullableText(payload.sectionId)
    if (!sectionId) {
      return NextResponse.json({ error: 'sectionId is required' }, { status: 400 })
    }

    const allowed = await canUseSection(
      supabase,
      auth.user.id,
      auth.me.role,
      sectionId
    )

    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden section' }, { status: 403 })
    }

    const weekNumber =
      payload.weekNumber == null || Number.isNaN(Number(payload.weekNumber))
        ? null
        : Number(payload.weekNumber)

    const insertPayload = {
      title,
      description,
      answer_key: {},
      grading_config: {},
      due_at: dueAt,
      close_at: closeAt,
      assignment_type: assignmentType,
      section_id: sectionId,
      week_number: weekNumber,
      class_date: classDate,
      open_at: openAt,
      created_by_user_id: auth.user.id,
      created_by: auth.me.full_name ?? auth.user.email ?? auth.user.id,
      is_archived: false,
      is_online_class: isOnlineClass,
      workflow_mode: 'course_assignment',
    }

    const { data: created, error: createError } = await supabase
      .from('assignments')
      .insert(insertPayload)
      .select('id, section_id, workflow_mode')
      .single()

    if (createError || !created) {
      return NextResponse.json(
        { error: createError?.message || 'Create assignment failed' },
        { status: 500 }
      )
    }

    await supabase.from('assignment_scoring_policies').upsert(
      {
        assignment_id: created.id,
        updated_by_user_id: auth.user.id,
      },
      { onConflict: 'assignment_id' }
    )

    return NextResponse.json({
      ok: true,
      workflowMode: 'course_assignment',
      sectionId: created.section_id,
      assignmentId: created.id,
      redirectTo: `/instructor/assignments/${created.id}/files`,
    })
  }

  const payload = body as StandaloneExamPayload
  const termLabel = asNullableText(payload.termLabel) ?? '1/2026'

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'create_standalone_exam',
    {
      p_title: title,
      p_description: description,
      p_assignment_type: assignmentType,
      p_term: termLabel,
      p_created_by_user_id: auth.user.id,
      p_open_at: openAt,
      p_due_at: dueAt,
      p_close_at: closeAt,
      p_week_number: null,
      p_class_date: classDate,
      p_is_online_class: isOnlineClass,
    }
  )

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

 const row = Array.isArray(rpcData) ? rpcData[0] : null
if (!row?.out_assignment_id || !row?.out_section_id) {
  return NextResponse.json(
    { error: 'Standalone exam creation returned empty result' },
    { status: 500 }
  )
}

return NextResponse.json({
  ok: true,
  workflowMode: 'standalone_exam',
  sectionId: row.out_section_id,
  assignmentId: row.out_assignment_id,
  redirectTo: `/instructor/assignments/${row.out_assignment_id}/files`,
})

  return NextResponse.json({
    ok: true,
    workflowMode: 'standalone_exam',
    sectionId: row.section_id,
    assignmentId: row.assignment_id,
    redirectTo: `/instructor/assignments/${row.assignment_id}/files`,
  })
}