-- =========================================================
-- PERFORMANCE FOUNDATION MIGRATION
-- Canonical profile table: public.user_profiles
-- Goal:
--   1) Improve dashboard/query performance
--   2) Reduce disk I/O on Supabase
--   3) Prepare safe transition away from public.profiles
--   4) Add compatibility helpers without breaking current app
-- =========================================================

BEGIN;

-- =========================================================
-- 0) SAFETY / EXTENSIONS
-- =========================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =========================================================
-- 1) CANONICAL PROFILE DIRECTION
-- ---------------------------------------------------------
-- We keep public.user_profiles as the canonical table.
-- We do NOT drop public.profiles yet because many existing FKs still point there.
-- Instead, we add helper indexes and a compatibility view.
-- =========================================================

-- Ensure useful indexes on canonical table
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_profiles_id
  ON public.user_profiles(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_profiles_student_id_number_not_null
  ON public.user_profiles(student_id_number)
  WHERE student_id_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_profiles_role
  ON public.user_profiles(role);

CREATE INDEX IF NOT EXISTS idx_user_profiles_registration_status
  ON public.user_profiles(registration_status);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email
  ON public.user_profiles(email);

-- Optional search support for future dashboards
CREATE INDEX IF NOT EXISTS idx_user_profiles_full_name_trgm
  ON public.user_profiles
  USING gin (full_name gin_trgm_ops);

-- =========================================================
-- 2) COMPATIBILITY VIEW FOR READS
-- ---------------------------------------------------------
-- Some code paths may still read from "profiles".
-- This read-only compatibility view lets future read queries
-- move toward a stable shape while we phase out old usage.
-- IMPORTANT: We do NOT drop the existing table public.profiles here.
-- So we create a new helper view instead.
-- =========================================================

DROP VIEW IF EXISTS public.profiles_unified;

CREATE VIEW public.profiles_unified AS
SELECT
  up.id,
  up.full_name,
  up.role::text AS role,
  up.updated_at,
  up.student_id_number,
  up.email,
  up.registration_status
FROM public.user_profiles up;

COMMENT ON VIEW public.profiles_unified IS
'Read-only unified profile view based on public.user_profiles. Canonical source for future dashboard reads.';

-- =========================================================
-- 3) DATA INTEGRITY CONSTRAINTS (SAFE FOUNDATIONS)
-- =========================================================

-- official_rosters should be unique per section/student
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'official_rosters_section_student_id_number_key'
  ) THEN
    ALTER TABLE public.official_rosters
      ADD CONSTRAINT official_rosters_section_student_id_number_key
      UNIQUE (section_id, student_id_number);
  END IF;
END $$;

-- student_sections should be unique per student/section
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_sections_student_id_section_id_key'
  ) THEN
    ALTER TABLE public.student_sections
      ADD CONSTRAINT student_sections_student_id_section_id_key
      UNIQUE (student_id, section_id);
  END IF;
END $$;

-- submissions should be unique per assignment/student
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'submissions_assignment_id_student_id_key'
  ) THEN
    ALTER TABLE public.submissions
      ADD CONSTRAINT submissions_assignment_id_student_id_key
      UNIQUE (assignment_id, student_id);
  END IF;
END $$;

-- submission_files should be unique per submission/page
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'submission_files_submission_id_page_number_key'
  ) THEN
    ALTER TABLE public.submission_files
      ADD CONSTRAINT submission_files_submission_id_page_number_key
      UNIQUE (submission_id, page_number);
  END IF;
END $$;

-- grading_results usually should be unique per submission/item/page/roi if roi exists.
-- We add a safer uniqueness path for common usage first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'grading_results_submission_id_item_no_key'
  ) THEN
    ALTER TABLE public.grading_results
      ADD CONSTRAINT grading_results_submission_id_item_no_key
      UNIQUE (submission_id, item_no);
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'Skipped adding grading_results_submission_id_item_no_key due to duplicate existing data.';
END $$;

-- Prevent duplicate reviewer->assignment mapping
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reviewer_assignments_pkey'
  ) THEN
    ALTER TABLE public.reviewer_assignments
      ADD CONSTRAINT reviewer_assignments_pkey
      PRIMARY KEY (reviewer_id, assignment_id);
  END IF;
END $$;

-- =========================================================
-- 4) HIGH-IMPACT PERFORMANCE INDEXES
-- ---------------------------------------------------------
-- These are the most important indexes for student/instructor/reviewer/admin dashboards
-- =========================================================

-- sections
CREATE INDEX IF NOT EXISTS idx_sections_course_term_section
  ON public.sections(course_code, term, section_number);

-- student_sections
CREATE INDEX IF NOT EXISTS idx_student_sections_student_id
  ON public.student_sections(student_id);

CREATE INDEX IF NOT EXISTS idx_student_sections_section_id
  ON public.student_sections(section_id);

CREATE INDEX IF NOT EXISTS idx_student_sections_section_student
  ON public.student_sections(section_id, student_id);

-- official_rosters
CREATE INDEX IF NOT EXISTS idx_official_rosters_section_student
  ON public.official_rosters(section_id, student_id_number);

CREATE INDEX IF NOT EXISTS idx_official_rosters_uploaded_by
  ON public.official_rosters(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_official_rosters_full_name_trgm
  ON public.official_rosters
  USING gin (full_name gin_trgm_ops);

-- assignments
CREATE INDEX IF NOT EXISTS idx_assignments_section_id
  ON public.assignments(section_id);

CREATE INDEX IF NOT EXISTS idx_assignments_section_class_date
  ON public.assignments(section_id, class_date DESC);

CREATE INDEX IF NOT EXISTS idx_assignments_section_open_at
  ON public.assignments(section_id, open_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignments_section_close_at
  ON public.assignments(section_id, close_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignments_created_by
  ON public.assignments(created_by);

CREATE INDEX IF NOT EXISTS idx_assignments_assignment_type
  ON public.assignments(assignment_type);

CREATE INDEX IF NOT EXISTS idx_assignments_week_number
  ON public.assignments(week_number);

-- assignment_scoring_policies
CREATE UNIQUE INDEX IF NOT EXISTS uq_assignment_scoring_policies_assignment_id
  ON public.assignment_scoring_policies(assignment_id);

-- assignment_answer_keys
CREATE UNIQUE INDEX IF NOT EXISTS uq_assignment_answer_keys_assignment_id
  ON public.assignment_answer_keys(assignment_id);

-- assignment_layout_specs
CREATE INDEX IF NOT EXISTS idx_assignment_layout_specs_assignment_id
  ON public.assignment_layout_specs(assignment_id);

CREATE INDEX IF NOT EXISTS idx_assignment_layout_specs_assignment_active
  ON public.assignment_layout_specs(assignment_id, is_active);

-- submissions
CREATE INDEX IF NOT EXISTS idx_submissions_student_id
  ON public.submissions(student_id);

CREATE INDEX IF NOT EXISTS idx_submissions_assignment_id
  ON public.submissions(assignment_id);

CREATE INDEX IF NOT EXISTS idx_submissions_student_assignment
  ON public.submissions(student_id, assignment_id);

CREATE INDEX IF NOT EXISTS idx_submissions_student_submitted_at
  ON public.submissions(student_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_submissions_assignment_status
  ON public.submissions(assignment_id, status);

CREATE INDEX IF NOT EXISTS idx_submissions_student_status
  ON public.submissions(student_id, status);

CREATE INDEX IF NOT EXISTS idx_submissions_current_stage
  ON public.submissions(current_stage);

CREATE INDEX IF NOT EXISTS idx_submissions_fraud_flag
  ON public.submissions(fraud_flag);

-- submission_files
CREATE INDEX IF NOT EXISTS idx_submission_files_submission_id
  ON public.submission_files(submission_id);

CREATE INDEX IF NOT EXISTS idx_submission_files_submission_page
  ON public.submission_files(submission_id, page_number);

-- submission_artifacts
CREATE INDEX IF NOT EXISTS idx_submission_artifacts_submission_id
  ON public.submission_artifacts(submission_id);

CREATE INDEX IF NOT EXISTS idx_submission_artifacts_submission_step
  ON public.submission_artifacts(submission_id, step_name);

CREATE INDEX IF NOT EXISTS idx_submission_artifacts_submission_step_page
  ON public.submission_artifacts(submission_id, step_name, page_number);

-- grading_results
CREATE INDEX IF NOT EXISTS idx_grading_results_submission_id
  ON public.grading_results(submission_id);

CREATE INDEX IF NOT EXISTS idx_grading_results_submission_item
  ON public.grading_results(submission_id, item_no);

CREATE INDEX IF NOT EXISTS idx_grading_results_submission_page
  ON public.grading_results(submission_id, page_number);

CREATE INDEX IF NOT EXISTS idx_grading_results_selected_candidate_id
  ON public.grading_results(selected_candidate_id);

-- grading_candidates
CREATE INDEX IF NOT EXISTS idx_grading_candidates_submission_id
  ON public.grading_candidates(submission_id);

CREATE INDEX IF NOT EXISTS idx_grading_candidates_submission_roi_rank
  ON public.grading_candidates(submission_id, roi_id, rank);

CREATE INDEX IF NOT EXISTS idx_grading_candidates_candidate_hash
  ON public.grading_candidates(candidate_hash);

-- grading_events
CREATE INDEX IF NOT EXISTS idx_grading_events_submission_id
  ON public.grading_events(submission_id);

CREATE INDEX IF NOT EXISTS idx_grading_events_actor_id
  ON public.grading_events(actor_id);

CREATE INDEX IF NOT EXISTS idx_grading_events_submission_created_at
  ON public.grading_events(submission_id, created_at DESC);

-- review_claims
CREATE UNIQUE INDEX IF NOT EXISTS uq_review_claims_submission_id
  ON public.review_claims(submission_id);

CREATE INDEX IF NOT EXISTS idx_review_claims_reviewer_id
  ON public.review_claims(reviewer_id);

CREATE INDEX IF NOT EXISTS idx_review_claims_reviewer_expires
  ON public.review_claims(reviewer_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_review_claims_submission_expires
  ON public.review_claims(submission_id, expires_at);

-- reviewer_assignments
CREATE INDEX IF NOT EXISTS idx_reviewer_assignments_reviewer_id
  ON public.reviewer_assignments(reviewer_id);

CREATE INDEX IF NOT EXISTS idx_reviewer_assignments_assignment_id
  ON public.reviewer_assignments(assignment_id);

-- appeals
CREATE INDEX IF NOT EXISTS idx_appeals_submission_id
  ON public.appeals(submission_id);

CREATE INDEX IF NOT EXISTS idx_appeals_student_id
  ON public.appeals(student_id);

CREATE INDEX IF NOT EXISTS idx_appeals_status
  ON public.appeals(status);

CREATE INDEX IF NOT EXISTS idx_appeals_created_at
  ON public.appeals(created_at DESC);

-- class_sessions
CREATE INDEX IF NOT EXISTS idx_class_sessions_section_id
  ON public.class_sessions(section_id);

CREATE INDEX IF NOT EXISTS idx_class_sessions_section_date
  ON public.class_sessions(section_id, class_date DESC);

CREATE INDEX IF NOT EXISTS idx_class_sessions_section_starts_at
  ON public.class_sessions(section_id, starts_at DESC);

-- attendance_checkins
CREATE INDEX IF NOT EXISTS idx_attendance_checkins_student_id
  ON public.attendance_checkins(student_id);

CREATE INDEX IF NOT EXISTS idx_attendance_checkins_session_id
  ON public.attendance_checkins(session_id);

CREATE INDEX IF NOT EXISTS idx_attendance_checkins_student_session
  ON public.attendance_checkins(student_id, session_id);

CREATE INDEX IF NOT EXISTS idx_attendance_checkins_student_check_in_time
  ON public.attendance_checkins(student_id, check_in_time DESC);

-- jobs
CREATE INDEX IF NOT EXISTS idx_ocr_jobs_status_created_at
  ON public.ocr_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_extraction_jobs_status_created_at
  ON public.extraction_jobs(status, created_at);

-- audit
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record
  ON public.audit_logs(table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by_created
  ON public.audit_logs(performed_by, created_at DESC);

-- =========================================================
-- 5) LIGHTWEIGHT DASHBOARD READ VIEWS
-- ---------------------------------------------------------
-- These views reduce repeated JOIN logic in dashboards.
-- They are ordinary views (not materialized) for now.
-- =========================================================

DROP VIEW IF EXISTS public.v_student_assignment_overview;

CREATE VIEW public.v_student_assignment_overview AS
SELECT
  s.student_id,
  a.section_id,
  a.id AS assignment_id,
  a.title,
  a.assignment_type,
  a.week_number,
  a.class_date,
  a.open_at,
  a.due_at,
  a.close_at,
  sub.id AS submission_id,
  sub.status,
  sub.current_stage,
  sub.total_score,
  sub.max_score,
  sub.submitted_at,
  sub.fraud_flag,
  sub.extracted_paper_student_id
FROM public.assignments a
JOIN public.student_sections s
  ON s.section_id = a.section_id
LEFT JOIN public.submissions sub
  ON sub.assignment_id = a.id
 AND sub.student_id = s.student_id;

COMMENT ON VIEW public.v_student_assignment_overview IS
'Convenience read view for student dashboard pages (overview / weekly / detail list).';

DROP VIEW IF EXISTS public.v_attendance_student_summary;

CREATE VIEW public.v_attendance_student_summary AS
SELECT
  ac.student_id,
  cs.section_id,
  cs.id AS session_id,
  cs.class_date,
  cs.starts_at,
  cs.ends_at,
  ac.check_in_time,
  ac.is_on_time
FROM public.attendance_checkins ac
JOIN public.class_sessions cs
  ON cs.id = ac.session_id;

COMMENT ON VIEW public.v_attendance_student_summary IS
'Convenience read view for attendance pages and section attendance summaries.';

DROP VIEW IF EXISTS public.v_submission_score_summary;

CREATE VIEW public.v_submission_score_summary AS
SELECT
  gr.submission_id,
  COUNT(*)::int AS roi_count,
  COALESCE(SUM(gr.auto_score), 0) AS total_auto_score,
  COALESCE(SUM(gr.final_score), 0) AS total_final_score,
  BOOL_OR(COALESCE(gr.is_blank, false)) AS is_blank_any,
  COALESCE(SUM(gr.meta_score_attendance), 0) AS total_meta_attendance,
  COALESCE(SUM(gr.meta_score_punctuality), 0) AS total_meta_punctuality,
  COALESCE(SUM(gr.meta_score_accuracy), 0) AS total_meta_accuracy,
  COALESCE(SUM(gr.final_meta_score), 0) AS total_final_meta_score
FROM public.grading_results gr
GROUP BY gr.submission_id;

COMMENT ON VIEW public.v_submission_score_summary IS
'Aggregated scoring summary per submission for detail pages and reviewer dashboards.';

-- =========================================================
-- 6) OPTIONAL SANITY CHECK COMMENTS
-- =========================================================
COMMENT ON TABLE public.user_profiles IS
'Canonical profile table going forward. Use this instead of public.profiles for new code and new foreign keys.';

COMMENT ON TABLE public.profiles IS
'Legacy profile table. Avoid using this for new development. Prefer public.user_profiles.';

COMMENT ON COLUMN public.assignments.answer_key IS
'Legacy duplicate field. Prefer public.assignment_answer_keys.answer_key for new reads/writes.';

COMMENT ON COLUMN public.assignments.grading_config IS
'Legacy duplicate field. Prefer public.assignment_answer_keys.grading_config for new reads/writes.';

COMMIT;