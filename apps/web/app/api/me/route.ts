import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('id, full_name, email, role, student_id_number, registration_status')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  const role = profile?.role ?? 'student'

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
    },
    profile: {
      id: profile?.id ?? user.id,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? user.email ?? null,
      role,
      student_id_number: profile?.student_id_number ?? null,
      registration_status: profile?.registration_status ?? null,
    },
  })
}