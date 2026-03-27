//apps/web/app/api/student/assignments/[assignmentId]/submit/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BUCKET = process.env.SUBMISSION_FILES_BUCKET || 'submission-files'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_')
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  try {
    const { assignmentId } = await params

    const formData = await req.formData()
    const studentId = String(formData.get('studentId') ?? '').trim()
    const files = formData
      .getAll('files')
      .filter((f): f is File => f instanceof File && f.size > 0)

    if (!assignmentId) {
      return badRequest('Missing assignmentId')
    }

    if (!studentId) {
      return badRequest('Missing studentId')
    }

    if (files.length === 0) {
      return badRequest('No files uploaded')
    }

    // 1) หา submission เดิม
    let submissionId: string

    const { data: existingSubmission, error: submissionLookupError } = await supabase
      .from('submissions')
      .select('id, status, current_stage')
      .eq('assignment_id', assignmentId)
      .eq('student_id', studentId)
      .maybeSingle()

    if (submissionLookupError) {
      return badRequest(`Failed to lookup submission: ${submissionLookupError.message}`, 500)
    }

    if (existingSubmission) {
      submissionId = existingSubmission.id
    } else {
      const { data: insertedSubmission, error: insertSubmissionError } = await supabase
        .from('submissions')
        .insert({
          assignment_id: assignmentId,
          student_id: studentId,
          status: 'uploaded',
          current_stage: null,
          pipeline_version: 'v2',
        })
        .select('id')
        .single()

      if (insertSubmissionError || !insertedSubmission) {
        return badRequest(
          `Failed to create submission: ${insertSubmissionError?.message ?? 'unknown error'}`,
          500
        )
      }

      submissionId = insertedSubmission.id
    }

    // 2) ดึงไฟล์เดิมออกมาก่อน เผื่อลบจาก storage
    const { data: oldFiles, error: oldFilesError } = await supabase
      .from('submission_files')
      .select('id, storage_path')
      .eq('submission_id', submissionId)

    if (oldFilesError) {
      return badRequest(`Failed to fetch existing submission files: ${oldFilesError.message}`, 500)
    }

    // 3) ลบ row เดิมใน submission_files ก่อน
    const { error: deleteOldFileRowsError } = await supabase
      .from('submission_files')
      .delete()
      .eq('submission_id', submissionId)

    if (deleteOldFileRowsError) {
      return badRequest(
        `Failed to delete old submission_files: ${deleteOldFileRowsError.message}`,
        500
      )
    }

    // 4) ลบไฟล์เก่าใน storage
    if (Array.isArray(oldFiles) && oldFiles.length > 0) {
      const paths = oldFiles
        .map((f) => f.storage_path)
        .filter((p): p is string => typeof p === 'string' && p.length > 0)

      if (paths.length > 0) {
        const { error: removeStorageError } = await supabase.storage
          .from(BUCKET)
          .remove(paths)

        if (removeStorageError) {
          console.warn('[submit] failed to remove old storage files', removeStorageError.message)
        }
      }
    }

    // 5) อัปโหลดไฟล์ใหม่และ insert submission_files
    const insertedFileRows: Array<{
      id: string
      submission_id: string
      page_number: number
      storage_path: string
      mime_type: string
    }> = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const pageNumber = i + 1
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg'
      const safeName = sanitizeFilename(file.name)
      const objectId = randomUUID()
      const storagePath =
        `${assignmentId}/${studentId}/${submissionId}/` +
        `page-${pageNumber}-${objectId}-${safeName}`

      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, buffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: true,
        })

      if (uploadError) {
        return badRequest(`Failed to upload file: ${uploadError.message}`, 500)
      }

      insertedFileRows.push({
        id: randomUUID(),
        submission_id: submissionId,
        page_number: pageNumber,
        storage_path: storagePath,
        mime_type: file.type || `image/${ext}`,
      })
    }

    const { error: insertSubmissionFilesError } = await supabase
      .from('submission_files')
      .insert(insertedFileRows)

    if (insertSubmissionFilesError) {
      return badRequest(
        `Failed to insert submission_files: ${insertSubmissionFilesError.message}`,
        500
      )
    }

    // 6) reset submission for regrade
    const { error: resetError } = await supabase.rpc('reset_submission_for_regrade', {
      p_submission_id: submissionId,
    })

    if (resetError) {
      return badRequest(`Failed to reset submission for regrade: ${resetError.message}`, 500)
    }

    return NextResponse.json({
      ok: true,
      submissionId,
      fileCount: insertedFileRows.length,
      message: 'Submission uploaded and queued for regrade',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}