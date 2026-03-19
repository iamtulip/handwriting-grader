// apps/api/src/routes/student.ts
import { Router, Response } from 'express';
import { AuthRequest, requireAuth } from '../utils/requireReviewer';
import { getServiceSupabase } from '../lib/supabase';

const router = Router();

router.get('/dashboard', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const supa = getServiceSupabase();
  const userId = req.user!.id;

  try {
    // 1. ดึง Profile เพื่อเอารหัสนักศึกษาของคนที่ล็อกอินอยู่
    const { data: profile, error: profErr } = await supa
      .from('profiles')
      .select('full_name, student_id_number')
      .eq('id', userId)
      .single();

    if (profErr || !profile) {
      return res.status(403).json({ error: 'ไม่พบข้อมูล Profile ของคุณ' });
    }

    // 2. เอารหัสนักศึกษา ไปวิ่งหาใน official_rosters (รายชื่อ Excel ที่อาจารย์อัปโหลด)
    const { data: roster, error: rosterErr } = await supa
      .from('official_rosters')
      .select('section_id, sections(course_code, section_number, term)')
      .eq('student_id_number', profile.student_id_number)
      .limit(1)
      .single();

    if (rosterErr || !roster) {
      return res.status(403).json({ error: 'ไม่พบรายชื่อของคุณในกลุ่มเรียนใดเลย (อาจารย์อาจจะยังไม่อัปโหลดรายชื่อเข้าสู่ระบบ)' });
    }

    const sectionId = roster.section_id;
    // ป้องกัน Type Error จาก Supabase
    const secInfo: any = Array.isArray(roster.sections) ? roster.sections[0] : roster.sections;

    // 3. ดึง Assignments ทั้งหมดของ Section นี้
    const { data: assignments, error: asmErr } = await supa
      .from('assignments')
      .select('id, title, assignment_type, week_number, class_date, open_at, close_at, end_of_friday_at')
      .eq('section_id', sectionId)
      .order('week_number', { ascending: true });

    if (asmErr) throw asmErr;

    // 4. ดึงงานที่นักศึกษาคนนี้ส่งมาแล้ว (Submissions + Grading Results)
    const { data: submissions, error: subErr } = await supa
      .from('submissions')
      .select(`
        id, assignment_id, status, submitted_at, fraud_flag,
        grading_results ( final_score, final_meta_score, meta_score_attendance, meta_score_punctuality, meta_score_accuracy, is_blank )
      `)
      .eq('student_id', userId);

    if (subErr) throw subErr;

    // 5. ประกอบร่างข้อมูล (Merge) เพื่อส่งให้ Frontend
    const timeline = (assignments || []).map(asm => {
      const sub = (submissions || []).find(s => s.assignment_id === asm.id);
      const resInfo: any = sub?.grading_results;
      const res = Array.isArray(resInfo) ? resInfo[0] : resInfo;

      return {
        ...asm,
        submission: sub ? {
          id: sub.id,
          status: sub.status,
          submitted_at: sub.submitted_at,
          fraud_flag: sub.fraud_flag,
          result: res || null
        } : null
      };
    });

    // คำนวณสรุปคะแนนรวมทั้งหมด
    const totalMetaScore = timeline.reduce((sum, item) => sum + (item.submission?.result?.final_meta_score || 0), 0);

    return res.json({
      success: true,
      profile: profile,
      section: secInfo,
      total_meta_score: Number(totalMetaScore.toFixed(2)),
      timeline
    });

  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

export default router;