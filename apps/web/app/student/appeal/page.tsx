'use client'

import { useMemo, useState } from 'react'

export default function AppealPage() {
  const [assignmentId, setAssignmentId] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const canSubmit = useMemo(() => {
    return assignmentId.trim().length > 0 && message.trim().length > 0 && !loading
  }, [assignmentId, message, loading])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus(null)

    if (!assignmentId.trim() || !message.trim()) {
      setStatus({
        type: 'error',
        text: 'กรุณากรอกรหัสงาน (Assignment ID) และข้อความอธิบายให้ครบถ้วน',
      })
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/student/appeal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          assignment_id: assignmentId.trim(),
          message: message.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Appeal failed')
      }

      setStatus({
        type: 'success',
        text: '✅ ส่งคำร้องขอทบทวนคะแนนเรียบร้อยแล้ว อาจารย์จะได้รับข้อความของคุณ',
      })

      setAssignmentId('')
      setMessage('')
    } catch (e: any) {
      setStatus({
        type: 'error',
        text: `❌ ${e.message || 'เกิดข้อผิดพลาดในการส่งคำร้อง'}`,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <header>
        <h1 className="text-3xl font-extrabold text-slate-900">Appeal</h1>
        <p className="text-slate-600 mt-2 text-lg">
          ยื่นคำร้องขอทบทวนคะแนน (ส่งตรงถึงอาจารย์ผู้สอน)
        </p>
      </header>

      <section className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm space-y-5">
        {status && (
          <div
            className={`p-4 rounded-lg text-sm font-bold ${
              status.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {status.text}
          </div>
        )}

        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              รหัสงาน (Assignment ID)
            </label>
            <input
              value={assignmentId}
              onChange={(e) => setAssignmentId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-4 py-3 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
              placeholder="นำรหัส ID จากหน้ารายละเอียดงานมาวางที่นี่ (เช่น uuid)"
            />
            <p className="mt-2 text-xs text-slate-500">
              คุณสามารถคัดลอก Assignment ID ได้จากหน้ารายละเอียดของงานแต่ละสัปดาห์
            </p>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              ข้อความอธิบาย (Message)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-4 py-3 min-h-[150px] focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
              placeholder="อธิบายจุดที่คุณคิดว่าคะแนนอาจจะผิดพลาด หรือสิ่งที่ต้องการให้อาจารย์ตรวจสอบใหม่..."
            />
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full inline-flex items-center justify-center px-4 py-3 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {loading ? 'กำลังส่งคำร้อง...' : 'ส่งคำร้อง (Submit Appeal)'}
          </button>
        </form>
      </section>
    </div>
  )
}