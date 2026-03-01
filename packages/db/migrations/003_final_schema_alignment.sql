-- [1] ปรับปรุงตารางผลการตรวจให้รองรับระบบ Audit และ Spec Drift
ALTER TABLE public.grading_results 
ADD COLUMN IF NOT EXISTS layout_spec_version INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS selected_candidate_id UUID REFERENCES public.grading_candidates(id),
ADD COLUMN IF NOT EXISTS evidence_map JSONB,
ADD COLUMN IF NOT EXISTS is_human_override BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS manual_reason TEXT,
ADD COLUMN IF NOT EXISTS confidence_score NUMERIC;

-- [2] ระบบป้องกันการบันทึกซ้ำ (Idempotency) ในตารางเหตุการณ์
ALTER TABLE public.grading_events 
ADD COLUMN IF NOT EXISTS client_nonce TEXT;

-- [3] Index เพื่อประสิทธิภาพของ Reviewer Dashboard
CREATE INDEX IF NOT EXISTS idx_grading_results_composite 
ON public.grading_results (submission_id, roi_id, page_number, layout_spec_version);

-- [4] RLS Policy สำหรับ Profiles ( Single Source of Truth )
DROP POLICY IF EXISTS "Staff can view all profiles" ON public.profiles;
CREATE POLICY "Staff can view all profiles" ON public.profiles 
FOR SELECT USING (role IN ('reviewer', 'instructor', 'admin'));