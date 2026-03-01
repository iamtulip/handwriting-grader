-- Migration: 20260225000002_storage_setup.sql
-- Description: Setup Supabase Storage bucket for exam papers with strict security.

-- 1. สร้าง Bucket แบบ Private (public = false)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exam-papers',
  'exam-papers',
  false,
  10485760, -- Limit 10MB ต่อไฟล์
  ARRAY['image/jpeg', 'image/png', 'application/pdf']
) ON CONFLICT (id) DO UPDATE 
SET public = false, 
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf'];

-- 2. เปิด RLS ให้กับ storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Storage Policies
-- ไม่อนุญาตให้ Client (เบราว์เซอร์) เข้าถึง Storage โดยตรงเลยแม้แต่นิดเดียว!
-- ทุกอย่างต้องวิ่งผ่าน Next.js API (Service Role) เพื่อตรวจสอบสิทธิ์ในฐานข้อมูลก่อนเสมอ
-- ดังนั้นเราจะดรอป Policy สาธารณะทิ้ง (ถ้ามี) และพึ่งพา Service Role bypass RLS เท่านั้น
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Access" ON storage.objects;

-- สร้าง Policy ป้องกันไว้ (Deny All สำหรับ Client)
CREATE POLICY "Deny direct client access to objects" 
ON storage.objects FOR ALL 
TO authenticated, anon 
USING (false);