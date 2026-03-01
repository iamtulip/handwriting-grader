-- Database Function สำหรับเปิดใช้งาน Spec (Atomic Transaction)
CREATE OR REPLACE FUNCTION public.activate_layout_spec(p_spec_id UUID, p_assignment_id UUID)
RETURNS void AS $$
BEGIN
  -- 1. ปิด Active ทุกตัวของวิชานี้
  UPDATE public.assignment_layout_specs
  SET is_active = false
  WHERE assignment_id = p_assignment_id;

  -- 2. เปิดตัวที่ระบุ
  UPDATE public.assignment_layout_specs
  SET is_active = true
  WHERE id = p_spec_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;