'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

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

export default function AssignmentAnswerKeyEditorPage() {
  const params = useParams<{ assignmentId: string }>()
  const router = useRouter()
  const assignmentId = params.assignmentId

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [assignment, setAssignment] = useState<any>(null)
  const [answerKeyText, setAnswerKeyText] = useState(prettyJson(defaultAnswerKeyTemplate()))
  const [gradingConfigText, setGradingConfigText] = useState(
    prettyJson(defaultGradingConfigTemplate())
  )
  const [notes, setNotes] = useState('Manual answer key uploaded by staff')

  async function loadData() {
    const [assignmentRes, answerKeyRes] = await Promise.all([
      fetch(`/api/instructor/assignments/${assignmentId}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      }),
      fetch(`/api/instructor/assignments/${assignmentId}/answer-key`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      }),
    ])

    const assignmentJson = await assignmentRes.json()
    const answerKeyJson = await answerKeyRes.json()

    if (!assignmentRes.ok) {
      throw new Error(assignmentJson.error || 'Failed to load assignment')
    }

    if (!answerKeyRes.ok) {
      throw new Error(answerKeyJson.error || 'Failed to load answer key')
    }

    setAssignment(assignmentJson.assignment)

    if (answerKeyJson.item) {
      setAnswerKeyText(
        prettyJson(answerKeyJson.item.answer_key ?? defaultAnswerKeyTemplate())
      )
      setGradingConfigText(
        prettyJson(answerKeyJson.item.grading_config ?? defaultGradingConfigTemplate())
      )
      setNotes(answerKeyJson.item.generation_notes ?? 'Manual answer key uploaded by staff')
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

  async function saveManualAnswerKey() {
    setSaving(true)
    setStatus(null)

    try {
      if (!parsedAnswerKey.ok) {
        throw new Error(`Answer Key JSON ไม่ถูกต้อง: ${parsedAnswerKey.error}`)
      }

      if (!parsedGradingConfig.ok) {
        throw new Error(`Grading Config JSON ไม่ถูกต้อง: ${parsedGradingConfig.error}`)
      }

      const res = await fetch(`/api/instructor/assignments/${assignmentId}/answer-key`, {
        method: 'PATCH',
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

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')

      setStatus({ type: 'success', text: 'บันทึก Manual Answer Key สำเร็จ' })
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'บันทึกไม่สำเร็จ' })
    } finally {
      setSaving(false)
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
    return <div className="p-8">กำลังโหลด Answer Key Editor...</div>
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Manual Answer Key Editor</h1>
          <p className="text-slate-600 mt-2 text-lg">
            {assignment?.title ?? 'Assignment'}
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href={`/instructor/assignments/${assignmentId}`}
            className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
          >
            กลับหน้า Assignment
          </Link>
          <button
            type="button"
            onClick={saveManualAnswerKey}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:bg-blue-300"
          >
            {saving ? 'กำลังบันทึก...' : 'Save Manual Answer Key'}
          </button>
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
            className="w-full min-h-[500px] rounded-xl border border-slate-300 p-4 font-mono text-sm"
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
            className="w-full min-h-[380px] rounded-xl border border-slate-300 p-4 font-mono text-sm"
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
            <label className="block text-sm font-bold text-slate-700 mb-2">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full min-h-[100px] rounded-xl border border-slate-300 p-4 text-sm"
            />
          </div>
        </div>
      </section>
    </div>
  )
}