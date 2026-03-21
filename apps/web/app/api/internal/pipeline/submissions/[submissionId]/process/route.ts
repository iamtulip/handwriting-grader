//apps/web/app/api/internal/pipeline/submissions/[submissionId]/process/route.ts
import { NextResponse } from 'next/server'
import { processSubmissionPipeline } from '@/lib/pipeline/process-submission'

export const runtime = 'nodejs'

export async function POST(
  req: Request,
  context: { params: Promise<{ submissionId: string }> }
) {
  const { submissionId } = await context.params

  const secret = req.headers.get('x-pipeline-secret')
  if (!process.env.PIPELINE_SECRET || secret !== process.env.PIPELINE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized pipeline request' }, { status: 401 })
  }

  try {
    const result = await processSubmissionPipeline(submissionId)
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Pipeline failed' },
      { status: 500 }
    )
  }
}