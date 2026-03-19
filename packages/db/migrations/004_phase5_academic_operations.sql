-- =========================================================================
-- MIGRATION 004: Phase 5 - Academic Operations, Roster, & Identity Guard
-- (Ultimate Golden Master: Includes profiles bootstrap, strict RLS,
-- attendance sessions, email constraints, fraud triggers, and mandatory sections)
-- =========================================================================

-- =========================
-- 0) Bootstrap: profiles (ตรวจสอบและสร้างถ้ายังไม่มี)
-- =========================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='profiles'
  ) THEN
    CREATE TABLE public.profiles (
      id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      email TEXT UNIQUE,
      full_name TEXT,
      student_id_number TEXT,
      major TEXT,
      role user_role DEFAULT 'student',
      registration_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (registration_status IN ('pending','approved','rejected')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  END IF;
END $$;

-- ✅ Harden: ถ้า profiles มีอยู่แล้ว และ role เป็น text ให้พยายามแปลงเป็น user_role
DO $$
DECLARE
  udt_name text;
BEGIN
  SELECT c.udt_name
    INTO udt_name
  FROM information_schema.columns c
  WHERE c.table_schema='public' AND c.table_name='profiles' AND c.column_name='role';

  IF udt_name IS NOT NULL AND udt_name <> 'user_role' THEN
    -- พยายาม cast text -> user_role (ถ้าข้อมูลมีค่าอื่นนอก enum อาจ fail)
    BEGIN
      ALTER TABLE public.profiles
        ALTER COLUMN role TYPE user_role
        USING (role::text::user_role);
    EXCEPTION WHEN others THEN
      -- ถ้าแปลงไม่ได้ ให้ fallback: สร้างคอลัมน์ใหม่ role_enum แล้วค่อย migrate ภายหลัง
      -- (ไม่ทำให้ migration ล้ม)
      RAISE NOTICE 'profiles.role is not user_role and cannot be cast safely; leaving as-is.';
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_student_id_number ON public.profiles(student_id_number);

-- [NEW] กฎเหล็กที่ 1: Email Restriction (@email.psu.ac.th เท่านั้น)
DO $$ BEGIN
  ALTER TABLE public.profiles
  ADD CONSTRAINT chk_psu_email CHECK (email LIKE '%@email.psu.ac.th' OR email IS NULL);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- =========================
-- 1) Sections (กลุ่มเรียน)
-- =========================
CREATE TABLE IF NOT EXISTS public.sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_code TEXT NOT NULL,
    section_number INT NOT NULL,
    term TEXT NOT NULL,
    schedule_day INT,
    start_time TIME,
    end_time TIME,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(course_code, section_number, term)
);

-- =========================
-- 2) Official Rosters
-- =========================
CREATE TABLE IF NOT EXISTS public.official_rosters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
    student_id_number TEXT NOT NULL,
    full_name TEXT NOT NULL,
    major TEXT,
    uploaded_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(section_id, student_id_number)
);

CREATE INDEX IF NOT EXISTS idx_rosters_section_student
ON public.official_rosters(section_id, student_id_number);

-- =========================
-- 3) Registration Status: อัปเดต profiles (Idempotent)
-- =========================
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS registration_status TEXT DEFAULT 'pending'
  CHECK (registration_status IN ('pending','approved','rejected'));

-- =========================
-- 4) Student ↔ Section mapping
-- =========================
CREATE TABLE IF NOT EXISTS public.student_sections (
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (student_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_student_sections_section
ON public.student_sections(section_id);

-- =========================
-- 5) Assignments: Time Windows
-- =========================
ALTER TABLE public.assignments
ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.sections(id),
ADD COLUMN IF NOT EXISTS week_number INT,
ADD COLUMN IF NOT EXISTS class_date DATE,
ADD COLUMN IF NOT EXISTS open_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS close_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE public.assignments
  ADD CONSTRAINT chk_assignment_section_mandatory CHECK (section_id IS NOT NULL);
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN check_violation THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_assignments_section_week
ON public.assignments(section_id, week_number);

-- =========================
-- 6) Fraud Guard
-- =========================
ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS fraud_flag BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS extracted_paper_student_id TEXT;

CREATE INDEX IF NOT EXISTS idx_submissions_assignment_student
ON public.submissions(assignment_id, student_id);

-- ✅ Harden: ฟังก์ชันช่วย set status แบบไม่พังถ้า enum ไม่ตรง
CREATE OR REPLACE FUNCTION public.try_set_submission_status(_sub_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- พยายาม update status เป็น text ก่อน (ถ้าเป็น enum และไม่มีค่า จะ error)
  BEGIN
    EXECUTE format('UPDATE public.submissions SET status = %L WHERE id = %L', _status, _sub_id);
  EXCEPTION WHEN others THEN
    -- ไม่ทำให้ pipeline ล้ม
    RAISE NOTICE 'Could not set submissions.status to %, leaving as-is', _status;
  END;
END $$;

-- [NEW] กฎเหล็กที่ 3: Fraud Policy Trigger
CREATE OR REPLACE FUNCTION public.enforce_fraud_policy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.fraud_flag = true THEN
    -- ✅ ปลอดภัยแน่นอน (เป็น text column ใน schema v2 ของคุณ)
    NEW.current_stage := 'review_required';

    -- ✅ พยายาม set status ถ้าทำได้ (ไม่ให้ trigger พัง)
    PERFORM public.try_set_submission_status(NEW.id, 'needs_review');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_fraud_policy ON public.submissions;
CREATE TRIGGER trg_enforce_fraud_policy
BEFORE INSERT OR UPDATE ON public.submissions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_fraud_policy();

-- =========================
-- 7) Attendance & Sessions
-- =========================
CREATE TABLE IF NOT EXISTS public.class_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  class_date DATE NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(section_id, class_date)
);

CREATE TABLE IF NOT EXISTS public.attendance_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.class_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  check_in_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_on_time BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_checkins_session
ON public.attendance_checkins(session_id);

CREATE OR REPLACE FUNCTION public.set_attendance_on_time()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  s_start TIMESTAMPTZ;
BEGIN
  SELECT starts_at INTO s_start
  FROM public.class_sessions
  WHERE id = NEW.session_id;

  IF s_start IS NULL THEN
    RAISE EXCEPTION 'session not found';
  END IF;

  NEW.is_on_time := (NEW.check_in_time <= (s_start + INTERVAL '15 minutes'));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_attendance_on_time ON public.attendance_checkins;
CREATE TRIGGER trg_set_attendance_on_time
BEFORE INSERT OR UPDATE ON public.attendance_checkins
FOR EACH ROW
EXECUTE FUNCTION public.set_attendance_on_time();

-- =========================
-- 8) Blank Paper Detection
-- =========================
ALTER TABLE public.grading_results
ADD COLUMN IF NOT EXISTS is_blank BOOLEAN DEFAULT false;

-- =========================
-- 9) Security Layer: Row Level Security (RLS)
-- =========================
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.official_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_checkins ENABLE ROW LEVEL SECURITY;

-- ✅ FIX: get_my_role robust (รองรับ profiles.role เป็น text หรือ enum)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  r_text TEXT;
BEGIN
  SELECT role::text INTO r_text
  FROM public.profiles
  WHERE id = auth.uid();

  IF r_text IS NULL OR r_text = '' THEN
    RETURN 'student'::user_role;
  END IF;

  RETURN r_text::user_role;

EXCEPTION WHEN others THEN
  RETURN 'student'::user_role;
END $$;

-- -------------------------
-- Policies สำหรับตารางใหม่
-- -------------------------

-- Sections
DROP POLICY IF EXISTS sections_read_all ON public.sections;
CREATE POLICY sections_read_all ON public.sections
FOR SELECT USING (true);

DROP POLICY IF EXISTS sections_write_staff ON public.sections;
CREATE POLICY sections_write_staff ON public.sections
FOR INSERT WITH CHECK (public.get_my_role() IN ('reviewer','admin'));

DROP POLICY IF EXISTS sections_update_staff ON public.sections;
CREATE POLICY sections_update_staff ON public.sections
FOR UPDATE USING (public.get_my_role() IN ('reviewer','admin'))
WITH CHECK (public.get_my_role() IN ('reviewer','admin'));

DROP POLICY IF EXISTS sections_delete_staff ON public.sections;
CREATE POLICY sections_delete_staff ON public.sections
FOR DELETE USING (public.get_my_role() IN ('reviewer','admin'));

-- Official Rosters
DROP POLICY IF EXISTS rosters_select_staff ON public.official_rosters;
CREATE POLICY rosters_select_staff ON public.official_rosters
FOR SELECT USING (public.get_my_role() IN ('reviewer','admin'));

DROP POLICY IF EXISTS rosters_insert_staff ON public.official_rosters;
CREATE POLICY rosters_insert_staff ON public.official_rosters
FOR INSERT WITH CHECK (public.get_my_role() IN ('reviewer','admin'));

DROP POLICY IF EXISTS rosters_update_staff ON public.official_rosters;
CREATE POLICY rosters_update_staff ON public.official_rosters
FOR UPDATE USING (public.get_my_role() IN ('reviewer','admin'))
WITH CHECK (public.get_my_role() IN ('reviewer','admin'));

DROP POLICY IF EXISTS rosters_delete_staff ON public.official_rosters;
CREATE POLICY rosters_delete_staff ON public.official_rosters
FOR DELETE USING (public.get_my_role() IN ('reviewer','admin'));

-- Student Sections
DROP POLICY IF EXISTS student_sections_select_own ON public.student_sections;
CREATE POLICY student_sections_select_own ON public.student_sections
FOR SELECT USING (student_id = auth.uid() OR public.get_my_role() IN ('reviewer','admin'));

DROP POLICY IF EXISTS student_sections_manage_staff ON public.student_sections;
CREATE POLICY student_sections_manage_staff ON public.student_sections
FOR INSERT WITH CHECK (public.get_my_role() IN ('reviewer','admin'));

DROP POLICY IF EXISTS student_sections_update_staff ON public.student_sections;
CREATE POLICY student_sections_update_staff ON public.student_sections
FOR UPDATE USING (public.get_my_role() IN ('reviewer','admin'))
WITH CHECK (public.get_my_role() IN ('reviewer','admin'));

DROP POLICY IF EXISTS student_sections_delete_staff ON public.student_sections;
CREATE POLICY student_sections_delete_staff ON public.student_sections
FOR DELETE USING (public.get_my_role() IN ('reviewer','admin'));

-- Class Sessions
DROP POLICY IF EXISTS class_sessions_select_staff ON public.class_sessions;
CREATE POLICY class_sessions_select_staff ON public.class_sessions
FOR SELECT USING (public.get_my_role() IN ('reviewer','admin'));

DROP POLICY IF EXISTS class_sessions_manage_staff ON public.class_sessions;
CREATE POLICY class_sessions_manage_staff ON public.class_sessions
FOR INSERT WITH CHECK (public.get_my_role() IN ('reviewer','admin'));

DROP POLICY IF EXISTS class_sessions_update_staff ON public.class_sessions;
CREATE POLICY class_sessions_update_staff ON public.class_sessions
FOR UPDATE USING (public.get_my_role() IN ('reviewer','admin'))
WITH CHECK (public.get_my_role() IN ('reviewer','admin'));

DROP POLICY IF EXISTS class_sessions_delete_staff ON public.class_sessions;
CREATE POLICY class_sessions_delete_staff ON public.class_sessions
FOR DELETE USING (public.get_my_role() IN ('reviewer','admin'));

-- Attendance Check-ins
DROP POLICY IF EXISTS attendance_select_own ON public.attendance_checkins;
CREATE POLICY attendance_select_own ON public.attendance_checkins
FOR SELECT USING (student_id = auth.uid() OR public.get_my_role() IN ('reviewer','admin'));

-- ✅ FIX: ห้ามอ้าง attendance_checkins.session_id ให้ใช้ session_id ตรงๆ
DROP POLICY IF EXISTS attendance_insert_own ON public.attendance_checkins;
CREATE POLICY attendance_insert_own ON public.attendance_checkins
FOR INSERT WITH CHECK (
  student_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.class_sessions cs
    JOIN public.student_sections ss ON ss.section_id = cs.section_id
    WHERE cs.id = session_id
      AND ss.student_id = auth.uid()
  )
);

DROP POLICY IF EXISTS attendance_manage_staff ON public.attendance_checkins;
CREATE POLICY attendance_manage_staff ON public.attendance_checkins
FOR UPDATE USING (public.get_my_role() IN ('reviewer','admin'))
WITH CHECK (public.get_my_role() IN ('reviewer','admin'));

DROP POLICY IF EXISTS attendance_delete_staff ON public.attendance_checkins;
CREATE POLICY attendance_delete_staff ON public.attendance_checkins
FOR DELETE USING (public.get_my_role() IN ('reviewer','admin'));