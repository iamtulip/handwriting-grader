import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const supabase = await createClient()
  const body = await req.json().catch(() => null)

  const email = String(body?.email ?? '').trim()
  const password = String(body?.password ?? '')

  if (!email || !password) {
    return NextResponse.json({ error: 'Missing email/password' }, { status: 400 })
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return NextResponse.json({ error: error.message }, { status: 401 })

  return NextResponse.json({ ok: true })
}