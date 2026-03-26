import { ImageAnnotatorClient } from '@google-cloud/vision'
import sharp from 'sharp'
import { supabase } from '../lib/supabase'
import type { RoiCrop } from './roi_crop'
import type { WorkerContext } from './load_context'

export type OcrRawCandidate = {
  text: string
  normalized_value: string
  confidence_score: number
  engine_source: string
  metadata?: Record<string, unknown> | null
}

const vision = new ImageAnnotatorClient()
const SUBMISSION_BUCKET = process.env.SUBMISSION_FILES_BUCKET || 'submission-files'
const PADDLE_OCR_URL = process.env.PADDLE_OCR_URL || 'http://127.0.0.1:8001/ocr/paddle'

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

function normalizeText(raw: string) {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[๐]/g, '0')
    .replace(/[๑]/g, '1')
    .replace(/[๒]/g, '2')
    .replace(/[๓]/g, '3')
    .replace(/[๔]/g, '4')
    .replace(/[๕]/g, '5')
    .replace(/[๖]/g, '6')
    .replace(/[๗]/g, '7')
    .replace(/[๘]/g, '8')
    .replace(/[๙]/g, '9')
    .replace(/[，]/g, ',')
    .trim()
}

async function downloadPageBytes(ctx: WorkerContext, pageNumber: number): Promise<Buffer> {
  const page = ctx.pages.find((p) => p.page_number === pageNumber)
  if (!page) {
    throw new Error(`Page file not found for page ${pageNumber}`)
  }

  const { data, error } = await supabase.storage
    .from(SUBMISSION_BUCKET)
    .download(page.storage_path)

  if (error || !data) {
    throw new Error(error?.message || `Failed to download page ${pageNumber}`)
  }

  const arr = await data.arrayBuffer()
  return Buffer.from(arr)
}

async function cropAndPreprocessRoi(
  ctx: WorkerContext,
  roi: RoiCrop
): Promise<{ png: Buffer; meta: Record<string, unknown> }> {
  const pageBytes = await downloadPageBytes(ctx, roi.page_number)
  const img = sharp(pageBytes, { failOn: 'none' })
  const info = await img.metadata()

  if (!info.width || !info.height) {
    throw new Error(`Unable to read image metadata for page ${roi.page_number}`)
  }

  let cropped = img
  let cropMeta: Record<string, unknown> = {
    page_number: roi.page_number,
    roi_id: roi.roi_id,
    crop_storage_path: roi.crop_storage_path,
  }

  if (roi.bbox_norm) {
    const [x, y, w, h] = roi.bbox_norm
    const left = Math.max(0, Math.floor(x * info.width))
    const top = Math.max(0, Math.floor(y * info.height))
    const width = Math.max(1, Math.floor(w * info.width))
    const height = Math.max(1, Math.floor(h * info.height))

    cropped = img.extract({ left, top, width, height })
    cropMeta = {
      ...cropMeta,
      left,
      top,
      width,
      height,
      image_width: info.width,
      image_height: info.height,
    }
  }

  // Preprocess before OCR
  // grayscale + normalize + sharpen + threshold-like contrast
  const preprocessed = await cropped
    .grayscale()
    .normalize()
    .sharpen()
    .linear(1.2, -10)
    .png()
    .toBuffer()

  return {
    png: preprocessed,
    meta: cropMeta,
  }
}

function collectWordConfidences(fullTextAnnotation: any): number[] {
  const out: number[] = []
  const pages = fullTextAnnotation?.pages ?? []
  for (const page of pages) {
    for (const block of page.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        for (const word of para.words ?? []) {
          if (typeof word.confidence === 'number') {
            out.push(word.confidence)
          }
        }
      }
    }
  }
  return out
}

async function googleVisionOcr(png: Buffer) {
  const [result] = await vision.documentTextDetection({
    image: { content: png },
  })

  const text =
    result.fullTextAnnotation?.text?.trim() ||
    result.textAnnotations?.[0]?.description?.trim() ||
    ''

  const confidences = collectWordConfidences(result.fullTextAnnotation)
  const confidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : text
        ? 0.7
        : 0

  return {
    text,
    confidence: clamp01(confidence),
    raw: result,
  }
}

async function paddleOcr(png: Buffer) {
  const res = await fetch(PADDLE_OCR_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      image_base64: png.toString('base64'),
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`PaddleOCR service failed: ${res.status} ${body}`)
  }

  const data = await res.json()

  return {
    text: String(data?.text ?? '').trim(),
    confidence: clamp01(Number(data?.confidence ?? 0)),
    raw: data,
  }
}

export async function runOcrEnsembleForRoi(
  ctx: WorkerContext,
  roi: RoiCrop
): Promise<OcrRawCandidate[]> {
  const { png, meta } = await cropAndPreprocessRoi(ctx, roi)

  const candidates: OcrRawCandidate[] = []

  // OCR 1: Google Vision
  try {
    const g = await googleVisionOcr(png)
    candidates.push({
      text: g.text,
      normalized_value: normalizeText(g.text),
      confidence_score: g.confidence,
      engine_source: 'google_vision',
      metadata: {
        ...meta,
        engine: 'google_vision',
      },
    })
  } catch (err: any) {
    candidates.push({
      text: '',
      normalized_value: '',
      confidence_score: 0,
      engine_source: 'google_vision',
      metadata: {
        ...meta,
        engine: 'google_vision',
        error: err?.message ?? 'google_vision_failed',
      },
    })
  }

  // OCR 2: PaddleOCR (Python service)
  try {
    const p = await paddleOcr(png)
    candidates.push({
      text: p.text,
      normalized_value: normalizeText(p.text),
      confidence_score: p.confidence,
      engine_source: 'paddle_ocr',
      metadata: {
        ...meta,
        engine: 'paddle_ocr',
      },
    })
  } catch (err: any) {
    candidates.push({
      text: '',
      normalized_value: '',
      confidence_score: 0,
      engine_source: 'paddle_ocr',
      metadata: {
        ...meta,
        engine: 'paddle_ocr',
        error: err?.message ?? 'paddle_ocr_failed',
      },
    })
  }

  return candidates
}