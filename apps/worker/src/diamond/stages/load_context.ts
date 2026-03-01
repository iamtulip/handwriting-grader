// apps/worker/src/diamond/stages/load_context.ts
import { supabase } from '../../lib/supabase'

export async function loadContext(submissionId: string) {
  const { data: sub, error: subErr } = await supabase
    .from('submissions')
    .select('id, assignment_id, layout_spec_version, pipeline_version')
    .eq('id', submissionId)
    .single()
  if (subErr || !sub) throw new Error('submission not found')

  // pages = ความจริง (source of truth)
  const { data: pages, error: pgErr } = await supabase
    .from('submission_files')
    .select('id, page_number, storage_path')
    .eq('submission_id', submissionId)
    .order('page_number', { ascending: true })
  if (pgErr || !pages || pages.length === 0) throw new Error('no submission_files')

  // layout spec (ต้องดึงด้วย version ที่ lock)
  const { data: spec, error: spErr } = await supabase
    .from('assignment_layout_specs')
    .select('id, assignment_id, version, layout_data')
    .eq('assignment_id', sub.assignment_id)
    .eq('version', sub.layout_spec_version) // ✅ lock version
    .single()
  if (spErr || !spec) throw new Error('layout spec not found for locked version')

  return {
    submission: sub,
    pages,
    layoutSpec: spec
  }
}