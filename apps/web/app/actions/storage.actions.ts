// apps/web/app/actions/storage.actions.ts
'use server'

import 'server-only'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * Security goals (RLS-aligned):
 * 1) Client must NOT be able to read storage_path directly.
 * 2) Permission check is done via RLS on a SAFE view (submission_files_safe).
 * 3) Only after passing RLS, server uses service_role to fetch storage_path and create Signed URL.
 *
 * Prereqs in DB (recommended):
 * - View: public.submission_files_safe (security_invoker = true)
 *   Columns: id, submission_id, page_number, created_at   (NO storage_path)
 * - Table: public.submission_files has storage_path readable ONLY by service_role
 */

type SecureSignedUrlResult = {
  fileId: string
  signedUrl: string
  expiresIn: number
}

/** Helper: strict UUID check to reduce noisy errors / path probing */
function assertUuid(id: string, fieldName = 'id') {
  const ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  if (!ok) throw new Error(`Invalid ${fieldName}`)
}

/**
 * Generate a short-lived Signed URL for a submission file page image/PDF in bucket "exam-papers".
 * - fileId: submission_files.id
 */
export async function getSecureSignedUrl(fileId: string): Promise<SecureSignedUrlResult> {
  assertUuid(fileId, 'fileId')

  const supabaseUser = await createClient()
  const supabaseAdmin = createAdminClient()

  // 0) Must be logged in
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser()
  if (userErr || !userData?.user) throw new Error('Unauthorized')

  // 1) RLS permission check via SAFE view (does not expose storage_path)
  //    - Students should see only their own files
  //    - Reviewers/admin should see only allowed scope (your RLS decides)
  const { data: safeMeta, error: safeErr } = await supabaseUser
    .from('submission_files_safe')
    .select('id')
    .eq('id', fileId)
    .maybeSingle()

  if (safeErr) {
    // Don't leak internal errors to client
    throw new Error('Access denied')
  }
  if (!safeMeta) {
    throw new Error('Access denied')
  }

  // 2) Fetch storage_path using service_role (ONLY server)
  const { data: fileRow, error: fileErr } = await supabaseAdmin
    .from('submission_files')
    .select('storage_path')
    .eq('id', fileId)
    .single()

  if (fileErr || !fileRow?.storage_path) {
    throw new Error('File not found')
  }

  const storagePath = fileRow.storage_path

  // 3) Create signed URL (short-lived)
  const expiresIn = 300 // seconds (5 minutes)
  const { data: signedData, error: signedErr } = await supabaseAdmin.storage
    .from('exam-papers')
    .createSignedUrl(storagePath, expiresIn)

  if (signedErr || !signedData?.signedUrl) {
    throw new Error('Failed to generate secure URL')
  }

  return { fileId, signedUrl: signedData.signedUrl, expiresIn }
}

/**
 * Optional: batch version to reduce round-trips when showing many thumbnails.
 * - Performs RLS check for all ids via the SAFE view
 * - Then service_role fetch storage_path for allowed ids only
 */
export async function getSecureSignedUrls(fileIds: string[]): Promise<SecureSignedUrlResult[]> {
  if (!Array.isArray(fileIds) || fileIds.length === 0) return []
  if (fileIds.length > 50) throw new Error('Too many files requested')

  for (const id of fileIds) assertUuid(id, 'fileId')

  const supabaseUser = await createClient()
  const supabaseAdmin = createAdminClient()

  const { data: userData, error: userErr } = await supabaseUser.auth.getUser()
  if (userErr || !userData?.user) throw new Error('Unauthorized')

  // 1) RLS check for allowed IDs
  const { data: allowedRows, error: allowedErr } = await supabaseUser
    .from('submission_files_safe')
    .select('id')
    .in('id', fileIds)

  if (allowedErr) throw new Error('Access denied')

  const allowedSet = new Set((allowedRows || []).map(r => r.id))
  const allowedIds = fileIds.filter(id => allowedSet.has(id))
  if (allowedIds.length === 0) return []

  // 2) Fetch storage_path for allowed IDs via service_role
  const { data: paths, error: pathsErr } = await supabaseAdmin
    .from('submission_files')
    .select('id, storage_path')
    .in('id', allowedIds)

  if (pathsErr || !paths) throw new Error('File lookup failed')

  const idToPath = new Map<string, string>()
  for (const row of paths) {
    if (row?.id && row?.storage_path) idToPath.set(row.id, row.storage_path)
  }

  // 3) Signed URLs
  const expiresIn = 300
  const results: SecureSignedUrlResult[] = []

  for (const id of allowedIds) {
    const p = idToPath.get(id)
    if (!p) continue

    const { data: signedData, error: signedErr } = await supabaseAdmin.storage
      .from('exam-papers')
      .createSignedUrl(p, expiresIn)

    if (!signedErr && signedData?.signedUrl) {
      results.push({ fileId: id, signedUrl: signedData.signedUrl, expiresIn })
    }
  }

  return results
}