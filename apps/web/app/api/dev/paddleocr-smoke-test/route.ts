//apps/web/app/api/dev/paddleocr-smoke-test/route.ts
import { NextResponse } from 'next/server'
import { runPaddleOcr } from '@/lib/ocr/paddleocr'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const formData = await req.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const pages = await runPaddleOcr({
    buffer,
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
  })

  return NextResponse.json({
    ok: true,
    pages,
  })
}