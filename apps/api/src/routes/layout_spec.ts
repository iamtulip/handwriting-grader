import { Router } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

// API สำหรับสร้าง Layout Spec (Stage: Instructor Authoring)
router.post('/register', async (req, res) => {
  const { assignmentId, layoutSpec } = req.body;

  // Validate Layout Spec (ต้องมี Polygons และ Answer Type)
  if (!layoutSpec.rois || layoutSpec.rois.length === 0) {
    return res.status(400).json({ error: "Invalid layout spec: ROIs required" });
  }

  const { data, error } = await supabase
    .from('assignments')
    .update({ 
      layout_spec: layoutSpec,
      spec_version: Math.floor(Date.now() / 1000) 
    })
    .eq('id', assignmentId)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  
  return res.json({ message: "Layout spec registered successfully", data });
});

export default router;