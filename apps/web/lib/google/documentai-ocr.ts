// apps/web/lib/google/documentai-ocr.ts
import { getDocumentAiClient, getDocumentAiProcessorName } from './documentai'

type DocAiToken = {
  text: string
  confidence: number
  page_number: number
  bounding_poly?: Array<{ x: number; y: number }>
}

export type DocAiPageOcr = {
  page_number: number
  raw_text: string
  confidence: number
  tokens: DocAiToken[]
}

function getTextFromAnchor(text: string, textAnchor: any): string {
  if (!textAnchor?.textSegments?.length) return ''

  return textAnchor.textSegments
    .map((segment: any) => {
      const start = Number(segment.startIndex ?? 0)
      const end = Number(segment.endIndex ?? 0)
      return text.slice(start, end)
    })
    .join('')
}

export async function runDocumentAiOcr(params: {
  buffer: Buffer
  mimeType: string
}): Promise<DocAiPageOcr[]> {
  const client = getDocumentAiClient()
  const name = getDocumentAiProcessorName()

  const [result] = await client.processDocument({
    name,
    rawDocument: {
      content: params.buffer.toString('base64'),
      mimeType: params.mimeType,
    },
  })

  const document = result.document
  if (!document) return []

  const fullText = document.text ?? ''
  const pages = document.pages ?? []

  return pages.map((page: any, pageIndex: number): DocAiPageOcr => {
    const tokens: DocAiToken[] = (page.tokens ?? []).map((token: any) => ({
      text: getTextFromAnchor(fullText, token.layout?.textAnchor),
      confidence: Number(token.layout?.confidence ?? 0),
      page_number: pageIndex + 1,
      bounding_poly: (token.layout?.boundingPoly?.normalizedVertices ?? []).map(
        (v: any) => ({
          x: Number(v.x ?? 0),
          y: Number(v.y ?? 0),
        })
      ),
    }))

    const pageText = tokens.map((t: DocAiToken) => t.text).join(' ').trim()

    const avgConfidence =
      tokens.length > 0
        ? tokens.reduce((sum: number, t: DocAiToken) => sum + t.confidence, 0) /
          tokens.length
        : 0

    return {
      page_number: pageIndex + 1,
      raw_text: pageText,
      confidence: Number(avgConfidence.toFixed(4)),
      tokens,
    }
  })
}