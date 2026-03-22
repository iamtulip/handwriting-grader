import Link from 'next/link'
import { cookies } from 'next/headers'

async function getDetail(assignmentId: string) {
  const cookieStore = await cookies()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const res = await fetch(`${baseUrl}/api/student/weekly/${assignmentId}`, {
    cache: 'no-store',
    headers: {
      Cookie: cookieStore.toString(),
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.error || `Failed to load weekly detail (${res.status})`)
  }

  return res.json()
}

export default async function WeeklyDetailPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>
}) {
  const { assignmentId } = await params
  const data = await getDetail(assignmentId)

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">
            {data.assignment.title}
          </h1>

          <p className="text-slate-600 mt-2 text-lg">
            ประเภท: <span className="font-semibold">{data.assignment.assignment_type}</span>{' '}
            • สัปดาห์ที่:{' '}
            <span className="font-semibold">{data.assignment.week_number ?? '-'}</span>
          </p>

          <p className="text-xs text-slate-400 mt-2">ID: {data.assignment.id}</p>
        </div>

        <Link
          className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200 transition-colors shadow-sm"
          href="/student"
        >
          ← กลับหน้า Overview
        </Link>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Box title="สถานะการส่ง" value={data.submission.status ?? 'not_submitted'} />
        <Box title="คะแนนรวม (Meta)" value={Number(data.meta.total ?? 0).toFixed(2)} />
        <Box
          title="คะแนนเต็มสัปดาห์นี้"
          value={Number(data.meta.totalPossible ?? 0).toFixed(2)}
        />
        <Box title="จำนวนจุดที่ตรวจ (ROI)" value={String(data.grading.roi_count ?? 0)} />
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="font-bold text-slate-800 text-lg border-b border-slate-100 pb-2">
          คะแนนรายส่วน (Meta Score Breakdown)
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <ScoreBox title="Attendance" value={data.meta.attendance ?? 0} />
          <ScoreBox title="Punctuality" value={data.meta.punctuality ?? 0} />
          <ScoreBox title="Accuracy" value={data.meta.accuracy ?? 0} />
          <ScoreBox title="Total" value={data.meta.total ?? 0} highlight />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mt-4">
          <Row
            label="เวลาที่ส่งงาน"
            value={
              data.submission.submitted_at
                ? new Date(data.submission.submitted_at).toLocaleString('th-TH')
                : '-'
            }
          />
          <Row label="ขั้นตอนปัจจุบัน" value={data.submission.current_stage ?? '-'} />
          <Row label="ส่งงานอยู่ในช่วง" value={data.meta.punctualityBucket ?? '-'} />
          <Row
            label="เรียนออนไลน์"
            value={data.assignment.is_online_class ? 'ใช่ (YES)' : 'ไม่ใช่ (NO)'}
          />
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="font-bold text-slate-800 text-lg border-b border-slate-100 pb-2">
          รายละเอียดการตรวจจากระบบ
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mt-4">
          <Row
            label="คะแนนจาก AI (Auto)"
            value={Number(data.grading.total_auto_score ?? 0).toFixed(2)}
          />
          <Row
            label="คะแนนสุทธิ (Final Raw)"
            value={Number(data.grading.total_final_score ?? 0).toFixed(2)}
          />
          <Row
            label="เปอร์เซ็นต์ความถูกต้อง (AI %)"
            value={Number(data.grading.ai_percentage ?? 0).toFixed(2)}
          />
          <Row
            label="พบกระดาษเปล่า"
            value={data.grading.is_blank_any ? 'ใช่ (YES)' : 'ไม่ใช่ (NO)'}
          />
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="font-bold text-slate-800 text-lg border-b border-slate-100 pb-2">
          Attendance / Check-in
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mt-4">
          <Row label="มีข้อมูล check-in" value={data.attendance.has_checkin ? 'มี' : 'ไม่มี'} />
          <Row
            label="เข้าเรียนทันเวลา"
            value={
              data.attendance.is_on_time === null
                ? '-'
                : data.attendance.is_on_time
                  ? 'ใช่ (YES)'
                  : 'ไม่ใช่ (NO)'
            }
          />
          <Row
            label="เวลา check-in"
            value={
              data.attendance.check_in_time
                ? new Date(data.attendance.check_in_time).toLocaleString('th-TH')
                : '-'
            }
          />
          <Row label="Session ID" value={data.attendance.session_id ?? '-'} />
        </div>
      </section>

      {(data.submission.fraud_flag || data.submission.extracted_paper_student_id) && (
        <section className="border border-red-200 bg-red-50 rounded-xl p-6 shadow-sm">
          <div className="font-bold text-red-700 mb-3">
            ⚠️ ระบบตรวจสอบความโปร่งใส (Integrity Check)
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <Row
              label="พบความผิดปกติ"
              value={data.submission.fraud_flag ? 'TRUE' : 'FALSE'}
            />
            <Row
              label="รหัสนักศึกษาบนกระดาษ"
              value={data.submission.extracted_paper_student_id ?? '-'}
            />
          </div>
        </section>
      )}

      <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="font-bold text-slate-800 text-lg border-b border-slate-100 pb-2 mb-4">
          หมายเหตุการคิดคะแนน
        </div>

        {Array.isArray(data.meta.note) && data.meta.note.length > 0 ? (
          <ul className="list-disc pl-6 space-y-2 text-sm text-slate-700">
            {data.meta.note.map((n: string, idx: number) => (
              <li key={idx}>{n}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">ไม่มีหมายเหตุเพิ่มเติม</p>
        )}
      </section>
    </div>
  )
}

function Box({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="text-sm text-slate-500 font-medium">{title}</div>
      <div className="text-2xl font-extrabold text-blue-600 mt-2">{value}</div>
    </div>
  )
}

function ScoreBox({
  title,
  value,
  highlight = false,
}: {
  title: string
  value: number
  highlight?: boolean
}) {
  return (
    <div
      className={
        highlight
          ? 'rounded-xl border border-slate-900 bg-slate-900 text-white p-5 shadow-sm'
          : 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm'
      }
    >
      <div
        className={
          highlight
            ? 'text-sm text-slate-300 font-medium'
            : 'text-sm text-slate-500 font-medium'
        }
      >
        {title}
      </div>
      <div className="text-2xl font-extrabold mt-2">
        {Number(value ?? 0).toFixed(2)}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-50 py-2">
      <div className="text-slate-600 font-medium">{label}</div>
      <div className="font-bold text-slate-900 text-right">{value}</div>
    </div>
  )
}