import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET() {

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('appeals')
    .select(`
      id,
      reason,
      status,
      created_at,

      submissions!inner(
        id,
        assignment_id,
        total_score,

        assignments(
          title
        )
      ),

      user_profiles!appeals_student_id_fkey(
        full_name,
        student_id_number
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    items: data ?? []
  })
}
