-- Migration: 20260225000001_rls_policies.sql
-- Description: Strict Row Level Security Policies

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extraction_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grading_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helpers Functions for Policies
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin');
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_reviewer() RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('reviewer', 'admin'));
$$ LANGUAGE sql SECURITY DEFINER;

-- ==========================================
-- POLICIES
-- ==========================================

-- User Profiles
CREATE POLICY "Users can read own profile" ON public.user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins have full access to profiles" ON public.user_profiles FOR ALL USING (is_admin());

-- Assignments
CREATE POLICY "Anyone can read published assignments" ON public.assignments FOR SELECT USING (true);
CREATE POLICY "Admins have full access to assignments" ON public.assignments FOR ALL USING (is_admin());

-- Submissions
CREATE POLICY "Students can read own submissions" ON public.submissions FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "Students can insert own submissions" ON public.submissions FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Reviewers can read all submissions" ON public.submissions FOR SELECT USING (is_reviewer());
CREATE POLICY "Reviewers can update claimed submissions" ON public.submissions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.review_claims WHERE submission_id = submissions.id AND reviewer_id = auth.uid()) OR is_admin()
);

-- Submission Files
CREATE POLICY "Students can read own files" ON public.submission_files FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.submissions WHERE id = submission_files.submission_id AND student_id = auth.uid())
);
CREATE POLICY "Reviewers can read all files" ON public.submission_files FOR SELECT USING (is_reviewer());

-- Grading Results
CREATE POLICY "Students can read own results if published" ON public.grading_results FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.submissions WHERE id = grading_results.submission_id AND student_id = auth.uid() AND status = 'published')
);
CREATE POLICY "Reviewers have full access to results" ON public.grading_results FOR ALL USING (is_reviewer());

-- Appeals
CREATE POLICY "Students can manage own appeals" ON public.appeals FOR ALL USING (auth.uid() = student_id);
CREATE POLICY "Reviewers can update appeals" ON public.appeals FOR ALL USING (is_reviewer());

-- Service Role (Jobs/Workers running in Backend/Cloud Run)
-- Note: Service Role key bypasses RLS automatically, no need to write specific policies for ocr_jobs or extraction_jobs here.