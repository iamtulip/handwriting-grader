-- สร้างตารางเก็บโปรไฟล์และบทบาทผู้ใช้งาน
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    role TEXT NOT NULL CHECK (role IN ('student', 'reviewer', 'instructor', 'admin')) DEFAULT 'student',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- เปิดการใช้งาน RLS สำหรับความปลอดภัย
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- อนุญาตให้ผู้ใช้ดูโปรไฟล์ตัวเอง และผู้สอนดูโปรไฟล์นักศึกษาได้
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Staff can view all profiles" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Staff can view all profiles" ON public.profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('reviewer', 'instructor', 'admin'))
);

-- ==========================================
-- STEP 1: PREPARE NEW PROFILES (SAFETY FIRST)
-- ==========================================

-- ตรวจสอบให้แน่ใจว่าตาราง profiles มีโครงสร้างครบถ้วน
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS student_id_number TEXT;

-- ย้ายข้อมูลจาก user_profiles ไปยัง profiles 
-- (ใช้ ON CONFLICT เพื่อไม่ให้เกิด Error ถ้ามีข้อมูลซ้ำ)
INSERT INTO public.profiles (id, full_name, role, student_id_number)
SELECT id, full_name, role::text, student_id_number 
FROM public.user_profiles
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  student_id_number = EXCLUDED.student_id_number;

-- ==========================================
-- STEP 2: RE-LINKING FOREIGN KEYS (THE CORE MERGE)
-- เปลี่ยนจุดเชื่อมต่อจาก user_profiles -> profiles
-- ==========================================

-- ตาราง Submissions
ALTER TABLE public.submissions DROP CONSTRAINT IF EXISTS submissions_student_id_fkey;
ALTER TABLE public.submissions ADD CONSTRAINT submissions_student_id_fkey 
FOREIGN KEY (student_id) REFERENCES public.profiles(id);

-- ตาราง Appeals (ทั้งคนยื่นและคนแก้)
ALTER TABLE public.appeals DROP CONSTRAINT IF EXISTS appeals_student_id_fkey;
ALTER TABLE public.appeals ADD CONSTRAINT appeals_student_id_fkey 
FOREIGN KEY (student_id) REFERENCES public.profiles(id);

ALTER TABLE public.appeals DROP CONSTRAINT IF EXISTS appeals_resolved_by_fkey;
ALTER TABLE public.appeals ADD CONSTRAINT appeals_resolved_by_fkey 
FOREIGN KEY (resolved_by) REFERENCES public.profiles(id);

-- ตาราง Assignments (ผู้สร้าง)
ALTER TABLE public.assignments DROP CONSTRAINT IF EXISTS assignments_created_by_fkey;
ALTER TABLE public.assignments ADD CONSTRAINT assignments_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES public.profiles(id);

-- ตาราง Reviewer Assignments
ALTER TABLE public.reviewer_assignments DROP CONSTRAINT IF EXISTS reviewer_assignments_reviewer_id_fkey;
ALTER TABLE public.reviewer_assignments ADD CONSTRAINT reviewer_assignments_reviewer_id_fkey 
FOREIGN KEY (reviewer_id) REFERENCES public.profiles(id);

-- ตาราง Review Claims
ALTER TABLE public.review_claims DROP CONSTRAINT IF EXISTS review_claims_reviewer_id_fkey;
ALTER TABLE public.review_claims ADD CONSTRAINT review_claims_reviewer_id_fkey 
FOREIGN KEY (reviewer_id) REFERENCES public.profiles(id);

-- ==========================================
-- STEP 3: CLEANUP (OPTIONAL BUT RECOMMENDED)
-- ==========================================

-- เมื่อมั่นใจว่า Foreign Keys ย้ายมาครบแล้ว จึงลบตารางเก่า
-- (หากยังไม่มั่นใจ สามารถข้ามคำสั่งนี้ไปก่อนได้ครับ)
-- DROP TABLE public.user_profiles CASCADE;

-- ==========================================
-- STEP 4: ALIGNMENT CHECK
-- ==========================================
-- ตรวจสอบว่าคอลัมน์สำคัญใน V2 ต้องมีอยู่ครบ (Idempotency)
ALTER TABLE public.grading_results ADD COLUMN IF NOT EXISTS is_human_override BOOLEAN DEFAULT false;
ALTER TABLE public.grading_results ADD COLUMN IF NOT EXISTS manual_reason TEXT;