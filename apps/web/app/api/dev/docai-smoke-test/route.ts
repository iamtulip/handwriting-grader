//apps/web/app/api/dev/docai-smoke-test/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runDocumentAiOcr } from '@/lib/google/documentai-ocr'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const pages = await runDocumentAiOcr({
    buffer,
    mimeType: file.type || 'application/octet-stream',
  })

  return NextResponse.json({
    ok: true,
    pages,
  })
}