-- Phase 1-3 Unified Schema: Diamond Grading System
-- ล้างข้อมูลเก่าเพื่อเริ่มใหม่ตามสถาปัตยกรรม V2 (เฉพาะตอนพัฒนาระบบใหม่)

-- 1. ตาราง Assignments (เพิ่ม Layout Spec Version)
CREATE TABLE IF NOT EXISTS public.assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    course_id TEXT,
    layout_spec JSONB DEFAULT '{}', -- เก็บ ROI Polygons, Expected Types, Tolerance
    spec_version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ตาราง Submissions (ขยาย Status ตาม Flowchart ใหม่)
CREATE TYPE submission_status AS ENUM (
    'pending',      -- เพิ่งอัปโหลด
    'quality_gate', -- กำลังตรวจคุณภาพภาพ
    'aligning',     -- กำลังทำ 2-pass alignment
    'extracting',   -- กำลังทำ OCR A/B/Math
    'grading',      -- กำลังทำ Equivalence/LLM Verify
    'completed',    -- เสร็จสิ้น
    'failed',       -- ผิดพลาด (ส่งเข้า DLQ)
    'review_required' -- มนุษย์ต้องตรวจ (Confidence ต่ำ)
);

CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID REFERENCES public.assignments(id),
    student_id UUID NOT NULL,
    status submission_status DEFAULT 'pending',
    retry_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ตาราง Artifacts (เก็บหลักฐานการตรวจตามที่ DeepMind/Microsoft แนะนำ)
CREATE TABLE IF NOT EXISTS public.submission_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE,
    step_name TEXT NOT NULL, -- 'quality', 'alignment', 'ocr_a', 'ocr_b', 'candidates'
    artifact_data JSONB NOT NULL, -- เก็บ Metadata เช่น RMSE, Lattice Candidates, OCR Text
    storage_path TEXT, -- ลิงก์ไปยังรูป ROI หรือรูปที่ Dewarp แล้ว
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. ตาราง Grading Results (Explainable AI + Audit)
CREATE TABLE IF NOT EXISTS public.grading_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE,
    question_number INT NOT NULL,
    final_score FLOAT8,
    confidence_score FLOAT8, -- Calibrated Confidence
    decision_reason TEXT, -- เหตุผลที่ระบบให้คะแนน (Symbolic/Numeric/LLM)
    is_human_override BOOLEAN DEFAULT FALSE,
    evidence_map JSONB, -- Pointers ไปยังตำแหน่งในรูป
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. RLS Policies (Security จาก Phase 1)
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students can view own submissions" ON public.submissions
    FOR SELECT USING (auth.uid() = student_id);

CREATE POLICY "Service role has full access" ON public.submissions
    USING (auth.role() = 'service_role');