-- [1] Layout Spec with Versioning & Integrity
CREATE TABLE IF NOT EXISTS public.assignment_layout_specs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    version INT NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT false,
    layout_data JSONB NOT NULL, -- { pages: [ { page_number: 1, rois: [...] } ] }
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(assignment_id, version)
);

-- ✅ [Fix] ป้องกัน Active Spec ซ้อนกันมากกว่า 1 แถวต่อ Assignment
CREATE UNIQUE INDEX IF NOT EXISTS uq_assignment_active_spec
ON public.assignment_layout_specs (assignment_id)
WHERE is_active = true;

-- [2] Submission Artifacts (Per-page & Idempotent)
CREATE TABLE IF NOT EXISTS public.submission_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
    page_number INT NOT NULL,
    step_name TEXT NOT NULL, 
    artifact_type TEXT NOT NULL, 
    data JSONB, 
    storage_path TEXT, 
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ✅ [Fix] ป้องกันการ Insert ซ้ำเมื่อมีการ Retry ขั้นตอนเดิม
CREATE UNIQUE INDEX IF NOT EXISTS uq_artifact_per_step
ON public.submission_artifacts (submission_id, page_number, step_name, artifact_type);

CREATE INDEX IF NOT EXISTS idx_artifacts_submission_page
ON public.submission_artifacts (submission_id, page_number);

-- [3] Persistent Candidates (Multi-page & Audit-ready)
CREATE TABLE IF NOT EXISTS public.grading_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
    roi_id TEXT NOT NULL,
    page_number INT NOT NULL DEFAULT 1, -- ✅ [Added] สำหรับ multi-page trace
    layout_spec_version INT NOT NULL DEFAULT 1, -- ✅ [Added] ล็อกรุ่นเฉลย
    rank INT NOT NULL,
    raw_text TEXT,
    normalized_value TEXT,
    confidence_score FLOAT8,
    engine_source TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ✅ [Fix] Unique Index สำหรับ Idempotency
CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_rank
ON public.grading_candidates (submission_id, page_number, roi_id, rank, engine_source);

CREATE INDEX IF NOT EXISTS idx_candidates_submission_roi
ON public.grading_candidates (submission_id, page_number, roi_id);

-- [4] Grading Results (Explainable AI)
-- หมายเหตุ: ใช้ ALTER TABLE หากมีตารางเดิมอยู่แล้ว
DO $$ BEGIN
    CREATE TABLE public.grading_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE,
        roi_id TEXT NOT NULL,
        page_number INT NOT NULL DEFAULT 1,
        layout_spec_version INT NOT NULL DEFAULT 1,
        auto_score FLOAT8 DEFAULT 0, -- ✅ [Added] แยกคะแนน AI
        final_score FLOAT8 DEFAULT 0, -- ✅ [Added] คะแนนหลังมนุษย์ยืนยัน
        selected_candidate_id UUID REFERENCES public.grading_candidates(id),
        evidence_map JSONB, 
        is_human_override BOOLEAN DEFAULT false,
        manual_reason TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
EXCEPTION WHEN duplicate_table THEN 
    ALTER TABLE public.grading_results ADD COLUMN IF NOT EXISTS auto_score FLOAT8 DEFAULT 0;
    ALTER TABLE public.grading_results ADD COLUMN IF NOT EXISTS final_score FLOAT8 DEFAULT 0;
    ALTER TABLE public.grading_results ADD COLUMN IF NOT EXISTS page_number INT DEFAULT 1;
    ALTER TABLE public.grading_results ADD COLUMN IF NOT EXISTS layout_spec_version INT DEFAULT 1;
END $$;

-- [5] Submission Stage Monitoring
ALTER TABLE public.submissions 
ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS layout_spec_version INT, -- ✅ [Added] ล็อกไว้ตอนเริ่มงาน
ADD COLUMN IF NOT EXISTS pipeline_version TEXT DEFAULT 'v2'; -- ✅ [Added] ป้องกัน worker เวอร์ชั่นเก่าทำ