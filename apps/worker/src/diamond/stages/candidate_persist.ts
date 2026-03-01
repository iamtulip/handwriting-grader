
//บทบาท: บันทึก Candidates ลงฐานข้อมูลอย่างปลอดภัย โดยมีการทำ Hash เพื่อป้องกันข้อมูลซ้ำซ้อน และเพื่อใช้ในการตรวจสอบย้อนหลัง (Audit Trail)
// apps/worker/src/diamond/stages/candidate_persist.ts
import { supabase } from '../../lib/supabase';
import { MathNormalizer } from '../engines/math_normalizer';
import { RawCandidate } from './ocr_ensemble';
import { CroppedRoi } from './roi_crop';

type DbCandidateRow = {
  id: string;
  submission_id: string;
  roi_id: string;
  page_number: number;
  layout_spec_version: number;
  rank: number;
  raw_text: string | null;
  normalized_value: string | null;
  confidence_score: number | null;
  engine_source: string | null;
  created_at: string;
};

function engineOrder(e: string) {
  if (e === 'vision_api') return 1;
  if (e === 'paddle_ocr') return 2;
  if (e === 'mathpix') return 3;
  return 99;
}

/**
 * Persist candidates in a deterministic order so rank is stable across retries.
 * IMPORTANT: This matches your DB unique index:
 *   uq_candidate_rank (submission_id, page_number, roi_id, rank, engine_source)
 */
export async function persistCandidates(ctx: any, roi: CroppedRoi, rawCandidates: RawCandidate[]): Promise<DbCandidateRow[]> {
  const submissionId = ctx.submission.id;

  // Deterministic ordering => stable rank across retries
  const sorted = [...rawCandidates].sort((a, b) => {
    const eo = engineOrder(a.engine) - engineOrder(b.engine);
    if (eo !== 0) return eo;
    const cd = (b.confidence ?? 0) - (a.confidence ?? 0);
    if (cd !== 0) return cd;
    return (a.text ?? '').localeCompare(b.text ?? '');
  });

  const dbRows = sorted.map((c, idx) => {
    const policy = roi.config?.policy; // optional
    const normalized = MathNormalizer.normalize(c.text, policy);

    return {
      submission_id: submissionId,
      roi_id: roi.roi_id,
      page_number: roi.page_number,
      layout_spec_version: roi.layout_spec_version,
      rank: idx + 1,
      raw_text: c.text,
      normalized_value: normalized,
      confidence_score: c.confidence,
      engine_source: c.engine,
    };
  });

  // Upsert using schema-valid conflict target
  const { data, error } = await supabase
    .from('grading_candidates')
    .upsert(dbRows, {
      onConflict: 'submission_id,page_number,roi_id,rank,engine_source',
    })
    .select();

  if (error) throw new Error(`[PERSIST] Failed to save candidates: ${error.message}`);

  return (data ?? []) as DbCandidateRow[];
}