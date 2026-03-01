-- Migration: 00000000000000_baseline.sql
-- Description: The Immortal Baseline - Idempotent Policies, View-Safe RLS, Anti-decrease Attempts (NOT NULL)

-- ==========================================
-- 1. ENUMS
-- ==========================================
DO $$ BEGIN CREATE TYPE public.user_role AS ENUM ('student', 'reviewer', 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.submission_status AS ENUM (
  'uploaded', 'ocr_pending', 'ocr_running', 'ocr_done', 'ocr_failed',
  'extract_pending', 'extract_running', 'extract_done', 'extract_failed',
  'grade_pending', 'grade_running', 'graded', 'needs_review',
  'reviewing', 'approved', 'published', 'appeal_open', 'appeal_resolved'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'dead_letter'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.appeal_status AS ENUM ('open', 'in_review', 'resolved', 'rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==========================================
-- 2. TABLES (Idempotent & Hardened)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'student',
  full_name TEXT NOT NULL,
  student_id_number TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ,
  close_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.reviewer_assignments (
  reviewer_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (reviewer_id, assignment_id)
);

CREATE TABLE IF NOT EXISTS public.assignment_answer_keys (
  assignment_id UUID PRIMARY KEY REFERENCES public.assignments(id) ON DELETE CASCADE,
  answer_key JSONB NOT NULL DEFAULT '{}'::JSONB,
  grading_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.submissions (
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

CREATE TABLE IF NOT EXISTS public.submission_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id, page_number)
);

CREATE TABLE IF NOT EXISTS public.ocr_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES public.submission_files(id) ON DELETE CASCADE,
  status public.job_status NOT NULL DEFAULT 'pending',
  provider_metadata JSONB,
  raw_text TEXT,
  confidence NUMERIC(3,2),
  attempts INT NOT NULL DEFAULT 0, -- ✅ [Extra Hardening] บังคับ NOT NULL
  max_attempts INT NOT NULL DEFAULT 3,
  error_log TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (file_id)
);

CREATE TABLE IF NOT EXISTS public.extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  status public.job_status NOT NULL DEFAULT 'pending',
  extracted_json JSONB,
  flags JSONB,
  attempts INT NOT NULL DEFAULT 0, -- ✅ [Extra Hardening] บังคับ NOT NULL
  max_attempts INT NOT NULL DEFAULT 3,
  error_log TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id)
);

CREATE TABLE IF NOT EXISTS public.grading_results (
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

CREATE TABLE IF NOT EXISTS public.review_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.user_profiles(id),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (submission_id)
);

CREATE TABLE IF NOT EXISTS public.appeals (
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

CREATE TABLE IF NOT EXISTS public.audit_logs (
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
-- 3. FUNCTIONS, HOOKS & TRIGGERS
-- ==========================================

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, role, full_name)
  VALUES (NEW.id, 'student', COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_privileges WHERE table_schema = 'auth' AND table_name = 'users' AND privilege_type = 'TRIGGER' AND grantee = current_user) THEN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB) RETURNS JSONB AS $$
DECLARE claims JSONB; user_role_val public.user_role;
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
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_modified_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_assignments_modtime ON public.assignments;
CREATE TRIGGER update_assignments_modtime BEFORE UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();
DROP TRIGGER IF EXISTS update_answer_keys_modtime ON public.assignment_answer_keys;
CREATE TRIGGER update_answer_keys_modtime BEFORE UPDATE ON public.assignment_answer_keys FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();
DROP TRIGGER IF EXISTS update_submissions_modtime ON public.submissions;
CREATE TRIGGER update_submissions_modtime BEFORE UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();
DROP TRIGGER IF EXISTS update_ocr_jobs_modtime ON public.ocr_jobs;
CREATE TRIGGER update_ocr_jobs_modtime BEFORE UPDATE ON public.ocr_jobs FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();
DROP TRIGGER IF EXISTS update_grading_results_modtime ON public.grading_results;
CREATE TRIGGER update_grading_results_modtime BEFORE UPDATE ON public.grading_results FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

CREATE OR REPLACE FUNCTION public.process_audit_log() RETURNS TRIGGER AS $$
DECLARE modifier_id UUID; raw_sub TEXT;
BEGIN
    raw_sub := current_setting('request.jwt.claim.sub', true);
    IF raw_sub IS NOT NULL AND raw_sub ~ '^[0-9a-f-]{36}$' THEN modifier_id := raw_sub::UUID; ELSE modifier_id := NULL; END IF;
    IF (TG_OP = 'UPDATE') THEN INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, performed_by) VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), modifier_id); RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN INSERT INTO public.audit_logs (table_name, record_id, action, old_data, performed_by) VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), modifier_id); RETURN OLD;
    ELSIF (TG_OP = 'INSERT') THEN INSERT INTO public.audit_logs (table_name, record_id, action, new_data, performed_by) VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), modifier_id); RETURN NEW; END IF; RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS audit_submissions ON public.submissions; CREATE TRIGGER audit_submissions AFTER INSERT OR UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
DROP TRIGGER IF EXISTS audit_grading_results ON public.grading_results; CREATE TRIGGER audit_grading_results AFTER INSERT OR UPDATE OR DELETE ON public.grading_results FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
DROP TRIGGER IF EXISTS audit_appeals ON public.appeals; CREATE TRIGGER audit_appeals AFTER INSERT OR UPDATE ON public.appeals FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

CREATE OR REPLACE FUNCTION public.guard_job_attempts() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.attempts < OLD.attempts THEN RAISE EXCEPTION 'Job attempts cannot be decreased'; END IF;
  IF NEW.status IN ('completed', 'dead_letter') THEN RETURN NEW; END IF;
  IF NEW.attempts >= NEW.max_attempts THEN
    NEW.status := 'dead_letter';
    NEW.error_log := COALESCE(NEW.error_log, '') || ' | MAX ATTEMPTS REACHED at ' || NOW()::TEXT;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

DROP TRIGGER IF EXISTS guard_ocr_attempts ON public.ocr_jobs; CREATE TRIGGER guard_ocr_attempts BEFORE UPDATE ON public.ocr_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_job_attempts();
DROP TRIGGER IF EXISTS guard_extraction_attempts ON public.extraction_jobs; CREATE TRIGGER guard_extraction_attempts BEFORE UPDATE ON public.extraction_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_job_attempts();

CREATE OR REPLACE FUNCTION public.lock_claimed_at() RETURNS TRIGGER AS $$
BEGIN IF NEW.claimed_at != OLD.claimed_at THEN RAISE EXCEPTION 'claimed_at is immutable after creation'; END IF; RETURN NEW; END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
DROP TRIGGER IF EXISTS lock_review_claim_timestamp ON public.review_claims; CREATE TRIGGER lock_review_claim_timestamp BEFORE UPDATE ON public.review_claims FOR EACH ROW EXECUTE FUNCTION public.lock_claimed_at();

CREATE OR REPLACE FUNCTION public.lock_user_role() RETURNS TRIGGER AS $$
BEGIN IF NEW.role != OLD.role THEN IF auth.uid() IS NOT NULL AND public.get_my_role() != 'admin' THEN RAISE EXCEPTION 'Only admins can change user roles'; END IF; END IF; RETURN NEW; END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
DROP TRIGGER IF EXISTS restrict_role_update ON public.user_profiles; CREATE TRIGGER restrict_role_update BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.lock_user_role();

CREATE OR REPLACE FUNCTION public.lock_appeal_ownership() RETURNS TRIGGER AS $$
BEGIN IF NEW.student_id != OLD.student_id OR NEW.submission_id != OLD.submission_id THEN RAISE EXCEPTION 'appeal student_id and submission_id are immutable'; END IF; RETURN NEW; END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
DROP TRIGGER IF EXISTS restrict_appeal_ownership ON public.appeals; CREATE TRIGGER restrict_appeal_ownership BEFORE UPDATE ON public.appeals FOR EACH ROW EXECUTE FUNCTION public.lock_appeal_ownership();

-- ==========================================
-- 4. ATOMIC CLAIM FUNCTIONS
-- ==========================================
CREATE OR REPLACE FUNCTION public.claim_submission_for_review(p_submission_id uuid, p_ttl_minutes int DEFAULT 30)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_claim_id uuid; v_assignment_id uuid;
BEGIN
  IF public.get_my_role() <> 'reviewer' THEN RAISE EXCEPTION 'Only reviewers can claim (admins must use admin_assign_claim)'; END IF;
  SELECT assignment_id INTO v_assignment_id FROM public.submissions WHERE id = p_submission_id;
  IF NOT EXISTS (SELECT 1 FROM public.reviewer_assignments WHERE reviewer_id = auth.uid() AND assignment_id = v_assignment_id) THEN RAISE EXCEPTION 'Reviewer is not assigned to this course/assignment'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_submission_id::text));
  UPDATE public.submissions SET status = 'reviewing', updated_at = now() WHERE id = p_submission_id AND status IN ('needs_review','graded') RETURNING id INTO p_submission_id;
  IF p_submission_id IS NULL THEN RAISE EXCEPTION 'Submission not claimable'; END IF;
  INSERT INTO public.review_claims(submission_id, reviewer_id, expires_at) VALUES (p_submission_id, auth.uid(), now() + make_interval(mins => greatest(5, least(p_ttl_minutes, 30))))
  ON CONFLICT (submission_id) DO UPDATE SET reviewer_id = EXCLUDED.reviewer_id, expires_at  = EXCLUDED.expires_at WHERE public.review_claims.expires_at <= now() OR public.review_claims.reviewer_id = auth.uid() RETURNING id INTO v_claim_id;
  IF v_claim_id IS NULL THEN RAISE EXCEPTION 'Submission is currently claimed by another reviewer and has not expired'; END IF;
  RETURN v_claim_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_submission_for_review(uuid,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_assign_claim(p_submission_id uuid, p_reviewer_id uuid, p_ttl_minutes int DEFAULT 30)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_claim_id uuid; v_assignment_id uuid;
BEGIN
  IF public.get_my_role() <> 'admin' THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = p_reviewer_id AND up.role = 'reviewer') THEN RAISE EXCEPTION 'Target user is not a reviewer'; END IF;
  SELECT assignment_id INTO v_assignment_id FROM public.submissions WHERE id = p_submission_id;
  IF v_assignment_id IS NULL THEN RAISE EXCEPTION 'Submission not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.reviewer_assignments ra WHERE ra.reviewer_id = p_reviewer_id AND ra.assignment_id = v_assignment_id) THEN RAISE EXCEPTION 'Reviewer not assigned to this assignment'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_submission_id::text));
  UPDATE public.submissions SET status = 'reviewing', updated_at = now() WHERE id = p_submission_id AND status IN ('needs_review','graded') RETURNING id INTO p_submission_id;
  IF p_submission_id IS NULL THEN RAISE EXCEPTION 'Submission not claimable'; END IF;
  INSERT INTO public.review_claims(submission_id, reviewer_id, expires_at) VALUES (p_submission_id, p_reviewer_id, now() + make_interval(mins => greatest(5, least(p_ttl_minutes, 30))))
  ON CONFLICT (submission_id) DO UPDATE SET reviewer_id = EXCLUDED.reviewer_id, expires_at  = EXCLUDED.expires_at WHERE public.review_claims.expires_at <= now() RETURNING id INTO v_claim_id;
  IF v_claim_id IS NULL THEN RAISE EXCEPTION 'Already claimed and not expired'; END IF;
  RETURN v_claim_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_assign_claim(uuid,uuid,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.renew_review_claim(p_submission_id uuid, p_extra_minutes int DEFAULT 30)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_new_expires_at timestamptz;
BEGIN
  IF public.get_my_role() <> 'reviewer' THEN RAISE EXCEPTION 'Only reviewers can renew claims'; END IF;
  UPDATE public.review_claims rc SET expires_at = CASE WHEN least(now() + make_interval(mins => least(p_extra_minutes, 30)), rc.claimed_at + interval '2 hours') > rc.expires_at THEN least(now() + make_interval(mins => least(p_extra_minutes, 30)), rc.claimed_at + interval '2 hours') ELSE rc.expires_at END
  WHERE submission_id = p_submission_id AND reviewer_id = auth.uid() AND expires_at > now() RETURNING expires_at INTO v_new_expires_at;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active claim not found or expired'; END IF;
  IF (SELECT expires_at FROM public.review_claims WHERE submission_id = p_submission_id) <= now() THEN RAISE EXCEPTION 'Renew failed'; END IF;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.renew_review_claim(uuid, int) TO authenticated;

-- ==========================================
-- 5. VIEWS
-- ==========================================
CREATE OR REPLACE VIEW public.submission_files_safe WITH (security_invoker = true) AS
SELECT sf.id, sf.submission_id, sf.page_number, sf.created_at FROM public.submission_files sf
JOIN public.submissions s ON s.id = sf.submission_id WHERE public.get_my_role() IN ('admin','reviewer') OR s.student_id = auth.uid();

-- ==========================================
-- 6. ROW LEVEL SECURITY (RLS) & IDEMPOTENT POLICIES
-- ==========================================
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviewer_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_answer_keys ENABLE ROW LEVEL SECURITY; ALTER TABLE public.assignment_answer_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_files ENABLE ROW LEVEL SECURITY; ALTER TABLE public.submission_files FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extraction_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grading_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY; ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

-- 🛡️ [Fix 2] Drop all existing policies before creating (Idempotent)
DO $$ 
DECLARE
  pol record;
BEGIN
  FOR pol IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- Profiles
CREATE POLICY "users_read_own_profile" ON public.user_profiles FOR SELECT USING (id = auth.uid() OR public.get_my_role() = 'admin' OR (public.get_my_role() = 'reviewer' AND EXISTS (SELECT 1 FROM public.review_claims rc JOIN public.submissions s ON s.id = rc.submission_id WHERE rc.reviewer_id = auth.uid() AND rc.expires_at > NOW() AND s.student_id = user_profiles.id)));
CREATE POLICY "users_update_own_profile" ON public.user_profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "users_admin_update_role" ON public.user_profiles FOR UPDATE USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- Assignments
CREATE POLICY "assignments_read_all_authenticated" ON public.assignments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "assignments_insert_admin_only" ON public.assignments FOR INSERT WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY "assignments_update_admin_only" ON public.assignments FOR UPDATE USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY "assignments_delete_admin_only" ON public.assignments FOR DELETE USING (public.get_my_role() = 'admin');

-- Reviewer Assignments
CREATE POLICY "reviewer_assignments_read_admin" ON public.reviewer_assignments FOR SELECT USING (public.get_my_role() = 'admin');
CREATE POLICY "reviewer_assignments_read_self" ON public.reviewer_assignments FOR SELECT USING (public.get_my_role() = 'reviewer' AND reviewer_id = auth.uid());
CREATE POLICY "reviewer_assignments_write_admin_only" ON public.reviewer_assignments FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- Answer Keys 
CREATE POLICY "answer_keys_read_admin_reviewer" ON public.assignment_answer_keys FOR SELECT USING (public.get_my_role() IN ('admin', 'reviewer'));
CREATE POLICY "answer_keys_write_admin_only" ON public.assignment_answer_keys FOR INSERT WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY "answer_keys_update_admin_only" ON public.assignment_answer_keys FOR UPDATE USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY "answer_keys_delete_admin_only" ON public.assignment_answer_keys FOR DELETE USING (public.get_my_role() = 'admin');

-- Submissions 
CREATE POLICY "submissions_student_read_own" ON public.submissions FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "submissions_student_insert_own" ON public.submissions FOR INSERT WITH CHECK (student_id = auth.uid());
CREATE POLICY "submissions_reviewer_read_assigned" ON public.submissions FOR SELECT USING (public.get_my_role() = 'reviewer' AND EXISTS (SELECT 1 FROM public.review_claims rc WHERE rc.submission_id = id AND rc.reviewer_id = auth.uid() AND rc.expires_at > NOW()));
CREATE POLICY "submissions_admin_all" ON public.submissions FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- Submission Files 
CREATE POLICY "submission_files_privileged_only" ON public.submission_files FOR ALL USING (public.get_my_role() IN ('admin', 'reviewer'));
CREATE POLICY "submission_files_student_read_own_meta" ON public.submission_files FOR SELECT USING (EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.student_id = auth.uid()));

-- Grading Results
CREATE POLICY "grading_results_student_read_published" ON public.grading_results FOR SELECT USING (EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.student_id = auth.uid() AND s.status IN ('published', 'appeal_open', 'appeal_resolved')));
CREATE POLICY "grading_results_reviewer_read_claimed" ON public.grading_results FOR SELECT USING (public.get_my_role() = 'reviewer' AND EXISTS (SELECT 1 FROM public.review_claims rc WHERE rc.submission_id = submission_id AND rc.reviewer_id = auth.uid() AND rc.expires_at > NOW()));
CREATE POLICY "grading_results_reviewer_update_claimed" ON public.grading_results FOR UPDATE USING (public.get_my_role() = 'reviewer' AND EXISTS (SELECT 1 FROM public.review_claims rc WHERE rc.submission_id = submission_id AND rc.reviewer_id = auth.uid() AND rc.expires_at > NOW()));
CREATE POLICY "grading_results_admin_all" ON public.grading_results FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- Review Claims 
CREATE POLICY "review_claims_read_own_or_admin" ON public.review_claims FOR SELECT USING (reviewer_id = auth.uid() OR public.get_my_role() = 'admin');
CREATE POLICY "review_claims_write_admin_only" ON public.review_claims FOR INSERT WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY "review_claims_update_admin_only" ON public.review_claims FOR UPDATE USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY "review_claims_delete_admin_only" ON public.review_claims FOR DELETE USING (public.get_my_role() = 'admin');

-- Appeals
CREATE POLICY "appeals_student_read_own" ON public.appeals FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "appeals_student_insert_own" ON public.appeals FOR INSERT WITH CHECK (student_id = auth.uid() AND EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.student_id = auth.uid() AND s.status = 'appeal_open'));
CREATE POLICY "appeals_reviewer_read_all" ON public.appeals FOR SELECT USING (public.get_my_role() IN ('reviewer', 'admin'));
CREATE POLICY "appeals_reviewer_update_status" ON public.appeals FOR UPDATE USING (public.get_my_role() IN ('reviewer', 'admin')) WITH CHECK (public.get_my_role() IN ('reviewer', 'admin'));
CREATE POLICY "appeals_admin_delete" ON public.appeals FOR DELETE USING (public.get_my_role() = 'admin');

-- Audit & Jobs
CREATE POLICY "audit_logs_admin_read_only" ON public.audit_logs FOR SELECT USING (public.get_my_role() = 'admin');
CREATE POLICY "ocr_jobs_admin_only" ON public.ocr_jobs FOR ALL USING (public.get_my_role() = 'admin');
CREATE POLICY "extraction_jobs_admin_only" ON public.extraction_jobs FOR ALL USING (public.get_my_role() = 'admin');

-- ==========================================
-- 7. COLUMN-LEVEL SECURITY [Fix 1]
-- ==========================================
REVOKE ALL ON public.submission_files FROM PUBLIC;
REVOKE ALL ON public.submission_files FROM anon;
REVOKE ALL ON public.submission_files FROM authenticated;

-- ✅ [Fix 1] คืนสิทธิ์ให้ Authenticated อ่านเฉพาะคอลัมน์ที่ปลอดภัย (เพื่อให้ View ทำงานได้)
GRANT SELECT (id, submission_id, page_number, created_at) ON public.submission_files TO authenticated;
GRANT SELECT ON public.submission_files_safe TO authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT (storage_path), UPDATE (storage_path) ON public.submission_files TO service_role;
  END IF;
END $$;
COMMENT ON COLUMN public.submission_files.storage_path IS 'Restricted: accessible only via service_role. Use get_submission_file_signed_url() for client access.';

-- ==========================================
-- 8. INDEXES 
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON public.submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student_status ON public.submissions(student_id, status);
CREATE INDEX IF NOT EXISTS idx_submission_files_submission ON public.submission_files(submission_id);
CREATE INDEX IF NOT EXISTS idx_grading_results_submission ON public.grading_results(submission_id);
CREATE INDEX IF NOT EXISTS idx_review_claims_reviewer ON public.review_claims(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_review_claims_submission_expires ON public.review_claims(submission_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_appeals_submission ON public.appeals(submission_id);
CREATE INDEX IF NOT EXISTS idx_appeals_student ON public.appeals(student_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON public.audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON public.audit_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_ocr_jobs_pending ON public.ocr_jobs(created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_pending ON public.extraction_jobs(created_at) WHERE status = 'pending';

-- ✅ FIX: remove partial index using NOW() (not IMMUTABLE) to avoid ERROR 42P17
-- ❌ CREATE INDEX IF NOT EXISTS idx_review_claims_expires_partial ON public.review_claims(expires_at) WHERE expires_at > NOW();
-- ✅ Replacement: keep an ordinary expires_at index if you want faster "expires_at > now()" scans
CREATE INDEX IF NOT EXISTS idx_review_claims_expires ON public.review_claims(expires_at);

CREATE INDEX IF NOT EXISTS idx_review_claims_reviewer_expires_submission ON public.review_claims(reviewer_id, expires_at, submission_id);
CREATE INDEX IF NOT EXISTS idx_reviewer_assignments_assignment ON public.reviewer_assignments(assignment_id, reviewer_id);

-- ==========================================
-- ==========================================
-- 9. PG_CRON (Idempotent + Safe)
-- ==========================================

-- Ensure extension exists (Supabase usually requires this to be run by postgres)
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  v_jobid int;
BEGIN
  -- Find existing job id by name (pg_cron stores jobs in cron.job)
  SELECT jobid INTO v_jobid
  FROM cron.job
  WHERE jobname = 'cleanup-expired-claims'
  LIMIT 1;

  -- Unschedule only if exists (avoids "could not find valid entry" error)
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  -- Schedule fresh (by name)
  PERFORM cron.schedule(
    'cleanup-expired-claims',
    '*/5 * * * *',
    $cron$
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
          SELECT 1
          FROM public.review_claims rc
          WHERE rc.submission_id = public.submissions.id
            AND rc.expires_at > NOW()
        );
    $cron$
  );
END
$$;