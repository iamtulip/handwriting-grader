import type { RoiCrop } from './roi_crop'
import type { WorkerContext } from './load_context'

export type OcrRawCandidate = {
  text: string
  normalized_value: string
  confidence_score: number
  engine_source: string
  metadata?: Record<string, unknown> | null
}

function normalizeText(raw: string) {
  return raw
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
    .trim()
}

export async function runOcrEnsembleForRoi(
  _ctx: WorkerContext,
  roi: RoiCrop
): Promise<OcrRawCandidate[]> {
  // Placeholder integration-safe ensemble
  // รอบถัดไปค่อยเสียบ Google Vision / PaddleOCR / Mathpix จริง

  const seedText =
    roi.kind === 'identity'
      ? 'UNKNOWN_STUDENT'
      : roi.answer_type === 'number'
      ? '0'
      : roi.answer_type === 'text'
      ? ''
      : ''

  const normalized = normalizeText(seedText)

  return [
    {
      text: seedText,
      normalized_value: normalized,
      confidence_score: 0.5,
      engine_source: 'placeholder_ocr',
      metadata: {
        crop_storage_path: roi.crop_storage_path,
        answer_type: roi.answer_type,
      },
    },
  ]
}