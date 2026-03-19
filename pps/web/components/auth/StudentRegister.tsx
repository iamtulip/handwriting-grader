// apps/web/components/auth/StudentRegister.tsx
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseAnonKey)

type Msg = { type: 'error' | 'success'; text: string }

export const StudentRegister = () => {
  const router = useRouter()
  const [sections, setSections] = useState<any[]>([])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [sectionId, setSectionId] = useState('')

  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<Msg | null>(null)

  const emailOk = useMemo(() => email.trim().toLowerCase().endsWith('@email.psu.ac.th'), [email])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/sections', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          setSections(data.items || data || [])
        }
      } catch {
        // ignore
      }
    })()
  }, [])

  async function callVerify(accessToken: string) {
    const res = await fetch('/api/registration/verify-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        student_id_number: studentId,
        full_name: fullName,
        section_id: sectionId,
      }),
    })

    const result = await res.json()
    if (!res.ok) throw new Error(result.error || 'Verify failed')
    return result
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)

    if (!emailOk) return setMsg({ type: 'error', text: 'ต้องใช้อีเมล @email.psu.ac.th เท่านั้น' })
    if (studentId.trim().length < 10) return setMsg({ type: 'error', text: 'รหัสนักศึกษาไม่ถูกต้อง' })
    if (!sectionId) return setMsg({ type: 'error', text: 'กรุณาเลือกกลุ่มเรียน (Section)' })

    setLoading(true)
    try {
      // 1) Sign up
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // ช่วยให้ลิงก์ยืนยันกลับเข้าระบบได้ถูกหน้า
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) throw new Error(error.message)

      // 2) ถ้าโปรเจกต์เปิด email confirmation -> session จะเป็น null (ปกติ)
      if (!data.session) {
        setMsg({
          type: 'success',
          text: 'สมัครสำเร็จ! กรุณาเปิดอีเมล @email.psu.ac.th เพื่อกดยืนยัน จากนั้นกลับมา “เข้าสู่ระบบ” แล้วกด “ยืนยันสิทธิ์” อีกครั้ง',
        })
        return
      }

      // 3) กรณีที่ได้ session ทันที (บางโปรเจกต์ปิด confirmation)
      const result = await callVerify(data.session.access_token)
      setMsg({ type: 'success', text: result.message })

      if (result.status === 'approved') router.push('/student/dashboard')
      else {
        await supabase.auth.signOut()
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.message || 'การลงทะเบียนล้มเหลว' })
    } finally {
      setLoading(false)
    }
  }

  // ปุ่มนี้รองรับ flow แบบ “ยืนยันอีเมลแล้วกลับมา login”
  const handleLoginAndVerify = async () => {
    setMsg(null)
    if (!emailOk) return setMsg({ type: 'error', text: 'ต้องใช้อีเมล @email.psu.ac.th เท่านั้น' })
    if (!sectionId) return setMsg({ type: 'error', text: 'กรุณาเลือกกลุ่มเรียน (Section)' })

    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) throw new Error(error.message)
      if (!data.session) throw new Error('เข้าสู่ระบบไม่สำเร็จ')

      const result = await callVerify(data.session.access_token)
      setMsg({ type: 'success', text: result.message })

      if (result.status === 'approved') router.push('/student/dashboard')
      else {
        await supabase.auth.signOut()
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.message || 'เข้าสู่ระบบ/ยืนยันสิทธิ์ล้มเหลว' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-black text-gray-900">ลงทะเบียนนักศึกษา</h2>
        <p className="mt-2 text-center text-sm text-gray-600">SIS Roster Auto-Verification</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl rounded-2xl sm:px-10 border border-gray-100">
          <form className="space-y-6" onSubmit={handleRegister}>
            <div>
              <label className="block text-sm font-bold text-gray-700">อีเมลนักศึกษา (PSU Email) *</label>
              <div className="mt-1">
                <input
                  type="email"
                  required
                  placeholder="รหัสนักศึกษา@email.psu.ac.th"
                  className="block w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {!emailOk && email.length > 0 && (
                <p className="mt-2 text-xs text-red-600">โดเมนอีเมลต้องเป็น @email.psu.ac.th</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700">รหัสผ่าน *</label>
              <div className="mt-1">
                <input
                  type="password"
                  required
                  minLength={6}
                  className="block w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700">รหัสนักศึกษา *</label>
              <div className="mt-1">
                <input
                  type="text"
                  required
                  maxLength={15}
                  placeholder="เช่น 6820710187"
                  className="block w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm font-mono"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700">ชื่อ - นามสกุล *</label>
              <div className="mt-1">
                <input
                  type="text"
                  required
                  className="block w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700">กลุ่มเรียน (Section) *</label>
              <div className="mt-1">
                <select
                  required
                  className="block w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm bg-white"
                  value={sectionId}
                  onChange={(e) => setSectionId(e.target.value)}
                >
                  <option value="">-- กรุณาเลือกกลุ่มเรียน --</option>
                  {sections.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.course_code} - Sec {sec.section_number} ({sec.term})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {msg && (
              <div
                className={`p-4 rounded-lg text-sm font-bold ${
                  msg.type === 'error'
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-green-50 text-green-700 border border-green-200'
                }`}
              >
                {msg.text}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl text-sm font-black text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'กำลังสมัคร...' : 'สมัครสมาชิก'}
            </button>

            <button
              type="button"
              onClick={handleLoginAndVerify}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl text-sm font-black text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
            >
              {loading ? 'กำลังยืนยัน...' : 'เข้าสู่ระบบ & ยืนยันสิทธิ์ (หลังยืนยันอีเมล)'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}