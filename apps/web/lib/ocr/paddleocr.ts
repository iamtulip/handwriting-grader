export type PaddleOcrPage = {
  page_number: number
  raw_text: string
  confidence: number
  tokens: Array<{
    text: string
    confidence: number
    bounding_poly?: Array<{ x: number; y: number }>
  }>
}

export async function runPaddleOcr(params: {
  buffer: Buffer
  filename: string
  mimeType: string
}): Promise<PaddleOcrPage[]> {
  const endpoint = process.env.PADDLE_OCR_URL
  if (!endpoint) {
    throw new Error('Missing PADDLE_OCR_URL')
  }

  const formData = new FormData()

  const copied = new Uint8Array(params.buffer.byteLength)
  copied.set(params.buffer)

  const blob = new Blob([copied], { type: params.mimeType })
  formData.append('file', blob, params.filename)

  const res = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  })

  const json = await res.json()

  if (!res.ok) {
    throw new Error(json?.detail || json?.error || 'PaddleOCR request failed')
  }

  return json?.pages ?? []
}