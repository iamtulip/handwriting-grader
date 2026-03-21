//apps/web/app/instructor/assignments/[assignmentId]/answer-key/page.tsx
'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'

function prettyJson(value: any) {
  return JSON.stringify(value, null, 2)
}

function defaultAnswerKeyTemplate() {
  return {
    schema_version: 1,
    generated_mode: 'manual',
    generated_at: new Date().toISOString(),
    items: [],
  }
}

function defaultGradingConfigTemplate() {
  return {
    schema_version: 1,
  }
}

export default function AssignmentAnswerKeyPage() {
  const params = useParams<{ assignmentId: string }>()
  const assignmentId = params.assignmentId

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'generate' | 'approve' | 'reject' | 'save' | null>(null)
  const [item, setItem] = useState<any>(null)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [answerKeyText, setAnswerKeyText] = useState(prettyJson(defaultAnswerKeyTemplate()))
  const [gradingConfigText, setGradingConfigText] = useState(
    prettyJson(defaultGradingConfigTemplate())
  )
  const [notes, setNotes] = useState('Manual answer key uploaded by staff')

  async function loadData() {
    const res = await fetch(`/api/instructor/assignments/${assignmentId}/answer-key`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to load answer key')

    setItem(data.item)

    if (data.item) {
      setAnswerKeyText(prettyJson(data.item.answer_key ?? defaultAnswerKeyTemplate()))
      setGradingConfigText(
        prettyJson(data.item.grading_config ?? defaultGradingConfigTemplate())
      )
      setNotes(data.item.generation_notes ?? 'Manual answer key uploaded by staff')
    }
  }

  useEffect(() => {
    const run = async () => {
      try {
        await loadData()
      } catch (e: any) {
        setStatus({ type: 'error', text: e.message || 'โหลด answer key ไม่สำเร็จ' })
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [assignmentId])

  const parsedAnswerKey = useMemo(() => {
    try {
      return { ok: true, value: JSON.parse(answerKeyText) }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  }, [answerKeyText])

  const parsedGradingConfig = useMemo(() => {
    try {
      return { ok: true, value: JSON.parse(gradingConfigText) }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  }, [gradingConfigText])

  async function doAction(action: 'generate' | 'approve' | 'reject') {
    setBusy(action)
    setStatus(null)

    try {
      const res = await fetch(`/api/instructor/assignments/${assignmentId}/answer-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          action,
          generation_notes:
            action === 'reject' ? 'Rejected by instructor/reviewer' : undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `${action} failed`)

      setItem(data.item)
      setAnswerKeyText(prettyJson(data.item.answer_key ?? defaultAnswerKeyTemplate()))
      setGradingConfigText(
        prettyJson(data.item.grading_config ?? defaultGradingConfigTemplate())
      )
      setNotes(data.item.generation_notes ?? '')

      setStatus({
        type: 'success',
        text:
          action === 'generate'
            ? 'Generate AI Answer Key สำเร็จ'
            : action === 'approve'
            ? 'Approve Answer Key สำเร็จ'
            : 'Reject Answer Key สำเร็จ',
      })
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'ทำรายการไม่สำเร็จ' })
    } finally {
      setBusy(null)
    }
  }

  async function saveManual() {
    setBusy('save')
    setStatus(null)

    try {
      if (!parsedAnswerKey.ok) {
        throw new Error(`Answer Key JSON ไม่ถูกต้อง: ${parsedAnswerKey.error}`)
      }

      if (!parsedGradingConfig.ok) {
        throw new Error(`Grading Config JSON ไม่ถูกต้อง: ${parsedGradingConfig.error}`)
      }

      const res = await fetch(`/api/instructor/assignments/${assignmentId}/answer-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          action: 'manual_replace',
          answer_key: parsedAnswerKey.value,
          grading_config: parsedGradingConfig.value,
          generation_notes: notes.trim() || 'Manual answer key uploaded by staff',
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')

      setItem(data.item)
      setStatus({ type: 'success', text: 'บันทึก Manual Answer Key สำเร็จ' })
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'บันทึกไม่สำเร็จ' })
    } finally {
      setBusy(null)
    }
  }

  function onUploadJsonFile(
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'answer_key' | 'grading_config'
  ) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      if (target === 'answer_key') setAnswerKeyText(text)
      else setGradingConfigText(text)
    }
    reader.readAsText(file)
    e.currentTarget.value = ''
  }

  if (loading) {
    return <div className="p-8">กำลังโหลด answer key...</div>
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Answer Key</h1>
          <p className="text-slate-600 mt-2 text-lg">
            สร้าง ตรวจ และแก้ไขเฉลยของ assignment
          </p>
          <div className="text-sm text-slate-500 mt-2">Assignment ID: {assignmentId}</div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/instructor/assignments/${assignmentId}`}
            className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
          >
            กลับ Workspace
          </Link>

          <Link
            href={`/instructor/assignments/${assignmentId}/files`}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700"
          >
            ไปหน้า Files
          </Link>
        </div>
      </header>

      {status && (
        <div
          className={`rounded-xl border p-4 text-sm font-semibold ${
            status.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {status.text}
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <InfoCard title="Generation Status" value={item?.generation_status ?? 'not_started'} />
        <InfoCard title="Approval Status" value={item?.approval_status ?? 'draft'} />
        <InfoCard title="Generated by AI" value={item?.generated_by_ai ? 'YES' : 'NO'} />
        <InfoCard title="AI Model" value={item?.ai_model ?? '-'} />
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="font-bold text-slate-900 text-lg mb-4">Actions</div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => doAction('generate')}
            className="px-4 py-2 rounded-lg bg-purple-600 text-white font-bold hover:bg-purple-700 disabled:bg-purple-300"
          >
            {busy === 'generate' ? 'กำลังสร้าง...' : 'Generate AI Answer Key'}
          </button>

          <button
            type="button"
            disabled={busy !== null || !item}
            onClick={() => doAction('approve')}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:bg-emerald-300"
          >
            {busy === 'approve' ? 'กำลังอนุมัติ...' : 'Approve'}
          </button>

          <button
            type="button"
            disabled={busy !== null || !item}
            onClick={() => doAction('reject')}
            className="px-4 py-2 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700 disabled:bg-amber-300"
          >
            {busy === 'reject' ? 'กำลัง reject...' : 'Reject'}
          </button>

          <button
            type="button"
            disabled={busy !== null}
            onClick={saveManual}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:bg-blue-300"
          >
            {busy === 'save' ? 'กำลังบันทึก...' : 'Save Manual JSON'}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-900">Answer Key JSON</div>
            <label className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold cursor-pointer hover:bg-slate-800">
              Upload JSON
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => onUploadJsonFile(e, 'answer_key')}
              />
            </label>
          </div>

          <textarea
            value={answerKeyText}
            onChange={(e) => setAnswerKeyText(e.target.value)}
            className="w-full min-h-[520px] rounded-xl border border-slate-300 p-4 font-mono text-sm"
            spellCheck={false}
          />

          <div className="text-sm">
            {parsedAnswerKey.ok ? (
              <span className="text-green-700 font-semibold">JSON ถูกต้อง</span>
            ) : (
              <span className="text-red-700 font-semibold">
                JSON ไม่ถูกต้อง: {parsedAnswerKey.error}
              </span>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-900">Grading Config JSON</div>
            <label className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold cursor-pointer hover:bg-slate-800">
              Upload JSON
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => onUploadJsonFile(e, 'grading_config')}
              />
            </label>
          </div>

          <textarea
            value={gradingConfigText}
            onChange={(e) => setGradingConfigText(e.target.value)}
            className="w-full min-h-[320px] rounded-xl border border-slate-300 p-4 font-mono text-sm"
            spellCheck={false}
          />

          <div className="text-sm">
            {parsedGradingConfig.ok ? (
              <span className="text-green-700 font-semibold">JSON ถูกต้อง</span>
            ) : (
              <span className="text-red-700 font-semibold">
                JSON ไม่ถูกต้อง: {parsedGradingConfig.error}
              </span>
            )}
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full min-h-[120px] rounded-xl border border-slate-300 p-4 text-sm"
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <div>Updated At: {formatDateTime(item?.updated_at)}</div>
            <div>Approved At: {formatDateTime(item?.approved_at)}</div>
            <div>Source File ID: {item?.source_file_id ?? '-'}</div>
            <div>Source PDF Path: {item?.source_pdf_path ?? '-'}</div>
            <div>Last Error: {item?.last_generation_error ?? '-'}</div>
          </div>
        </div>
      </section>
    </div>
  )
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="text-sm text-slate-500 font-medium">{title}</div>
      <div className="text-xl font-extrabold text-slate-900 mt-2">{value}</div>
    </div>
  )
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString('th-TH')
  } catch {
    return value
  }
}