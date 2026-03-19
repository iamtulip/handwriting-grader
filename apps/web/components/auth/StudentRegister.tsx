// apps/web/components/auth/StudentRegister.tsx
//(หน้าจอ UI ที่นักศึกษาจะใช้กรอกข้อมูล มีการป้องกันการพิมพ์อีเมลผิดโดเมน และจัดการ Flow ทะลุไปหา API อัตโนมัติ)
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@supabase/supabase-js'

// ใช้ Supabase Client ฝั่ง Browser
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const StudentRegister = () => {
  const router = useRouter()
  const [sections, setSections] = useState<any[]>([])
  
  // Form State
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [sectionId, setSectionId] = useState('')
  
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ type: 'error' | 'success', text: string } | null>(null)

  // ดึงรายการ Section มาให้เด็กเลือก
  useEffect(() => {
    const fetchSections = async () => {
      try {
        const res = await fetch('/api/sections')
        if (res.ok) {
          const data = await res.json()
          setSections(data.items || [])
        }
      } catch (e) {
        console.error('Failed to load sections')
      }
    }
    fetchSections()
  }, [])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatusMsg(null)

    // 1. ตรวจสอบเบื้องต้น (Client-side Validation)
    if (!email.endsWith('@email.psu.ac.th')) {
      setStatusMsg({ type: 'error', text: 'ต้องใช้อีเมลโดเมน @email.psu.ac.th เท่านั้น' })
      return
    }
    if (studentId.length < 10) {
      setStatusMsg({ type: 'error', text: 'รหัสนักศึกษาไม่ถูกต้อง' })
      return
    }
    if (!sectionId) {
      setStatusMsg({ type: 'error', text: 'กรุณาเลือกกลุ่มเรียน' })
      return
    }

    setLoading(true)
    try {
      // 2. สมัครสมาชิกผ่าน Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      })

      if (authError) throw new Error(authError.message)
      if (!authData.session) throw new Error('ไม่สามารถสร้าง Session ได้ กรุณาลองใหม่')

      // 3. เรียก API หลังบ้านเพื่อยืนยันโปรไฟล์และตรวจ Roster
      const res = await fetch('/api/registration/verify-profile', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authData.session.access_token}` // ส่ง Token ไปให้ Backend ตรวจ
        },
        body: JSON.stringify({
          student_id_number: studentId,
          full_name: fullName,
          section_id: sectionId
        })
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'เกิดข้อผิดพลาดในการยืนยันตัวตน')

      setStatusMsg({ type: 'success', text: result.message })
      
      // 4. พาไปหน้า Dashboard ถ้ายืนยันสำเร็จ (หรือหน้าแจ้งรออนุมัติ)
      setTimeout(() => {
        if (result.status === 'approved') {
          router.push('/student/dashboard')
        } else {
          // ถ้าเป็น pending ให้ logout ออกไปก่อนรออาจารย์อนุมัติ
          supabase.auth.signOut()
        }
      }, 3000)

    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'การลงทะเบียนล้มเหลว' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-black text-gray-900">
          ลงทะเบียนนักศึกษา
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          ระบบตรวจจับการลงทะเบียนอัตโนมัติ (SIS Roster Sync)
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl rounded-2xl sm:px-10 border border-gray-100">
          <form className="space-y-6" onSubmit={handleRegister}>
            
            {/* อีเมลมหาวิทยาลัย */}
            <div>
              <label className="block text-sm font-bold text-gray-700">อีเมลนักศึกษา (PSU Email) *</label>
              <div className="mt-1">
                <input
                  type="email"
                  required
                  placeholder="รหัสนักศึกษา@email.psu.ac.th"
                  className="appearance-none block w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* รหัสผ่าน */}
            <div>
              <label className="block text-sm font-bold text-gray-700">รหัสผ่าน *</label>
              <div className="mt-1">
                <input
                  type="password"
                  required
                  minLength={6}
                  className="appearance-none block w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {/* รหัสนักศึกษา */}
            <div>
              <label className="block text-sm font-bold text-gray-700">รหัสนักศึกษา (10 หลัก) *</label>
              <div className="mt-1">
                <input
                  type="text"
                  required
                  maxLength={15}
                  placeholder="เช่น 6820710187"
                  className="appearance-none block w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm font-mono"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                />
              </div>
            </div>

            {/* ชื่อ-นามสกุล */}
            <div>
              <label className="block text-sm font-bold text-gray-700">ชื่อ - นามสกุล *</label>
              <div className="mt-1">
                <input
                  type="text"
                  required
                  placeholder="เช่น น.ส. เอาว์ฟา เจ๊ะอาแดร์"
                  className="appearance-none block w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            </div>

            {/* กลุ่มเรียน */}
            <div>
              <label className="block text-sm font-bold text-gray-700">กลุ่มเรียน (Section) ที่ลงทะเบียน *</label>
              <div className="mt-1">
                <select
                  required
                  className="block w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white"
                  value={sectionId}
                  onChange={(e) => setSectionId(e.target.value)}
                >
                  <option value="">-- กรุณาเลือกกลุ่มเรียน --</option>
                  {sections.map(sec => (
                    <option key={sec.id} value={sec.id}>
                      {sec.course_code} - Sec {sec.section_number}
                    </option>
                  ))}
                  {/* Mock สำหรับเทสระบบ */}
                  {process.env.NODE_ENV !== 'production' && (
                    <option value="00000000-0000-0000-0000-000000000000">746-102 - Sec 03 [Mock]</option>
                  )}
                </select>
              </div>
            </div>

            {/* สถานะแจ้งเตือน */}
            {statusMsg && (
              <div className={`p-4 rounded-lg text-sm font-bold ${statusMsg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                {statusMsg.text}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-black text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition"
              >
                {loading ? 'กำลังตรวจสอบ...' : 'ลงทะเบียนและตรวจสอบสิทธิ์'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}