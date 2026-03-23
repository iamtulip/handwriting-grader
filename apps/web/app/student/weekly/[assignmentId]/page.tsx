import Link from 'next/link'
import { cookies } from 'next/headers'
import UploadSubmissionForm from './upload-form'

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

      <UploadSubmissionForm
        assignmentId={assignmentId}
        currentStatus={data.submission.status ?? 'not_submitted'}
        openAt={data.assignment.open_at}
        closeAt={data.assignment.close_at}
      />

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