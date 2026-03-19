'use client'

import { useState } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('STEP 1: submit fired')

    if (loading) return

    setLoading(true)
    setError('')

    try {
      console.log('STEP 2: before fetch /auth/sign-in')

      const res = await fetch('/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      console.log('STEP 3: got response', res.status)

      const contentType = res.headers.get('content-type') || ''
      let payload: any = {}

      if (contentType.includes('application/json')) {
        payload = await res.json()
      } else {
        const text = await res.text()
        throw new Error(
          `Login route did not return JSON. Status ${res.status}. ${text.slice(0, 120)}`
        )
      }

      console.log('STEP 4: payload', payload)

      if (!res.ok) {
        throw new Error(payload.error || 'Login failed')
      }

      const meRes = await fetch('/api/me', {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      })

      console.log('STEP 5: got /api/me', meRes.status)

      const meType = meRes.headers.get('content-type') || ''
      let me: any = {}

      if (meType.includes('application/json')) {
        me = await meRes.json()
      } else {
        const text = await meRes.text()
        throw new Error(
          `Profile route did not return JSON. Status ${meRes.status}. ${text.slice(0, 120)}`
        )
      }

      console.log('STEP 6: me payload', me)

      if (!meRes.ok) {
        throw new Error(me.error || 'Failed to load profile')
      }

      const role = me?.profile?.role ?? 'student'
      console.log('STEP 6.1: resolved role =', role)

      if (role === 'admin') {
        window.location.href = '/admin'
      } else if (role === 'instructor') {
        window.location.href = '/instructor'
      } else if (role === 'reviewer') {
        window.location.href = '/reviewer'
      } else {
        window.location.href = '/student'
      }
    } catch (err: any) {
      console.error('LOGIN ERROR:', err)
      setError(err.message || 'รหัสผ่านไม่ถูกต้อง หรือเข้าสู่ระบบล้มเหลว')
    } finally {
      console.log('STEP 7: finally')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-6 border border-slate-100">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-blue-600">Diamond V2 💎</h1>
          <p className="text-slate-500 mt-2">ลงชื่อเข้าสู่ระบบ (Academic OS)</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700">
              อีเมล (Email)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="example@email.psu.ac.th"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700">
              รหัสผ่าน (Password)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all disabled:bg-blue-300"
          >
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </div>
    </div>
  )
}