-- Migration: 00000000000002_layout_spec.sql
-- Description: Infrastructure for Layout Spec & Alignment Proofs

-- ตารางเก็บ Layout ของแต่ละ Assignment (อาจารย์ลากกรอบไว้)
CREATE TABLE IF NOT EXISTS public.assignment_layout_specs (
  assignment_id UUID PRIMARY KEY REFERENCES public.assignments(id) ON DELETE CASCADE,
  spec_version INT NOT NULL DEFAULT 1,
  layout_json JSONB NOT NULL, -- เก็บพิกัด [ [x1,y1], [x2,y2]... ] ของแต่ละข้อ
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ตารางเก็บหลักฐานการจัดวางรูปภาพ (Alignment Proof) เพื่อใช้ในการอุทธรณ์
CREATE TABLE IF NOT EXISTS public.submission_alignment_proofs (
  submission_id UUID PRIMARY KEY REFERENCES public.submissions(id) ON DELETE CASCADE,
  transform_matrix FLOAT8[] NOT NULL, -- Matrix H สำหรับ Dewarp
  rmse_error FLOAT8, -- ค่าความคลาดเคลื่อนของการแปะ Template
  aligned_image_path TEXT, -- เก็บรูปที่ถูกบิดให้ตรงแล้ว
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- เพิ่ม Metadata ใน grading_results เพื่อเก็บ Trace Log (Explainable AI)
ALTER TABLE public.grading_results 
ADD COLUMN IF NOT EXISTS candidate_set JSONB,
ADD COLUMN IF NOT EXISTS proof_log JSONB,
ADD COLUMN IF NOT EXISTS evidence_map JSONB;