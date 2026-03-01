-- packages/db/migrations/001_diamond_v2_core_schema.sql
-- Diamond V2 Core Schema (Revised)
-- ✅ Adds: layout_spec_id lock, candidate_hash idempotency, reviewer-ready indexes, updated_at trigger, safer constraints

-- Prereq (Supabase usually has this; keep for safety)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================
-- [0] Helper: updated_at trigger (optional but recommended)
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- [1] Layout Spec with Versioning & Integrity
-- =========================================================
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

-- ✅ Prevent >1 active spec per assignment
CREATE UNIQUE INDEX IF NOT EXISTS uq_assignment_active_spec
ON public.assignment_layout_specs (assignment_id)
WHERE is_active = true;

-- ✅ Helpful indexes
CREATE INDEX IF NOT EXISTS idx_layout_specs_assignment
ON public.assignment_layout_specs (assignment_id);

CREATE INDEX IF NOT EXISTS idx_layout_specs_active
ON public.assignment_layout_specs (assignment_id)
WHERE is_active = true;

-- ✅ updated_at auto-maintain
DO $$ BEGIN
  CREATE TRIGGER trg_assignment_layout_specs_updated_at
  BEFORE UPDATE ON public.assignment_layout_specs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN
  -- do nothing
END $$;

-- =========================================================
-- [2] Submission Artifacts (Per-page & Idempotent)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.submission_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  step_name TEXT NOT NULL,      -- 'alignment_proof', 'roi_crop', 'vlm_evidence', ...
  artifact_type TEXT NOT NULL,  -- 'image_path', 'json_metadata'
  data JSONB,
  storage_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ✅ Prevent duplicates on retries (idempotency)
CREATE UNIQUE INDEX IF NOT EXISTS uq_artifact_per_step
ON public.submission_artifacts (submission_id, page_number, step_name, artifact_type);

CREATE INDEX IF NOT EXISTS idx_artifacts_submission_page
ON public.submission_artifacts (submission_id, page_number);

CREATE INDEX IF NOT EXISTS idx_artifacts_submission_step
ON public.submission_artifacts (submission_id, step_name);

-- =========================================================
-- [3] Persistent Candidates (Multi-page & Audit-ready)
--     ✅ Adds candidate_hash to make retries deterministic
-- =========================================================
CREATE TABLE IF NOT EXISTS public.grading_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  roi_id TEXT NOT NULL,
  page_number INT NOT NULL DEFAULT 1,
  layout_spec_version INT NOT NULL DEFAULT 1, -- kept for readability/audit
  rank INT NOT NULL,                          -- can still be used for UI ordering
  raw_text TEXT,
  normalized_value TEXT,
  confidence_score FLOAT8,
  engine_source TEXT,                         -- 'OCR_A', 'OCR_B', 'Mathpix', 'Heuristic'
  candidate_hash TEXT,                        -- ✅ NEW: hash(raw_text + normalized_value)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ✅ Old rank-based idempotency (keep if you already use it)
CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_rank
ON public.grading_candidates (submission_id, page_number, roi_id, rank, engine_source);

-- ✅ NEW: hash-based idempotency (recommended)
CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_hash
ON public.grading_candidates (submission_id, page_number, roi_id, engine_source, candidate_hash);

CREATE INDEX IF NOT EXISTS idx_candidates_submission_roi
ON public.grading_candidates (submission_id, page_number, roi_id);

CREATE INDEX IF NOT EXISTS idx_candidates_submission
ON public.grading_candidates (submission_id);

-- =========================================================
-- [4] Grading Results (Explainable AI)
-- =========================================================
DO $$ BEGIN
  CREATE TABLE public.grading_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE,
    roi_id TEXT NOT NULL,
    page_number INT NOT NULL DEFAULT 1,
    layout_spec_version INT NOT NULL DEFAULT 1,
    auto_score FLOAT8 DEFAULT 0,
    final_score FLOAT8 DEFAULT 0,
    selected_candidate_id UUID REFERENCES public.grading_candidates(id),
    evidence_map JSONB, -- { page: 1, bbox: [x1,y1,x2,y2], verifier_reason: "...", ... }
    is_human_override BOOLEAN DEFAULT false,
    manual_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
EXCEPTION WHEN duplicate_table THEN
  ALTER TABLE public.grading_results ADD COLUMN IF NOT EXISTS roi_id TEXT;
  ALTER TABLE public.grading_results ADD COLUMN IF NOT EXISTS page_number INT DEFAULT 1;
  ALTER TABLE public.grading_results ADD COLUMN IF NOT EXISTS layout_spec_version INT DEFAULT 1;
  ALTER TABLE public.grading_results ADD COLUMN IF NOT EXISTS auto_score FLOAT8 DEFAULT 0;
  ALTER TABLE public.grading_results ADD COLUMN IF NOT EXISTS final_score FLOAT8 DEFAULT 0;
  ALTER TABLE public.grading_results ADD COLUMN IF NOT EXISTS selected_candidate_id UUID REFERENCES public.grading_candidates(id);
  ALTER TABLE public.grading_results ADD COLUMN IF NOT EXISTS evidence_map JSONB;
  ALTER TABLE public.grading_results ADD COLUMN IF NOT EXISTS is_human_override BOOLEAN DEFAULT false;
  ALTER TABLE public.grading_results ADD COLUMN IF NOT EXISTS manual_reason TEXT;
END $$;

-- ✅ Reviewer dashboard performance indexes
CREATE INDEX IF NOT EXISTS idx_results_submission
ON public.grading_results (submission_id);

CREATE INDEX IF NOT EXISTS idx_results_submission_roi
ON public.grading_results (submission_id, page_number, roi_id);

-- =========================================================
-- [5] Submission Stage Monitoring + Layout Spec Lock
--     ✅ Adds layout_spec_id FK lock (stronger than version only)
-- =========================================================
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS layout_spec_version INT,
  ADD COLUMN IF NOT EXISTS layout_spec_id UUID,
  ADD COLUMN IF NOT EXISTS pipeline_version TEXT DEFAULT 'v2';

-- ✅ Add FK safely (if constraint already exists, ignore)
DO $$ BEGIN
  ALTER TABLE public.submissions
    ADD CONSTRAINT submissions_layout_spec_id_fkey
    FOREIGN KEY (layout_spec_id)
    REFERENCES public.assignment_layout_specs(id);
EXCEPTION WHEN duplicate_object THEN
  -- do nothing
END $$;

-- Helpful index for queue polling / filtering
CREATE INDEX IF NOT EXISTS idx_submissions_stage
ON public.submissions (current_stage);

CREATE INDEX IF NOT EXISTS idx_submissions_pipeline_version
ON public.submissions (pipeline_version);

-- =========================================================
-- [6] Optional: Prevent mismatch (layout_spec_version vs layout_spec_id)
--     If you adopt layout_spec_id, treat layout_spec_version as redundant/audit only.
--     You can enforce consistency later via trigger (keep optional for now).
-- =========================================================

-- =========================================================
-- [7] Notes for your Worker (IMPORTANT)
-- =========================================================
-- 1) When inserting candidates: compute candidate_hash = sha256(raw_text || '|' || normalized_value)
-- 2) Use UPSERT for submission_artifacts onConflict: (submission_id,page_number,step_name,artifact_type)
-- 3) On init submission: set submissions.layout_spec_id + layout_spec_version from the ACTIVE spec at that moment
-- =========================================================