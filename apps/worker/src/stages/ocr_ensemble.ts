import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import sharp from 'sharp'
import { ImageAnnotatorClient } from '@google-cloud/vision'
import { supabase } from '../lib/supabase'
import { buildPreprocessedVariants } from './image_preprocess'
import { runPaddleOnBuffer } from './paddle_bridge'
import { parseMathCandidatesFromOcr } from './ocr_math_parser'
import type { WorkerContext } from './load_context'
import type { RoiCrop } from './roi_crop'

const SUBMISSION_BUCKET = process.env.SUBMISSION_FILES_BUCKET || 'submission-files'
const GOOGLE_TIMEOUT_MS = Number(process.env.GOOGLE_TIMEOUT_MS ?? 20000)

function resolveVisionKeyPath(): string | undefined {
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (envPath && fs.existsSync(envPath)) {
    return envPath
  }

  const hardcodedWindowsPath = 'D:/myproject/handwriting-grader/vision-key.json'
  if (fs.existsSync(hardcodedWindowsPath)) {
    return hardcodedWindowsPath
  }

  const projectRootPath = path.resolve(process.cwd(), '../../vision-key.json')
  if (fs.existsSync(projectRootPath)) {
    return projectRootPath
  }

  return undefined
}

const resolvedVisionKeyPath = resolveVisionKeyPath()

const visionClient = resolvedVisionKeyPath
  ? new ImageAnnotatorClient({ keyFilename: resolvedVisionKeyPath })
  : new ImageAnnotatorClient()

console.log('[worker] Google Vision key path', resolvedVisionKeyPath ?? 'NOT_FOUND')

export type OcrCandidate = {
  raw_text: string
  normalized_value: string
  confidence_score: number
  engine_source: string
}

export type OcrDebugInfo = {
  debug_roi_path: string | null
  google_raw_by_variant: Array<{
    variant: string
    results: Array<{ text: string; confidence: number }>
  }>
  paddle_raw_by_variant: Array<{
    variant: string
    results: Array<{ text: string; confidence: number }>
  }>
  merged_candidates: OcrCandidate[]
}

export type OcrEnsembleResult = {
  candidates: OcrCandidate[]
  debug: OcrDebugInfo
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function normalizeFallbackText(s: string): string {
  return s
    .replace(/\s+/g, '')
    .replace(/[，,]/g, '')
    .replace(/[Oo๐]/g, '0')
    .replace(/[lI|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/−/g, '-')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .trim()
}

function splitRawIntoLines(text: string): string[] {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function dedupeCandidates<T extends { raw_text?: string | null; normalized_value?: string | null }>(
  items: T[]
): T[] {
  const seen = new Set<string>()
  const out: T[] = []

  for (const item of items) {
    const key = `${item.normalized_value ?? ''}__${item.raw_text ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }

  return out
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timeout after ${ms} ms`))
    }, ms)

    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((err) => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

async function downloadPageBuffer(storagePath: string): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from(SUBMISSION_BUCKET)
    .download(storagePath)

  if (error || !data) {
    throw new Error(error?.message || `Failed to download page image: ${storagePath}`)
  }

  return Buffer.from(await data.arrayBuffer())
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

async function cropBufferFromPage(pageBuffer: Buffer, roi: RoiCrop): Promise<Buffer> {
  if (!roi.bbox_norm) {
    throw new Error(`ROI ${roi.roi_id} has no bbox_norm`)
  }

  const [x, y, w, h] = roi.bbox_norm

  const meta = await sharp(pageBuffer).metadata()
  const imageWidth = meta.width ?? 0
  const imageHeight = meta.height ?? 0

  if (!imageWidth || !imageHeight) {
    throw new Error(`Cannot read image size for ROI ${roi.roi_id}`)
  }

  console.log('[worker] ROI crop', {
    roi_id: roi.roi_id,
    page_number: roi.page_number,
    bbox_norm: roi.bbox_norm,
    image_width: imageWidth,
    image_height: imageHeight,
  })

  const left = clamp(Math.floor(x * imageWidth), 0, imageWidth - 1)
  const top = clamp(Math.floor(y * imageHeight), 0, imageHeight - 1)
  const right = clamp(Math.ceil((x + w) * imageWidth), left + 1, imageWidth)
  const bottom = clamp(Math.ceil((y + h) * imageHeight), top + 1, imageHeight)

  const width = Math.max(1, right - left)
  const height = Math.max(1, bottom - top)

  return await sharp(pageBuffer)
    .extract({
      left,
      top,
      width,
      height,
    })
    .png()
    .toBuffer()
}

async function uploadDebugRoiImage(
  submissionId: string,
  roi: RoiCrop,
  image: Buffer
): Promise<string | null> {
  try {
    const fileName = `roi-${roi.page_number}-${roi.roi_id}-${crypto.randomUUID()}.png`
    const storagePath = `debug/${submissionId}/${fileName}`

    const { error } = await supabase.storage
      .from(SUBMISSION_BUCKET)
      .upload(storagePath, image, {
        contentType: 'image/png',
        upsert: true,
      })

    if (error) {
      console.warn('[worker] failed to upload debug ROI image', {
        submissionId,
        roi_id: roi.roi_id,
        error: error.message,
      })
      return null
    }

    return storagePath
  } catch (error) {
    console.warn('[worker] uploadDebugRoiImage exception', {
      submissionId,
      roi_id: roi.roi_id,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

async function runGoogleVisionOnBuffer(
  image: Buffer
): Promise<Array<{ text: string; confidence: number }>> {
  const [result] = await withTimeout(
    visionClient.textDetection({
      image: { content: image },
    }),
    GOOGLE_TIMEOUT_MS,
    'Google Vision OCR'
  )

  const annotation = result.fullTextAnnotation
  if (!annotation) {
    return []
  }

  const fullText = String(annotation.text ?? '').trim()
  if (!fullText) {
    return []
  }

  return [
    {
      text: fullText,
      confidence: 0.85,
    },
  ]
}

function buildLineAwareCandidates(
  rawText: string,
  baseConfidence: number,
  engineSource: string
): OcrCandidate[] {
  const lines = splitRawIntoLines(rawText)
  const candidates: OcrCandidate[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line) continue

    const lineBias = i === 0 ? 0.04 : i === 1 ? 0.015 : 0
    const linePenalty = i * 0.04
    const adjustedConfidence = clamp01(baseConfidence + lineBias - linePenalty)

    const parsed = parseMathCandidatesFromOcr(line, adjustedConfidence)

    if (parsed.length > 0) {
      for (const p of parsed) {
        candidates.push({
          raw_text: p.raw_text,
          normalized_value: p.normalized_value,
          confidence_score: clamp01(p.confidence_score),
          engine_source: engineSource,
        })
      }
      continue
    }

    const fallbackNormalized = normalizeFallbackText(line)
    if (fallbackNormalized) {
      candidates.push({
        raw_text: line,
        normalized_value: fallbackNormalized,
        confidence_score: clamp01(adjustedConfidence * 0.75),
        engine_source: `${engineSource}:fallback_line`,
      })
    }
  }

  // ถ้ามีแค่บรรทัดเดียว ค่อยเก็บทั้งก้อนเป็น fallback
  if (candidates.length === 0 && lines.length <= 1) {
    const fallback = normalizeFallbackText(rawText)
    if (fallback) {
      candidates.push({
        raw_text: rawText.trim(),
        normalized_value: fallback,
        confidence_score: clamp01(baseConfidence * 0.65),
        engine_source: `${engineSource}:fallback_block`,
      })
    }
  }

  return candidates
}

function candidateSortScore(candidate: OcrCandidate): number {
  const conf = Number(candidate.confidence_score ?? 0)
  const lenPenalty = Math.min(String(candidate.normalized_value ?? '').length, 40) * 0.0025
  const engineBonus = String(candidate.engine_source ?? '').includes(':original') ? 0.01 : 0
  return conf + engineBonus - lenPenalty
}

export async function runOcrEnsembleForRoi(
  ctx: WorkerContext,
  roi: RoiCrop
): Promise<OcrEnsembleResult> {
  const pageFile = ctx.pages.find(
    (p: any) => Number(p.page_number) === Number(roi.page_number)
  )

  if (!pageFile) {
    throw new Error(`Page file not found for page ${roi.page_number}`)
  }

  const pageBuffer = await downloadPageBuffer(pageFile.storage_path)
  const roiBuffer = await cropBufferFromPage(pageBuffer, roi)
  const debugRoiPath = await uploadDebugRoiImage(ctx.submission.id, roi, roiBuffer)

  console.log('[worker] ROI debug image', {
    submissionId: ctx.submission.id,
    roi_id: roi.roi_id,
    page_number: roi.page_number,
    debugRoiPath,
  })

  const variants = await buildPreprocessedVariants(roiBuffer)

  const candidates: OcrCandidate[] = []
  const googleRawByVariant: OcrDebugInfo['google_raw_by_variant'] = []
  const paddleRawByVariant: OcrDebugInfo['paddle_raw_by_variant'] = []

  for (const variant of variants) {
    console.log('[worker] OCR variant start', {
      roi_id: roi.roi_id,
      page_number: roi.page_number,
      variant: variant.name,
    })

    try {
      const googleResults = await runGoogleVisionOnBuffer(variant.image)

      googleRawByVariant.push({
        variant: variant.name,
        results: googleResults,
      })

      console.log('[worker] Google OCR raw', {
        roi_id: roi.roi_id,
        variant: variant.name,
        results: googleResults,
      })

      for (const r of googleResults) {
        const raw = String(r.text ?? '').trim()
        if (!raw) continue

        const parsedCandidates = buildLineAwareCandidates(
          raw,
          Number(r.confidence ?? 0),
          `google:${variant.name}`
        )

        candidates.push(...parsedCandidates)
      }

      console.log('[worker] Google OCR ok', {
        roi_id: roi.roi_id,
        variant: variant.name,
        count: googleResults.length,
      })
    } catch (error) {
      console.error('[worker] Google OCR failed', {
        roi_id: roi.roi_id,
        variant: variant.name,
        error: error instanceof Error ? error.message : String(error),
        keyPath: resolvedVisionKeyPath ?? 'NOT_FOUND',
      })
    }

    let paddleResults: Array<{ text: string; confidence: number }> = []

    try {
      paddleResults = await runPaddleOnBuffer(variant.image)

      paddleRawByVariant.push({
        variant: variant.name,
        results: paddleResults,
      })

      console.log('[worker] Paddle OCR raw', {
        roi_id: roi.roi_id,
        variant: variant.name,
        results: paddleResults,
      })

      console.log('[worker] Paddle OCR ok', {
        roi_id: roi.roi_id,
        variant: variant.name,
        count: paddleResults.length,
      })
    } catch (err) {
      console.warn('[worker] Paddle OCR skipped', {
        roi_id: roi.roi_id,
        variant: variant.name,
        error: err instanceof Error ? err.message : String(err),
      })

      paddleRawByVariant.push({
        variant: variant.name,
        results: [],
      })

      paddleResults = []
    }

    for (const r of paddleResults) {
      const raw = String(r.text ?? '').trim()
      if (!raw) continue

      const parsedCandidates = buildLineAwareCandidates(
        raw,
        Number(r.confidence ?? 0),
        `paddle:${variant.name}`
      )

      candidates.push(...parsedCandidates)
    }
  }

  const cleaned = candidates
    .filter((c) => c.raw_text.trim().length > 0 && c.normalized_value.trim().length > 0)
    .sort((a, b) => candidateSortScore(b) - candidateSortScore(a))

  const deduped = dedupeCandidates(cleaned)

  console.log('[worker] OCR ensemble result', {
    roi_id: roi.roi_id,
    page_number: roi.page_number,
    total: deduped.length,
    top5: deduped.slice(0, 5),
  })

  return {
    candidates: deduped,
    debug: {
      debug_roi_path: debugRoiPath,
      google_raw_by_variant: googleRawByVariant,
      paddle_raw_by_variant: paddleRawByVariant,
      merged_candidates: deduped,
    },
  }
}