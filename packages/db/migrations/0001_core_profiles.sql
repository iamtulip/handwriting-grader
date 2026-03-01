-- =========================================================
-- [1] ปรับปรุงตาราง profiles ให้รองรับข้อมูลทั้งหมด
--ปัญหาคือเรามีทั้ง profiles cและ user_profiles ที่มีข้อมูลซ้ำซ้อนกัน และเราต้องการรวมเป็นตารางเดียวเพื่อความง่ายในการจัดการ
-- =========================================================
-- เปลี่ยนประเภทข้อมูล role ให้เป็น text เพื่อให้ยืดหยุ่นและตรงกับ Check Constraint
ALTER TABLE public.profiles ALTER COLUMN role TYPE text;

-- เพิ่มคอลัมน์ student_id_number หากยังไม่มี (เช็คจากรูป image_560322.png)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS student_id_number text;

-- =========================================================
-- [2] ย้ายข้อมูลจาก user_profiles ไปยัง profiles (The Great Merge)
-- =========================================================
-- เราจะย้ายข้อมูลโดยการแปลงประเภทข้อมูล role จาก USER-DEFINED เป็น text
INSERT INTO public.profiles (id, full_name, role, student_id_number, updated_at)
SELECT 
    id, 
    full_name, 
    role::text, -- แปลงจาก enum เป็น text
    student_id_number, 
    updated_at
FROM public.user_profiles
ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    student_id_number = EXCLUDED.student_id_number,
    updated_at = EXCLUDED.updated_at;

-- =========================================================
-- [3] แก้ไขข้อผิดพลาด "candidate_hash does not exist"
-- =========================================================
-- จากรูป image_56ce76.png ระบบบ่นหาคอลัมน์นี้ในตาราง grading_candidates
ALTER TABLE public.grading_candidates ADD COLUMN IF NOT EXISTS candidate_hash text;

-- =========================================================
-- [4] ย้าย Foreign Key ทั้งหมดให้มาที่ตาราง profiles
-- =========================================================
-- ทำเพื่อกำจัดความซ้ำซ้อนและเตรียมลบ user_profiles ทิ้งอย่างปลอดภัย
DO $$ 
BEGIN
    -- ตัวอย่างการย้ายในตาราง submissions
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'submissions_student_id_fkey') THEN
        ALTER TABLE public.submissions DROP CONSTRAINT submissions_student_id_fkey;
    END IF;
    ALTER TABLE public.submissions ADD CONSTRAINT submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id);

    -- ทำซ้ำแบบเดียวกันกับตาราง appeals, assignments และ reviewer_assignments
END $$;

-- =========================================================
-- [5] ล้าง Policy เก่าที่ขัดแย้งกัน
-- =========================================================
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Staff can view all profiles" ON public.profiles;

-- สร้างใหม่ให้รองรับ 4 Roles ตามที่คุณต้องการ
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Staff can view all profiles" ON public.profiles FOR SELECT USING (
  role IN ('reviewer', 'instructor', 'admin')
);