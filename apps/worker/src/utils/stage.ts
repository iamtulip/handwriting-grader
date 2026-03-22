import { supabase } from '../lib/supabase'

export async function setStage(submissionId: string, stage: string) {
  const { error } = await supabase
    .from('submissions')
    .update({
      current_stage: stage,
    })
    .eq('id', submissionId)

  if (error) {
    throw error
  }
}