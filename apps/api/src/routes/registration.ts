// apps/api/src/routes/registration.ts
//(ไฟล์นี้ทำหน้าที่รับ Token หลังนักศึกษาสมัคร Supabase เสร็จ เพื่อตรวจสอบรายชื่อกับ Roster และอนุมัติสิทธิ์)
//อย่าลืมไปเพิ่ม import registrationRoutes from './routes/registration'; และ app.use('/api/registration', registrationRoutes); ในไฟล์ index.ts ของ API
// apps/api/src/routes/registration.ts
import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { getServiceSupabase } from '../lib/supabase'

const router = Router()

const verifySchema = z.object({
  student_id_number: z.string().min(10).max(15),
  full_name: z.string().min(2),
  section_id: z.string().uuid(),
})

function getBearerToken(req: Request) {
  const h = req.headers.authorization || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m?.[1] || null
}

function getAnonSupabaseForAuth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, anon, { auth: { persistSession: false } })
}

router.post('/verify-profile', async (req: Request, res: Response) => {
  const token = getBearerToken(req)
  if (!token) return res.status(401).json({ error: 'Unauthorized: Missing Bearer token' })

  const parsed = verifySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง', details: parsed.error.flatten() })
  }

  const { student_id_number, full_name, section_id } = parsed.data

  try {
    // 1) Validate token => get real user
    const authSupa = getAnonSupabaseForAuth()
    const { data: userRes, error: userErr } = await authSupa.auth.getUser(token)
    if (userErr || !userRes?.user) {
      return res.status(401).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่' })
    }

    const user = userRes.user
    const email = (user.email || '').trim().toLowerCase()

    // 2) Backend domain guard (hard security)
    if (!email.endsWith('@email.psu.ac.th')) {
      return res.status(403).json({ error: 'กรุณาใช้อีเมล @email.psu.ac.th เท่านั้น' })
    }

    const supa = getServiceSupabase()

    // 3) Ensure section exists
    const { data: sectionCheck, error: secErr } = await supa
      .from('sections')
      .select('id')
      .eq('id', section_id)
      .single()

    if (secErr || !sectionCheck) {
      return res.status(400).json({ error: 'ไม่พบกลุ่มเรียน (Section) นี้ในระบบ' })
    }

    // 4) Cross-check roster
    const sid = student_id_number.trim()
    const { data: rosterMatch, error: rosterErr } = await supa
      .from('official_rosters')
      .select('id, major')
      .eq('section_id', section_id)
      .eq('student_id_number', sid)
      .maybeSingle()

    if (rosterErr) {
      return res.status(500).json({ error: `Roster lookup failed: ${rosterErr.message}` })
    }

    const status = rosterMatch ? 'approved' : 'pending'

    // 5) Upsert profile (role is forced to student)
    const { error: profileErr } = await supa
      .from('profiles')
      .upsert({
        id: user.id,
        email,
        full_name: full_name.trim(),
        student_id_number: sid,
        major: rosterMatch?.major || '',
        role: 'student',
        registration_status: status,
        updated_at: new Date().toISOString(),
      })

    if (profileErr) {
      return res.status(500).json({ error: `ไม่สามารถบันทึกโปรไฟล์ได้: ${profileErr.message}` })
    }

    // 6) If approved => attach to section (idempotent)
    if (status === 'approved') {
      const { error: mapErr } = await supa
        .from('student_sections')
        .upsert(
          { student_id: user.id, section_id },
          { onConflict: 'student_id,section_id' }
        )

      if (mapErr) {
        return res.status(500).json({ error: `ผูกกลุ่มเรียนไม่สำเร็จ: ${mapErr.message}` })
      }
    }

    return res.json({
      success: true,
      status,
      message:
        status === 'approved'
          ? 'ยืนยันรายชื่อสำเร็จ! เข้าสู่ระบบได้ทันที'
          : 'ลงทะเบียนสำเร็จ แต่ยังไม่พบรายชื่อในกลุ่มนี้ (สถานะ Pending) กรุณาตรวจสอบ Section/รหัสนักศึกษา หรือรออาจารย์จัดการรายชื่อ',
    })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Internal Server Error' })
  }
})

export default router