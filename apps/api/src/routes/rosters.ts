// apps/api/src/routes/rosters.ts
//(อย่าลืมไป import rosterRoutes from './routes/rosters'; และ app.use('/api/rosters', rosterRoutes); ในไฟล์หลักของ API
import { Router, Response } from 'express'
import { z } from 'zod'
import { requireReviewer, AuthRequest } from '../utils/requireReviewer'
import { getServiceSupabase } from '../lib/supabase'

const router = Router()

// ต้องเป็น Staff/Admin/Instructor เท่านั้น
//router.use(requireReviewer as any)

// ---- Limits (กัน DoS / payload ใหญ่เกิน) ----
const MAX_STUDENTS = 5000

// ---- Helpers ----
function normalizeStudentId(input: string) {
  return (input ?? '').toString().replace(/\D/g, '')
}

function normalizeText(input: string) {
  return (input ?? '').toString().trim().replace(/\s+/g, ' ')
}

function isLikelyStudentId(idDigits: string) {
  // PSU student id มัก 10 หลัก (เผื่อ 10-15 ตาม requirement)
  return /^\d{10,15}$/.test(idDigits)
}

// ---- Schema ----
const rosterUploadSchema = z.object({
  section_id: z.string().uuid(),
  students: z.array(
    z.object({
      student_id_number: z.string().min(1),
      full_name: z.string().min(1),
      major: z.string().optional(),
    })
  ).max(MAX_STUDENTS),
})

router.post('/upload', async (req: AuthRequest, res: Response) => {
  const parsed = rosterUploadSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'ข้อมูลไม่ถูกต้อง',
      details: parsed.error.flatten(),
    })
  }

  const { section_id, students } = parsed.data
  //const uploaded_by = req.user!.id
  const uploaded_by = '00000000-0000-0000-0000-000000000000'; // req.user!.id
  const supa = getServiceSupabase()

  try {
    // 1) ตรวจ section มีอยู่จริง
    const { data: sectionCheck, error: secErr } = await supa
      .from('sections')
      .select('id')
      .eq('id', section_id)
      .single()

    if (secErr || !sectionCheck) {
      return res.status(404).json({ error: 'ไม่พบกลุ่มเรียน (Section) นี้ในระบบ' })
    }

    // 2) Normalize + validate + dedupe
    const cleaned: Array<{ student_id_number: string; full_name: string; major: string | null }> = []
    const warnings: string[] = []
    const seen = new Set<string>()
    let dropped = 0

    for (const s of students) {
      const sid = normalizeStudentId(s.student_id_number)
      const name = normalizeText(s.full_name)
      const major = normalizeText(s.major ?? '')

      if (!sid || !name) {
        dropped++
        continue
      }

      if (!isLikelyStudentId(sid)) {
        warnings.push(`รูปแบบรหัสนักศึกษาไม่ถูก: ${sid}`)
      }

      if (seen.has(sid)) {
        continue // ซ้ำในไฟล์เดียวกัน
      }
      seen.add(sid)

      cleaned.push({
        student_id_number: sid,
        full_name: name,
        major: major ? major : null,
      })
    }

    if (cleaned.length === 0) {
      return res.status(400).json({ error: 'ไม่พบข้อมูลนักศึกษาที่ใช้งานได้ในไฟล์' })
    }

    // 3) เตรียม payload (Two-pass Upsert ป้องกัน Major ว่างไปทับของเดิม)
    const basePayload = cleaned.map((c) => ({
      section_id,
      student_id_number: c.student_id_number,
      full_name: c.full_name,
      uploaded_by,
      // ไม่ใส่ major ที่นี่
    }))

    const { error: upsertErr } = await supa
      .from('official_rosters')
      .upsert(basePayload, { onConflict: 'section_id,student_id_number' })

    if (upsertErr) throw new Error(`เกิดข้อผิดพลาดในการบันทึก (base upsert): ${upsertErr.message}`)

    // 4) Update major เฉพาะรายการที่ major ไม่ว่าง
    const majorUpdates = cleaned.filter((c) => !!c.major)
    if (majorUpdates.length > 0) {
      for (const m of majorUpdates) {
        const { error: majErr } = await supa
          .from('official_rosters')
          .update({ major: m.major, uploaded_by })
          .eq('section_id', section_id)
          .eq('student_id_number', m.student_id_number)

        if (majErr) {
          warnings.push(`อัปเดต major ไม่สำเร็จสำหรับ ${m.student_id_number}: ${majErr.message}`)
        }
      }
    }

    return res.json({
      success: true,
      message: `นำเข้ารายชื่อสำเร็จ ${cleaned.length} รายการ`,
      received_count: students.length,
      accepted_count: cleaned.length,
      dropped_count: dropped,
      warnings: warnings.slice(0, 50),
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Internal Server Error' })
  }
})
router.get('/', (_req, res) => {
  res.json({ ok: true, route: 'rosters' })
})
export default router