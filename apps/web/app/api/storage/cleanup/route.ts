// apps/web/app/api/storage/cleanup/route.ts
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const MAX_CLEANUP_PATHS = 80

export async function POST(req: Request) {
  // ✅ Best-effort endpoint: ตอบ 200 เสมอ (กัน retry-loop)
  try {
    const supabaseUser = await createClient()
    const supabaseAdmin = await createAdminClient()

    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !user) return NextResponse.json({ success: true })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ success: true })

    const assignment_id = String(body.assignment_id || '').trim()
    const pathsRaw = body.paths

    if (!assignment_id || !Array.isArray(pathsRaw) || pathsRaw.length === 0) {
      return NextResponse.json({ success: true })
    }

    // ✅ Throttle
    const trimmed = pathsRaw
      .filter((p: any) => typeof p === 'string')
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0)
      .slice(0, MAX_CLEANUP_PATHS)

    const expectedPrefix = `${assignment_id}/${user.id}/`
    const safePaths = trimmed.filter((p: string) => p.startsWith(expectedPrefix))

    if (safePaths.length > 0) {
      const { error: delErr } = await supabaseAdmin
        .storage
        .from('exam-papers')
        .remove(safePaths)

      if (delErr) {
        // log แบบย่อพอ (ไม่ throw)
        console.warn('[Storage Cleanup Warning]:', delErr.message)
      }
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.warn('[Storage Cleanup Failed]:', e?.message)
    return NextResponse.json({ success: true })
  }
}