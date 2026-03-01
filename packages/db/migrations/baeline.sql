-- ============================================================
-- Diamond V2 Core Schema (Idempotent, Multi-page, Audit-ready)
-- File: packages/db/migrations/001_diamond_v2_core_schema.sql
-- ============================================================

-- Safety: Ensure extensions (optional; skip if already handled)
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- [0] Pre-req: Ensure submissions has pipeline_version + current_stage + layout_spec_version
-- ------------------------------------------------------------
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS pipeline_version TEXT DEFAULT 'v2',
  ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS layout_spec_version INT;

-- Helpful indexes for worker polling
CREATE INDEX IF NOT EXISTS idx_submissions_pipeline_stage
ON public.submissions (pipeline_version, current_stage);

-- ------------------------------------------------------------
-- [1] Assignment Layout Specs (Versioning + single active per assignment)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assignment_layout_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT false,
  -- layout_data example: { pages: [ { page_number: 1, rois: [...] }, ... ] }
  layout_data JSONB NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assignment_id, version)
);

-- single active spec per assignment (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS uq_assignment_active_spec
ON public.assignment_layout_specs (assignment_id)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_layout_specs_assignment
ON public.assignment_layout_specs (assignment_id, version DESC);

-- Auto-updated updated_at (optional; if you already have a generic trigger, skip this)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at_timestamp'
  ) THEN
    CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $fn$;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_assignment_layout_specs_updated_at'
  ) THEN
    CREATE TRIGGER trg_assignment_layout_specs_updated_at
    BEFORE UPDATE ON public.assignment_layout_specs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();
  END IF;
END $$;

-- ------------------------------------------------------------
-- [2] Submission Artifacts (Per-page, idempotent per step)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.submission_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  step_name TEXT NOT NULL,        -- e.g. 'alignment_proof', 'roi_crop', 'ocr_a', 'ocr_b', 'vlm_evidence'
  artifact_type TEXT NOT NULL,    -- e.g. 'image_path', 'json_metadata'
  data JSONB,                     -- e.g. { rmse: 0.012, H: [..], keypoints: ... }
  storage_path TEXT,              -- storage object path (if any)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- prevent duplicates on retry (idempotency key)
CREATE UNIQUE INDEX IF NOT EXISTS uq_artifact_per_step
ON public.submission_artifacts (submission_id, page_number, step_name, artifact_type);

CREATE INDEX IF NOT EXISTS idx_artifacts_submission_page
ON public.submission_artifacts (submission_id, page_number);

-- ------------------------------------------------------------
-- [3] Persistent Candidates (Multi-page + locks spec version)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grading_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  roi_id TEXT NOT NULL,                 -- roi.id from layout_spec
  page_number INT NOT NULL DEFAULT 1,   -- multi-page trace
  layout_spec_version INT NOT NULL DEFAULT 1, -- lock to spec version used
  rank INT NOT NULL,                    -- 1..N
  raw_text TEXT,
  normalized_value TEXT,
  confidence_score FLOAT8,
  engine_source TEXT,                  -- 'OCR_A','OCR_B','Mathpix','Heuristic'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- idempotency for candidates: same submission+page+roi+rank+engine
CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_rank
ON public.grading_candidates (submission_id, page_number, roi_id, layout_spec_version, rank, engine_source);

CREATE INDEX IF NOT EXISTS idx_candidates_submission_roi
ON public.grading_candidates (submission_id, page_number, roi_id);

CREATE INDEX IF NOT EXISTS idx_candidates_submission
ON public.grading_candidates (submission_id);

-- ------------------------------------------------------------
-- [4] Grading Results (Explainable AI: auto_score + final_score + evidence map)
--     Create if missing; otherwise ALTER safely
-- ------------------------------------------------------------
DO $$
BEGIN
  -- Create table if not exists
  CREATE TABLE IF NOT EXISTS public.grading_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
    roi_id TEXT NOT NULL,
    page_number INT NOT NULL DEFAULT 1,
    layout_spec_version INT NOT NULL DEFAULT 1,

    auto_score FLOAT8 NOT NULL DEFAULT 0,
    final_score FLOAT8 NOT NULL DEFAULT 0,

    selected_candidate_id UUID REFERENCES public.grading_candidates(id),
    evidence_map JSONB,                 -- { page:1, bbox:[...], verifier_reason:"..." }
    is_human_override BOOLEAN NOT NULL DEFAULT false,
    manual_reason TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

EXCEPTION WHEN duplicate_table THEN
  -- Table existed; ensure required columns exist
  ALTER TABLE public.grading_results
    ADD COLUMN IF NOT EXISTS page_number INT DEFAULT 1,
    ADD COLUMN IF NOT EXISTS layout_spec_version INT DEFAULT 1,
    ADD COLUMN IF NOT EXISTS auto_score FLOAT8 DEFAULT 0,
    ADD COLUMN IF NOT EXISTS final_score FLOAT8 DEFAULT 0,
    ADD COLUMN IF NOT EXISTS selected_candidate_id UUID,
    ADD COLUMN IF NOT EXISTS evidence_map JSONB,
    ADD COLUMN IF NOT EXISTS is_human_override BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS manual_reason TEXT;

  -- Ensure FK (safe: only add if not already there)
  BEGIN
    ALTER TABLE public.grading_results
      ADD CONSTRAINT grading_results_selected_candidate_fk
      FOREIGN KEY (selected_candidate_id) REFERENCES public.grading_candidates(id);
  EXCEPTION WHEN duplicate_object THEN
    -- ignore
  END;
END $$;

-- one row per (submission, roi, page, spec) for upsert safety
CREATE UNIQUE INDEX IF NOT EXISTS uq_grading_result_key
ON public.grading_results (submission_id, roi_id, page_number, layout_spec_version);

CREATE INDEX IF NOT EXISTS idx_grading_results_submission
ON public.grading_results (submission_id);

-- ------------------------------------------------------------
-- [5] RLS + Policies (Idempotent)
-- ------------------------------------------------------------

-- Enable RLS
ALTER TABLE public.assignment_layout_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grading_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grading_results ENABLE ROW LEVEL SECURITY;

-- Drop policies if exist (prevents "policy already exists" error)
DROP POLICY IF EXISTS "student_read_own_candidates" ON public.grading_candidates;
DROP POLICY IF EXISTS "student_read_own_results" ON public.grading_results;
DROP POLICY IF EXISTS "student_read_own_artifacts" ON public.submission_artifacts;
DROP POLICY IF EXISTS "teacher_admin_manage_layout_specs" ON public.assignment_layout_specs;
DROP POLICY IF EXISTS "service_role_all_layout_specs" ON public.assignment_layout_specs;
DROP POLICY IF EXISTS "service_role_all_artifacts" ON public.submission_artifacts;
DROP POLICY IF EXISTS "service_role_all_candidates" ON public.grading_candidates;
DROP POLICY IF EXISTS "service_role_all_results" ON public.grading_results;

-- Students can read ONLY their own items by joining submissions.student_id = auth.uid()
CREATE POLICY "student_read_own_candidates"
ON public.grading_candidates
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.submissions s
    WHERE s.id = grading_candidates.submission_id
      AND s.student_id = auth.uid()
  )
);

CREATE POLICY "student_read_own_results"
ON public.grading_results
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.submissions s
    WHERE s.id = grading_results.submission_id
      AND s.student_id = auth.uid()
  )
);

CREATE POLICY "student_read_own_artifacts"
ON public.submission_artifacts
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.submissions s
    WHERE s.id = submission_artifacts.submission_id
      AND s.student_id = auth.uid()
  )
);

-- Layout specs: restrict to admin/reviewer/teacher (adjust to your profiles.role)
-- Assumes: public.profiles(id uuid pk) with column role of enum/text user_role
CREATE POLICY "teacher_admin_manage_layout_specs"
ON public.assignment_layout_specs
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin','reviewer')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin','reviewer')
  )
);

-- Service role full access (server-side workers)
CREATE POLICY "service_role_all_layout_specs"
ON public.assignment_layout_specs
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_artifacts"
ON public.submission_artifacts
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_candidates"
ON public.grading_candidates
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_results"
ON public.grading_results
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- ------------------------------------------------------------
-- [6] (Optional but recommended) Ensure submissions has indexes for joins
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_submissions_student
ON public.submissions (student_id);

CREATE INDEX IF NOT EXISTS idx_submissions_assignment
ON public.submissions (assignment_id);

-- ============================================================
-- END
-- ============================================================