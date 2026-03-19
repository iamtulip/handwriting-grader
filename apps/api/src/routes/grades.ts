// apps/api/src/routes/grades.ts
import { Router, Response } from 'express';
import { AuthRequest, requireAuth, requireReviewer } from '../utils/requireReviewer';
import { getServiceSupabase } from '../lib/supabase';

const router = Router();

// 1. API สำหรับนักศึกษา: ดูคะแนนของตัวเองทั้งหมด
router.get('/my-grades', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const supa = getServiceSupabase();
  const userId = req.user!.id;

  try {
    const { data, error } = await supa
      .from('submissions')
      .select(`
        id, submitted_at, status, assignment_id,
        assignments ( title, assignment_type ),
        grading_results ( final_score, final_meta_score, meta_score_attendance, meta_score_punctuality, meta_score_accuracy, is_blank )
      `)
      .eq('student_id', userId)
      .order('submitted_at', { ascending: false });

    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. API สำหรับอาจารย์: ดึงคะแนนทั้ง Section เพื่อนำไป Export Excel
router.get('/section/:sectionId', requireReviewer as any, async (req: AuthRequest, res: Response) => {
  const supa = getServiceSupabase();
  const { sectionId } = req.params;

  try {
    // ดึงรายชื่อนักศึกษาจาก official_rosters
    const { data: roster, error: rosterErr } = await supa
      .from('official_rosters')
      .select('student_id_number, full_name, major')
      .eq('section_id', sectionId)
      .order('student_id_number', { ascending: true });

    if (rosterErr) throw rosterErr;

    // ดึงข้อมูลคะแนนของ Section นี้
    const { data: grades, error: gradesErr } = await supa
      .from('submissions')
      .select(`
        student_id, 
        profiles!inner(student_id_number),
        assignments!inner(id, title, assignment_type, section_id),
        grading_results ( final_score, final_meta_score )
      `)
      .eq('assignments.section_id', sectionId)
      .eq('status', 'graded');

    if (gradesErr) throw gradesErr;

    // จัดกลุ่มคะแนนให้ตรงกับรายชื่อ (Data Transformation)
    const exportData = roster.map(student => {
      
      // FIX: แปลง Type ให้ปลอดภัย (Safe Access) เพื่อลบเส้นแดง
      const studentGrades = (grades || []).filter(g => {
        const prof: any = g.profiles;
        // ถ้าระบบส่งกลับมาเป็น Array ให้เอาตัวแรก ถ้าเป็น Object ให้เรียกตรงๆ
        const sid = Array.isArray(prof) ? prof[0]?.student_id_number : prof?.student_id_number;
        return sid === student.student_id_number;
      });
      
      let totalMetaScore = 0;
      let totalRawScore = 0;
      const assignmentDetails: any = {};
      
      studentGrades.forEach(sg => {
        // FIX: รองรับข้อมูล Assignment ที่อาจถูกมองว่าเป็น Array
        const asm: any = Array.isArray(sg.assignments) ? sg.assignments[0] : sg.assignments;
        const title = asm?.title || 'Unknown';
        const type = asm?.assignment_type;

        // FIX: รองรับข้อมูล Grading Results
        const resultsInfo: any = sg.grading_results;
        const res = Array.isArray(resultsInfo) ? resultsInfo[0] : resultsInfo;
        
        if (type === 'weekly_exercise') {
          assignmentDetails[title] = res?.final_meta_score || 0;
          totalMetaScore += res?.final_meta_score || 0;
        } else {
          assignmentDetails[title] = res?.final_score || 0;
          totalRawScore += res?.final_score || 0;
        }
      });

      return {
        'รหัสนักศึกษา': student.student_id_number,
        'ชื่อ-นามสกุล': student.full_name,
        'สาขาวิชา': student.major || '-',
        ...assignmentDetails,
        'รวมคะแนนเก็บ (Meta)': Number(totalMetaScore.toFixed(2)),
        'รวมคะแนนสอบ (Raw)': Number(totalRawScore.toFixed(2))
      };
    });

    return res.json({ success: true, data: exportData });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;