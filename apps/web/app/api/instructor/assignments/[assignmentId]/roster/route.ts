import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type RosterRowInput = {
  studentIdNumber?: string
  fullName?: string
  major?: string | null
}

function asText(value: unknown): string {
  return String(value ?? '').trim()
}

function asNullableText(value: unknown): string | null {
  const s = asText(value)
  return s.length > 0 ? s : null
}

function normalizeRosterRows(rows: unknown): Array<{
  student_id_number: string
  full_name: string
  major: string | null
}> {
  if (!Array.isArray(rows)) return []

  const seen = new Set<string>()
  const cleaned: Array<{
    student_id_number: string
    full_name: string
    major: string | null
  }> = []

  for (const row of rows as RosterRowInput[]) {
    const studentIdNumber = asText(row?.studentIdNumber)
    const fullName = asText(row?.fullName)
    const major = asNullableText(row?.major)

    if (!studentIdNumber || !fullName) continue
    if (seen.has(studentIdNumber)) continue

    seen.add(studentIdNumber)
    cleaned.push({
      student_id_number: studentIdNumber,
      full_name: fullName,
      major,
    })
  }

  return cleaned
}

async function requireInstructorOrAdmin(supabase: any) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
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
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return { user, me }
}

async function canManageAssignment(
  supabase: any,
  userId: string,
  role: string,
  assignmentId: string
) {
  if (role === 'admin') return true

  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, section_id, created_by')
    .eq('id', assignmentId)
    .maybeSingle()

  if (!assignment) return false

  if (assignment.created_by === userId) return true

  if (role === 'instructor') {
    const { data: access } = await supabase
      .from('instructor_sections')
      .select('section_id')
      .eq('instructor_id', userId)
      .eq('section_id', assignment.section_id)
      .maybeSingle()

    return !!access
  }

  return false
}

async function getAssignmentContext(supabase: any, assignmentId: string) {
  const { data: assignment, error: assignmentError } = await supabase
    .from('assignments')
    .select('id, title, section_id, workflow_mode, assignment_type')
    .eq('id', assignmentId)
    .maybeSingle()

  if (assignmentError || !assignment) {
    throw new Error(assignmentError?.message || 'Assignment not found')
  }

  const { data: section, error: sectionError } = await supabase
    .from('sections')
    .select('id, course_code, section_number, term, section_kind, is_system_generated')
    .eq('id', assignment.section_id)
    .maybeSingle()

  if (sectionError || !section) {
    throw new Error(sectionError?.message || 'Section not found')
  }

  return { assignment, section }
}

export async function GET(
  _: Request,
  context: { params: Promise<{ assignmentId: string }> }
) {
  const { assignmentId } = await context.params
  const supabase = await createClient()

  const auth = await requireInstructorOrAdmin(supabase)
  if ('error' in auth) return auth.error

  const allowed = await canManageAssignment(
    supabase,
    auth.user.id,
    auth.me.role,
    assignmentId
  )

  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { assignment, section } = await getAssignmentContext(
      supabase,
      assignmentId
    )

    const { data: rosterRows, error: rosterError } = await supabase
      .from('official_rosters')
      .select('id, section_id, student_id_number, full_name, major, uploaded_by, created_at')
      .eq('section_id', section.id)
      .order('full_name', { ascending: true })

    if (rosterError) {
      return NextResponse.json({ error: rosterError.message }, { status: 500 })
    }

    const studentIdNumbers = Array.from(
      new Set((rosterRows ?? []).map((row: any) => row.student_id_number).filter(Boolean))
    )

    let matchedProfiles: any[] = []

    if (studentIdNumbers.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('id, full_name, student_id_number')
        .in('student_id_number', studentIdNumbers)

      if (profilesError) {
        return NextResponse.json({ error: profilesError.message }, { status: 500 })
      }

      matchedProfiles = profiles ?? []
    }

    const profileMap = new Map<string, any>()
    for (const profile of matchedProfiles) {
      if (profile.student_id_number) {
        profileMap.set(profile.student_id_number, profile)
      }
    }

    const items = (rosterRows ?? []).map((row: any) => {
      const matched = profileMap.get(row.student_id_number) ?? null

      return {
        id: row.id,
        studentIdNumber: row.student_id_number,
        fullName: row.full_name,
        major: row.major ?? null,
        createdAt: row.created_at ?? null,
        matchedUserId: matched?.id ?? null,
        matchedUserFullName: matched?.full_name ?? null,
        matchStatus: matched ? 'matched' : 'unmatched',
      }
    })

    const summary = {
      totalRows: items.length,
      matchedRows: items.filter((x: any) => x.matchStatus === 'matched').length,
      unmatchedRows: items.filter((x: any) => x.matchStatus === 'unmatched').length,
    }

    return NextResponse.json({
      assignment: {
        id: assignment.id,
        title: assignment.title,
        workflowMode: assignment.workflow_mode ?? 'course_assignment',
        assignmentType: assignment.assignment_type ?? null,
      },
      section: {
        id: section.id,
        courseCode: section.course_code ?? null,
        sectionNumber: section.section_number ?? null,
        term: section.term ?? null,
        sectionKind: section.section_kind ?? 'course',
        isSystemGenerated: Boolean(section.is_system_generated ?? false),
      },
      summary,
      items,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Failed to load roster' },
      { status: 500 }
    )
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ assignmentId: string }> }
) {
  const { assignmentId } = await context.params
  const supabase = await createClient()

  const auth = await requireInstructorOrAdmin(supabase)
  if ('error' in auth) return auth.error

  const allowed = await canManageAssignment(
    supabase,
    auth.user.id,
    auth.me.role,
    assignmentId
  )

  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  let sectionId: string
  try {
    const ctx = await getAssignmentContext(supabase, assignmentId)
    sectionId = ctx.section.id
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const action = asText(body.action)

  if (action === 'add_one') {
    const studentIdNumber = asText(body.studentIdNumber)
    const fullName = asText(body.fullName)
    const major = asNullableText(body.major)

    if (!studentIdNumber || !fullName) {
      return NextResponse.json(
        { error: 'studentIdNumber and fullName are required' },
        { status: 400 }
      )
    }

    const { error: deleteError } = await supabase
      .from('official_rosters')
      .delete()
      .eq('section_id', sectionId)
      .eq('student_id_number', studentIdNumber)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    const { data, error } = await supabase
      .from('official_rosters')
      .insert({
        section_id: sectionId,
        student_id_number: studentIdNumber,
        full_name: fullName,
        major,
        uploaded_by: auth.user.id,
      })
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, action, id: data.id })
  }

  if (action === 'import_rows') {
    const rows = normalizeRosterRows(body.rows)
    const replaceAll = Boolean(body.replaceAll ?? false)

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No valid rows to import' },
        { status: 400 }
      )
    }

    if (replaceAll) {
      const { error: deleteAllError } = await supabase
        .from('official_rosters')
        .delete()
        .eq('section_id', sectionId)

      if (deleteAllError) {
        return NextResponse.json(
          { error: deleteAllError.message },
          { status: 500 }
        )
      }
    } else {
      const ids = rows.map((row) => row.student_id_number)

      const { error: deleteExistingError } = await supabase
        .from('official_rosters')
        .delete()
        .eq('section_id', sectionId)
        .in('student_id_number', ids)

      if (deleteExistingError) {
        return NextResponse.json(
          { error: deleteExistingError.message },
          { status: 500 }
        )
      }
    }

    const insertRows = rows.map((row) => ({
      section_id: sectionId,
      student_id_number: row.student_id_number,
      full_name: row.full_name,
      major: row.major,
      uploaded_by: auth.user.id,
    }))

    const { error: insertError } = await supabase
      .from('official_rosters')
      .insert(insertRows)

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      action,
      insertedCount: insertRows.length,
      replaceAll,
    })
  }

  if (action === 'delete_row') {
    const rosterId = asText(body.rosterId)

    if (!rosterId) {
      return NextResponse.json({ error: 'rosterId is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('official_rosters')
      .delete()
      .eq('id', rosterId)
      .eq('section_id', sectionId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, action, rosterId })
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
}