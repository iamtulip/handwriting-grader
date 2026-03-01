-- Migration: 20260303000000_v7_gold_master.sql
-- Description: V7 Gold Master - 44 Security Fixes + 3 Micro Sweeps (Zero Trust, No TOCTOU, Full Privacy)

-- ==========================================
-- 1. ENUMS
-- ==========================================
CREATE TYPE public.user_role AS ENUM ('student', 'reviewer', 'admin');
CREATE TYPE public.submission_status AS ENUM (
  'uploaded', 'ocr_pending', 'ocr_running', 'ocr_done', 'ocr_failed',
  'extract_pending', 'extract_running', 'extract_done', 'extract_failed',
  'grade_pending', 'grade_running', 'graded', 'needs_review',
  'reviewing', 'approved', 'published', 'appeal_open', 'appeal_resolved'
);
CREATE TYPE public.job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'dead_letter');
CREATE TYPE public.appeal_status AS ENUM ('open', 'in_review', 'resolved', 'rejected');

-- ==========================================
-- 2. TABLES
-- ==========================================
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'student',
  full_name TEXT NOT NULL,
  student_id_number TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ,
  close_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.assignment_answer_keys (
  assignment_id UUID PRIMARY KEY REFERENCES public.assignments(id) ON DELETE CASCADE,
  answer_key JSONB NOT NULL DEFAULT '{}'::JSONB,
  grading_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.user_profiles(id),
  status public.submission_status NOT NULL DEFAULT 'uploaded',
  total_score NUMERIC(5,2),
  max_score NUMERIC(5,2),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assignment_id, student_id)
);

CREATE TABLE public.submission_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id, page_number)
);

CREATE TABLE public.ocr_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES public.submission_files(id) ON DELETE CASCADE,
  status public.job_status NOT NULL DEFAULT 'pending',
  provider_metadata JSONB,
  raw_text TEXT,
  confidence NUMERIC(3,2),
  attempts INT DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  error_log TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (file_id)
);

CREATE TABLE public.extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  status public.job_status NOT NULL DEFAULT 'pending',
  extracted_json JSONB,
  flags JSONB,
  attempts INT DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  error_log TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id)
);

CREATE TABLE public.grading_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  item_no TEXT NOT NULL,
  extracted_raw TEXT,
  extracted_normalized TEXT,
  ai_confidence NUMERIC(3,2),
  auto_score NUMERIC(5,2),
  final_score NUMERIC(5,2),
  is_overridden BOOLEAN DEFAULT FALSE,
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id, item_no)
);

CREATE TABLE public.review_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.user_profiles(id),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (submission_id)
);

CREATE TABLE public.appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.user_profiles(id),
  reason TEXT NOT NULL,
  attachment_path TEXT,
  status public.appeal_status NOT NULL DEFAULT 'open',
  resolution_notes TEXT,
  resolved_by UUID REFERENCES public.user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 3. FUNCTIONS & TRIGGERS
-- ==========================================

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, role, full_name)
  VALUES (NEW.id, 'student', COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE table_schema = 'auth' AND table_name = 'users' AND privilege_type = 'TRIGGER' AND grantee = current_user
  ) THEN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    RAISE NOTICE 'Trigger on_auth_user_created created successfully';
  ELSE
    RAISE WARNING 'Cannot create trigger on auth.users - must be done via Supabase Dashboard (Auth > Hooks)';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB) RETURNS JSONB AS $$
DECLARE
  claims JSONB;
  user_role_val public.user_role;
BEGIN
  claims := event -> 'claims';
  SELECT role INTO user_role_val FROM public.user_profiles WHERE id = (event->>'user_id')::UUID;
  IF user_role_val IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role_val::TEXT));
    event := jsonb_set(event, '{claims}', claims);
  END IF;
  RETURN event;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

CREATE OR REPLACE FUNCTION public.get_my_role() RETURNS public.user_role AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN NULL
    WHEN (auth.jwt() -> 'user_role') IS NULL THEN NULL
    ELSE trim(both '"' from (auth.jwt() -> 'user_role')::TEXT)::public.user_role
  END;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_modified_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_assignments_modtime BEFORE UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();
CREATE TRIGGER update_answer_keys_modtime BEFORE UPDATE ON public.assignment_answer_keys FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();
CREATE TRIGGER update_submissions_modtime BEFORE UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();
CREATE TRIGGER update_ocr_jobs_modtime BEFORE UPDATE ON public.ocr_jobs FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();
CREATE TRIGGER update_grading_results_modtime BEFORE UPDATE ON public.grading_results FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

CREATE OR REPLACE FUNCTION public.process_audit_log() RETURNS TRIGGER AS $$
DECLARE
    modifier_id UUID;
    raw_sub TEXT;
BEGIN
    raw_sub := current_setting('request.jwt.claim.sub', true);
    IF raw_sub IS NOT NULL AND raw_sub ~ '^[0-9a-f-]{36}$' THEN modifier_id := raw_sub::UUID;
    ELSE modifier_id := NULL; END IF;

    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, performed_by)
        VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), modifier_id); RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (table_name, record_id, action, old_data, performed_by)
        VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), modifier_id); RETURN OLD;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_logs (table_name, record_id, action, new_data, performed_by)
        VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), modifier_id); RETURN NEW;
    END IF; RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER audit_submissions AFTER INSERT OR UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
CREATE TRIGGER audit_grading_results AFTER INSERT OR UPDATE OR DELETE ON public.grading_results FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
CREATE TRIGGER audit_appeals AFTER INSERT OR UPDATE ON public.appeals FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

CREATE OR REPLACE FUNCTION public.guard_job_attempts() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('completed', 'dead_letter') THEN RETURN NEW; END IF;
  IF NEW.attempts >= NEW.max_attempts THEN
    NEW.status := 'dead_letter';
    NEW.error_log := COALESCE(NEW.error_log, '') || ' | MAX ATTEMPTS REACHED at ' || NOW()::TEXT;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

CREATE TRIGGER guard_ocr_attempts BEFORE UPDATE ON public.ocr_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_job_attempts();
CREATE TRIGGER guard_extraction_attempts BEFORE UPDATE ON public.extraction_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_job_attempts();

CREATE OR REPLACE FUNCTION public.lock_claimed_at() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.claimed_at != OLD.claimed_at THEN RAISE EXCEPTION 'claimed_at is immutable after creation'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
CREATE TRIGGER lock_review_claim_timestamp BEFORE UPDATE ON public.review_claims FOR EACH ROW EXECUTE FUNCTION public.lock_claimed_at();

CREATE OR REPLACE FUNCTION public.can_renew_claim(p_claim_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.review_claims WHERE id = p_claim_id AND reviewer_id = auth.uid() AND claimed_at + INTERVAL '2 hours' >= NOW()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ✅ [Fix V6 Note 1] ป้องกัน Infinite Recursion & อนุญาตให้ Service Role รันผ่านได้
CREATE OR REPLACE FUNCTION public.lock_user_role() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role != OLD.role THEN
    IF auth.uid() IS NOT NULL AND public.get_my_role() != 'admin' THEN
      RAISE EXCEPTION 'Only admins can change user roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
CREATE TRIGGER restrict_role_update BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.lock_user_role();

CREATE OR REPLACE FUNCTION public.lock_appeal_ownership() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.student_id != OLD.student_id OR NEW.submission_id != OLD.submission_id THEN
    RAISE EXCEPTION 'appeal student_id and submission_id are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
CREATE TRIGGER restrict_appeal_ownership BEFORE UPDATE ON public.appeals FOR EACH ROW EXECUTE FUNCTION public.lock_appeal_ownership();

-- ==========================================
-- 4. VIEWS
-- ==========================================
CREATE OR REPLACE VIEW public.submission_files_safe WITH (security_invoker = true) AS
SELECT id, submission_id, page_number, created_at FROM public.submission_files;
GRANT SELECT ON public.submission_files_safe TO authenticated;

-- ==========================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ==========================================
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_answer_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extraction_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grading_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- User Profiles ✅ [Fix V6 Note 3] จำกัดสิทธิ์ Reviewer ให้เห็นเฉพาะโปรไฟล์เด็กที่ตรวจอยู่
CREATE POLICY "users_read_own_profile" ON public.user_profiles 
  FOR SELECT USING (
    id = auth.uid() 
    OR public.get_my_role() = 'admin'
    OR (
      public.get_my_role() = 'reviewer'
      AND EXISTS (
        SELECT 1 FROM public.review_claims rc
        JOIN public.submissions s ON s.id = rc.submission_id
        WHERE rc.reviewer_id = auth.uid()
          AND rc.expires_at > NOW()
          AND s.student_id = user_profiles.id
      )
    )
  );
CREATE POLICY "users_update_own_profile" ON public.user_profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "users_admin_update_role" ON public.user_profiles FOR UPDATE USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- Assignments
CREATE POLICY "assignments_read_all_authenticated" ON public.assignments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "assignments_insert_admin_only" ON public.assignments FOR INSERT WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY "assignments_update_admin_only" ON public.assignments FOR UPDATE USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY "assignments_delete_admin_only" ON public.assignments FOR DELETE USING (public.get_my_role() = 'admin');

-- Answer Keys 
CREATE POLICY "answer_keys_read_admin_reviewer" ON public.assignment_answer_keys FOR SELECT USING (public.get_my_role() IN ('admin', 'reviewer'));
CREATE POLICY "answer_keys_write_admin_only" ON public.assignment_answer_keys FOR INSERT WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY "answer_keys_update_admin_only" ON public.assignment_answer_keys FOR UPDATE USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY "answer_keys_delete_admin_only" ON public.assignment_answer_keys FOR DELETE USING (public.get_my_role() = 'admin');

-- Submissions 
CREATE POLICY "submissions_student_read_own" ON public.submissions FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "submissions_student_insert_own" ON public.submissions FOR INSERT WITH CHECK (student_id = auth.uid());
CREATE POLICY "submissions_reviewer_read_assigned" ON public.submissions FOR SELECT USING (
  public.get_my_role() = 'reviewer' AND EXISTS (SELECT 1 FROM public.review_claims rc WHERE rc.submission_id = id AND rc.reviewer_id = auth.uid() AND rc.expires_at > NOW())
);
CREATE POLICY "submissions_admin_all" ON public.submissions FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- Submission Files 
CREATE POLICY "submission_files_privileged_only" ON public.submission_files FOR ALL USING (public.get_my_role() IN ('admin', 'reviewer'));
CREATE POLICY "submission_files_student_read_own_meta" ON public.submission_files FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.student_id = auth.uid())
);

-- Grading Results
CREATE POLICY "grading_results_student_read_published" ON public.grading_results FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.student_id = auth.uid() AND s.status IN ('published', 'appeal_open', 'appeal_resolved'))
);
CREATE POLICY "grading_results_reviewer_read_claimed" ON public.grading_results FOR SELECT USING (
  public.get_my_role() = 'reviewer' AND EXISTS (SELECT 1 FROM public.review_claims rc WHERE rc.submission_id = submission_id AND rc.reviewer_id = auth.uid() AND rc.expires_at > NOW())
);
CREATE POLICY "grading_results_reviewer_update_claimed" ON public.grading_results FOR UPDATE USING (
  public.get_my_role() = 'reviewer' AND EXISTS (SELECT 1 FROM public.review_claims rc WHERE rc.submission_id = submission_id AND rc.reviewer_id = auth.uid() AND rc.expires_at > NOW())
);
CREATE POLICY "grading_results_admin_all" ON public.grading_results FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- Review Claims
CREATE POLICY "review_claims_reviewer_read_own" ON public.review_claims FOR SELECT USING (reviewer_id = auth.uid() OR public.get_my_role() = 'admin');
CREATE POLICY "review_claims_reviewer_insert" ON public.review_claims FOR INSERT WITH CHECK (reviewer_id = auth.uid() AND public.get_my_role() IN ('reviewer', 'admin'));
CREATE POLICY "review_claims_reviewer_renew_own" ON public.review_claims FOR UPDATE USING (
  reviewer_id = auth.uid() AND public.get_my_role() IN ('reviewer', 'admin')
) WITH CHECK (
  reviewer_id = auth.uid() AND public.can_renew_claim(id) AND expires_at <= NOW() + INTERVAL '30 minutes'
);
CREATE POLICY "review_claims_reviewer_delete_own" ON public.review_claims FOR DELETE USING (reviewer_id = auth.uid() OR public.get_my_role() = 'admin');

-- Appeals 
CREATE POLICY "appeals_student_read_own" ON public.appeals FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "appeals_student_insert_own" ON public.appeals FOR INSERT WITH CHECK (
  student_id = auth.uid() AND EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.student_id = auth.uid() AND s.status = 'appeal_open')
);
CREATE POLICY "appeals_reviewer_read_all" ON public.appeals FOR SELECT USING (public.get_my_role() IN ('reviewer', 'admin'));
CREATE POLICY "appeals_reviewer_update_status" ON public.appeals FOR UPDATE USING (public.get_my_role() IN ('reviewer', 'admin')) WITH CHECK (public.get_my_role() IN ('reviewer', 'admin'));
CREATE POLICY "appeals_admin_delete" ON public.appeals FOR DELETE USING (public.get_my_role() = 'admin');

-- Audit & Jobs
CREATE POLICY "audit_logs_admin_read_only" ON public.audit_logs FOR SELECT USING (public.get_my_role() = 'admin');
CREATE POLICY "ocr_jobs_admin_only" ON public.ocr_jobs FOR ALL USING (public.get_my_role() = 'admin');
CREATE POLICY "extraction_jobs_admin_only" ON public.extraction_jobs FOR ALL USING (public.get_my_role() = 'admin');

-- ==========================================
-- 6. COLUMN-LEVEL SECURITY
-- ==========================================
REVOKE SELECT ON public.submission_files FROM authenticated;
GRANT SELECT (id, submission_id, page_number, created_at) ON public.submission_files TO authenticated;
COMMENT ON COLUMN public.submission_files.storage_path IS 'Restricted: accessible only via service_role or privileged DB functions. Use get_submission_file_signed_url() for client access.';

-- ==========================================
-- 7. INDEXES
-- ==========================================
CREATE INDEX idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX idx_submissions_assignment ON public.submissions(assignment_id);
CREATE INDEX idx_submissions_student_status ON public.submissions(student_id, status);
CREATE INDEX idx_submission_files_submission ON public.submission_files(submission_id);
CREATE INDEX idx_grading_results_submission ON public.grading_results(submission_id);
CREATE INDEX idx_review_claims_reviewer ON public.review_claims(reviewer_id);
CREATE INDEX idx_review_claims_submission_expires ON public.review_claims(submission_id, expires_at);
CREATE INDEX idx_appeals_submission ON public.appeals(submission_id);
CREATE INDEX idx_appeals_student ON public.appeals(student_id);
CREATE INDEX idx_audit_logs_table_record ON public.audit_logs(table_name, record_id);
CREATE INDEX idx_audit_logs_performed_by ON public.audit_logs(performed_by);
CREATE INDEX idx_ocr_jobs_pending ON public.ocr_jobs(created_at) WHERE status = 'pending';
CREATE INDEX idx_extraction_jobs_pending ON public.extraction_jobs(created_at) WHERE status = 'pending';
CREATE INDEX idx_review_claims_expires_partial ON public.review_claims(expires_at) WHERE expires_at > NOW();

-- ==========================================
-- 8. PG_CRON: Auto Cleanup
-- ==========================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'cleanup-expired-claims',
  '*/5 * * * *',
  $$
    WITH expired AS (
      DELETE FROM public.review_claims
      WHERE expires_at <= NOW()
      RETURNING submission_id
    )
    UPDATE public.submissions
    SET status = 'needs_review'
    WHERE id IN (SELECT submission_id FROM expired)
      AND status = 'reviewing'
      AND NOT EXISTS (
        SELECT 1 FROM public.review_claims rc
        WHERE rc.submission_id = public.submissions.id AND rc.expires_at > NOW()
      );
  $$
);