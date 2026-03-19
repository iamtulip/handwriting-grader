'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [studentId, setStudentId] = useState('');
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // 1. สร้างบัญชีผ่าน Supabase Auth (ระบบจะส่งอีเมลยืนยันถ้าเปิดตั้งค่าไว้)
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            student_id_number: studentId.trim(),
          }
        }
      });

      if (authErr) throw authErr;
      if (!authData.user) throw new Error('ไม่สามารถสร้างบัญชีได้');

      // 2. บันทึกข้อมูลลงตาราง user_profiles (เวทมนตร์จับคู่กลุ่มเรียนอยู่ที่นี่!)
      const { error: profileErr } = await supabase.from('user_profiles').upsert({
        id: authData.user.id,
        role: 'student',
        full_name: fullName.trim(),
        student_id_number: studentId.trim(),
      });

      if (profileErr) throw profileErr;

      // 3. สำเร็จ! แจ้งเตือนและพาไปหน้า Login
      setSuccess('✅ ลงทะเบียนสำเร็จ! ระบบกำลังพาคุณไปหน้าเข้าสู่ระบบ...');
      
      // หน่วงเวลา 2 วินาทีให้ผู้ใช้อ่านข้อความ แล้ววาร์ปไปหน้า Login
      setTimeout(() => {
        router.push('/login');
      }, 2000);
      
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการลงทะเบียน โปรดลองอีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-6 border border-slate-100">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-green-600">Diamond V2 🎓</h1>
          <p className="text-slate-500 mt-2">ลงทะเบียนนักศึกษา (Student Register)</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center font-medium border border-red-100">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm text-center font-medium border border-green-100">
            {success}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700">ชื่อ-นามสกุล (Full Name)</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 block w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-green-500 focus:border-green-500 transition-colors"
              placeholder="เช่น นายสมชาย ใจดี"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700">รหัสนักศึกษา (Student ID)</label>
            <input
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="mt-1 block w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-green-500 focus:border-green-500 transition-colors"
              placeholder="เช่น 6620210484"
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              * ระบบจะนำรหัสนี้ไปจับคู่กับกลุ่มเรียนและสาขาวิชาโดยอัตโนมัติ
            </p>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700">อีเมล (Email)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-green-500 focus:border-green-500 transition-colors"
              placeholder="example@email.psu.ac.th"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700">รหัสผ่าน (Password)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-green-500 focus:border-green-500 transition-colors"
              placeholder="ความยาวอย่างน้อย 6 ตัวอักษร"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !!success}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all disabled:bg-slate-400"
          >
            {loading ? 'กำลังลงทะเบียน...' : 'ลงทะเบียนเข้าใช้งาน'}
          </button>
        </form>

        <div className="text-center text-sm text-slate-500 mt-4 pt-4 border-t border-slate-100">
          มีบัญชีอยู่แล้วใช่ไหม?{' '}
          <Link href="/login" className="text-blue-600 font-bold hover:underline">
            เข้าสู่ระบบที่นี่
          </Link>
        </div>
      </div>
    </div>
  );
}