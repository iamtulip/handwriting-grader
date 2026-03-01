// apps/worker/src/diamond/stages/ocr_ensemble.ts
//บทบาท: เรียกใช้ OCR หลายค่าย (Ensemble) เพื่อให้ได้ทางเลือกคำตอบ (Candidates) ที่หลากหลายที่สุด ลดความเสี่ยงจากการที่ OCR เจ้าใดเจ้าหนึ่งอ่านผิด
import { CroppedRoi } from './roi_crop';

export type OcrEngine = 'vision_api' | 'paddle_ocr' | 'mathpix';

export type RawCandidate = {
  text: string;
  confidence: number; // 0..1
  engine: OcrEngine;
};

type RoiConfig = {
  answer_type?: 'numeric' | 'expression' | 'integer' | 'fraction' | string;
  policy?: 'thousands_comma' | 'decimal_comma';
  // future: language hints, expected format, etc.
};

function pickEnginesForRoi(config: RoiConfig): OcrEngine[] {
  const t = (config.answer_type || 'numeric').toLowerCase();
  // Numeric short answer: Vision + Paddle is the best default
  if (t === 'numeric' || t === 'integer' || t === 'fraction') {
    return ['vision_api', 'paddle_ocr'];
  }
  // Expression: add Mathpix as specialist (optionally)
  if (t === 'expression') {
    return ['vision_api', 'paddle_ocr', 'mathpix'];
  }
  // safe default
  return ['vision_api', 'paddle_ocr'];
}

/**
 * NOTE: Production implementation should:
 * - read roi.storage_path (derived ROI image)
 * - call each OCR engine
 * - return N-best candidates per engine (not just 1-best)
 */
async function callVisionApi(_ctx: any, _roi: CroppedRoi): Promise<RawCandidate[]> {
  // TODO: implement Google Cloud Vision OCR
  return [{ text: '125.50', confidence: 0.98, engine: 'vision_api' }];
}

async function callPaddleOcr(_ctx: any, _roi: CroppedRoi): Promise<RawCandidate[]> {
  // TODO: implement PaddleOCR service call
  return [{ text: '125.50', confidence: 0.92, engine: 'paddle_ocr' }];
}

async function callMathpix(_ctx: any, _roi: CroppedRoi): Promise<RawCandidate[]> {
  // TODO: implement Mathpix for expression ROI
  return [{ text: '125.50', confidence: 0.70, engine: 'mathpix' }];
}

export async function runOcrEnsembleForRoi(ctx: any, roi: CroppedRoi): Promise<RawCandidate[]> {
  console.log(`[OCR] Running Ensemble for ROI: ${roi.roi_id} (p${roi.page_number})`);

  const engines = pickEnginesForRoi(roi.config || {});
  const all: RawCandidate[] = [];

  for (const e of engines) {
    try {
      if (e === 'vision_api') all.push(...(await callVisionApi(ctx, roi)));
      if (e === 'paddle_ocr') all.push(...(await callPaddleOcr(ctx, roi)));
      if (e === 'mathpix') all.push(...(await callMathpix(ctx, roi)));
    } catch (err) {
      console.warn(`[OCR] Engine ${e} failed for ROI ${roi.roi_id}:`, err);
      // Do not fail whole pipeline; the whole point is redundancy.
    }
  }

  // basic sanitation: drop empty strings, clamp confidence
  const results = all
    .map((c) => ({
      ...c,
      text: (c.text ?? '').toString().trim(),
      confidence: Math.max(0, Math.min(1, Number(c.confidence ?? 0))),
    }))
    .filter((c) => c.text.length > 0);

  console.log(`[OCR] ROI ${roi.roi_id} extracted ${results.length} candidates from ${engines.length} engines.`);
  return results;
}