//apps/web/app/api/student/assignments/[assignmentId]/submit/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const BUCKET = 'submission-files'

async function canStudentAccessAssignment(
  supabase: any,
  userId: string,
  assignmentId: string
) {
  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, section_id, open_at, due_at, close_at, title')
    .eq('id', assignmentId)
    .maybeSingle()

  if (!assignment) {
    return { allowed: false, assignment: null }
  }

  const { data: membership } = await supabase
    .from('student_sections')
    .select('id')
    .eq('student_id', userId)
    .eq('section_id', assignment.section_id)
    .maybeSingle()

  return {
    allowed: !!membership,
    assignment,
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ assignmentId: string }> }
) {
  const { assignmentId } = await context.params
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
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (meError) {
    return NextResponse.json({ error: meError.message }, { status: 500 })
  }

  if ((me?.role ?? 'student') !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const access = await canStudentAccessAssignment(supabase, user.id, assignmentId)
  if (!access.allowed || !access.assignment) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now = new Date()
  const openAt = access.assignment.open_at ? new Date(access.assignment.open_at) : null
  const closeAt = access.assignment.close_at ? new Date(access.assignment.close_at) : null

  if (openAt && now < openAt) {
    return NextResponse.json({ error: 'Assignment is not open yet' }, { status: 400 })
  }

  if (closeAt && now > closeAt) {
    return NextResponse.json({ error: 'Assignment is already closed' }, { status: 400 })
  }

  const formData = await req.formData()
  const files = formData.getAll('files')

  if (!files.length) {
    return NextResponse.json({ error: 'At least one file is required' }, { status: 400 })
  }

  const normalizedFiles = files.filter((f): f is File => f instanceof File)
  if (normalizedFiles.length === 0) {
    return NextResponse.json({ error: 'Invalid files' }, { status: 400 })
  }

  // create or reuse submission row
  let submissionId: string | null = null

  const { data: existingSubmission, error: existingSubmissionError } = await supabase
    .from('submissions')
    .select('id')
    .eq('assignment_id', assignmentId)
    .eq('student_id', user.id)
    .maybeSingle()

  if (existingSubmissionError) {
    return NextResponse.json({ error: existingSubmissionError.message }, { status: 500 })
  }

  if (existingSubmission?.id) {
    submissionId = existingSubmission.id

    // remove old submission_files rows and storage objects first
    const { data: oldFiles } = await supabase
      .from('submission_files')
      .select('id, storage_path')
      .eq('submission_id', submissionId)

    const oldPaths = (oldFiles ?? []).map((x: any) => x.storage_path).filter(Boolean)
    if (oldPaths.length > 0) {
      await supabase.storage.from(BUCKET).remove(oldPaths)
    }

    await supabase.from('submission_files').delete().eq('submission_id', submissionId)

    await supabase
      .from('submissions')
      .update({
        status: 'uploaded',
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        current_stage: 'upload_completed',
        fraud_flag: false,
        extracted_paper_student_id: null,
      })
      .eq('id', submissionId)
  } else {
    const { data: createdSubmission, error: createSubmissionError } = await supabase
      .from('submissions')
      .insert({
        assignment_id: assignmentId,
        student_id: user.id,
        status: 'uploaded',
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        current_stage: 'upload_completed',
      })
      .select('id')
      .single()

    if (createSubmissionError) {
      return NextResponse.json({ error: createSubmissionError.message }, { status: 500 })
    }

    submissionId = createdSubmission.id
  }

  if (!submissionId) {
    return NextResponse.json({ error: 'Failed to create submission' }, { status: 500 })
  }

  const insertedFiles: any[] = []

  for (let i = 0; i < normalizedFiles.length; i += 1) {
    const file = normalizedFiles[i]
    const pageNumber = i + 1
    const safeName = file.name.replace(/[^\w.\-ก-๙ ]/g, '_')
    const storagePath = `${assignmentId}/${user.id}/${submissionId}/page-${pageNumber}-${Date.now()}-${safeName}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: fileRow, error: insertFileError } = await supabase
      .from('submission_files')
      .insert({
        submission_id: submissionId,
        page_number: pageNumber,
        storage_path: storagePath,
      })
      .select(`
        id,
        submission_id,
        page_number,
        storage_path,
        created_at
      `)
      .single()

    if (insertFileError) {
      return NextResponse.json({ error: insertFileError.message }, { status: 500 })
    }

    insertedFiles.push(fileRow)
  }

  try {
    if (process.env.PIPELINE_SECRET) {
      await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL}/api/internal/pipeline/submissions/${submissionId}/process`,
        {
          method: 'POST',
          headers: {
            'x-pipeline-secret': process.env.PIPELINE_SECRET,
          },
        }
      )
    }
  } catch {
    // intentionally swallow; submission is already saved
  }

  return NextResponse.json({
    ok: true,
    submission_id: submissionId,
    files: insertedFiles,
  })
}