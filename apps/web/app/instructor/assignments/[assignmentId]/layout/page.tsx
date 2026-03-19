'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { AssignmentLayoutDataV2, LayoutRegion, LayoutPage } from '@/types/layout-spec'

function buildEmptyLayout(assignmentId: string): AssignmentLayoutDataV2 {
  return {
    schema_version: 2,
    document_type: 'worksheet',
    assignment_id: assignmentId,
    spec_name: 'New Layout Spec',
    page_count: 1,
    default_coordinate_space: 'normalized',
    settings: {
      allow_multi_roi_per_question: true,
      enable_identity_verification: true,
      enable_working_regions: false,
      default_answer_type: 'number',
    },
    pages: [
      {
        page_number: 1,
        page_label: 'Page 1',
        template_ref: {
          pdf_page_index: 0,
          rotation: 0,
        },
        regions: [],
      },
    ],
  }
}

export default function AssignmentLayoutEditorPage() {
  const params = useParams<{ assignmentId: string }>()
  const router = useRouter()
  const assignmentId = params.assignmentId

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [approving, setApproving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [assignment, setAssignment] = useState<any>(null)
  const [existingSpec, setExistingSpec] = useState<any>(null)
  const [layout, setLayout] = useState<AssignmentLayoutDataV2>(() => buildEmptyLayout(assignmentId))

  const [selectedPage, setSelectedPage] = useState(1)
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch(`/api/instructor/assignments/${assignmentId}/layout`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        })

        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load layout')

        setAssignment(data.assignment)
        setExistingSpec(data.spec ?? null)

        if (data.spec?.layout_data) {
          setLayout(data.spec.layout_data)
        } else {
          setLayout(buildEmptyLayout(assignmentId))
        }
      } catch (e: any) {
        setStatus({ type: 'error', text: e.message || 'โหลด layout ไม่สำเร็จ' })
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [assignmentId])

  const currentPage = useMemo(
    () => layout.pages.find((p) => p.page_number === selectedPage) ?? null,
    [layout, selectedPage]
  )

  const selectedRegion = useMemo(
    () => currentPage?.regions.find((r) => r.id === selectedRegionId) ?? null,
    [currentPage, selectedRegionId]
  )

  function updateLayout(mutator: (draft: AssignmentLayoutDataV2) => AssignmentLayoutDataV2) {
    setLayout((prev) => mutator(structuredClone(prev)))
  }

  function addPage() {
    updateLayout((draft) => {
      const nextPageNumber =
        draft.pages.length > 0
          ? Math.max(...draft.pages.map((p) => p.page_number)) + 1
          : 1

      draft.pages.push({
        page_number: nextPageNumber,
        page_label: `Page ${nextPageNumber}`,
        template_ref: {
          pdf_page_index: nextPageNumber - 1,
          rotation: 0,
        },
        regions: [],
      })
      draft.page_count = draft.pages.length
      return draft
    })
    setSelectedPage(layout.pages.length + 1)
  }

  function addRegion() {
    updateLayout((draft) => {
      const page = draft.pages.find((p) => p.page_number === selectedPage)
      if (!page) return draft

      const newRegion: LayoutRegion = {
        id: `region_${Date.now()}`,
        kind: 'answer',
        label: 'New Region',
        question_no: '',
        part_no: null,
        group_id: null,
        score_weight: 1,
        answer_type: 'number',
        bbox_norm: [0.1, 0.1, 0.3, 0.2],
        grader: {
          mode: 'deterministic',
          tolerance: {
            abs_tol: 0,
            rel_tol: 0,
          },
        },
        flags: {
          required: true,
          student_visible: false,
          review_if_empty: false,
        },
      }

      page.regions.push(newRegion)
      setSelectedRegionId(newRegion.id)
      return draft
    })
  }

  function updateSelectedRegion<K extends keyof LayoutRegion>(key: K, value: LayoutRegion[K]) {
    updateLayout((draft) => {
      const page = draft.pages.find((p) => p.page_number === selectedPage)
      const region = page?.regions.find((r) => r.id === selectedRegionId)
      if (!region) return draft
      region[key] = value
      return draft
    })
  }

  function removeSelectedRegion() {
    if (!selectedRegionId) return

    updateLayout((draft) => {
      const page = draft.pages.find((p) => p.page_number === selectedPage)
      if (!page) return draft

      page.regions = page.regions.filter((r) => r.id !== selectedRegionId)
      return draft
    })

    setSelectedRegionId(null)
  }

  async function saveSpec() {
    setSaving(true)
    setStatus(null)

    try {
      const res = await fetch(`/api/instructor/assignments/${assignmentId}/layout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          spec_name: layout.spec_name ?? 'Layout Spec',
          layout_data: layout,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')

      setStatus({ type: 'success', text: 'บันทึก layout spec สำเร็จ' })
      setExistingSpec(data.spec)
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'บันทึกไม่สำเร็จ' })
    } finally {
      setSaving(false)
    }
  }

  async function approveSpec() {
    if (!existingSpec?.id) {
      setStatus({ type: 'error', text: 'กรุณาบันทึก spec ก่อน approve' })
      return
    }

    setApproving(true)
    setStatus(null)

    try {
      const res = await fetch(`/api/instructor/assignments/${assignmentId}/layout/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          spec_id: existingSpec.id,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Approve failed')

      setStatus({ type: 'success', text: 'อนุมัติ layout spec สำเร็จ' })
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'อนุมัติไม่สำเร็จ' })
    } finally {
      setApproving(false)
    }
  }

  if (loading) {
    return <div className="p-8">กำลังโหลด Layout Editor...</div>
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Layout Spec Editor</h1>
          <p className="text-slate-600 mt-2 text-lg">
            {assignment?.title ?? 'Assignment'} — กำหนด ROI รายหน้า
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push(`/instructor/assignments`)}
            className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold"
          >
            ย้อนกลับ
          </button>
          <button
            type="button"
            onClick={saveSpec}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold disabled:bg-blue-300"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึก Spec'}
          </button>
          <button
            type="button"
            onClick={approveSpec}
            disabled={approving}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold disabled:bg-emerald-300"
          >
            {approving ? 'กำลังอนุมัติ...' : 'Approve'}
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

      <section className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)_420px] gap-6">
        <aside className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-800">Pages</div>
            <button
              type="button"
              onClick={addPage}
              className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm font-semibold"
            >
              + Page
            </button>
          </div>

          <div className="space-y-2">
            {layout.pages.map((page) => (
              <button
                key={page.page_number}
                type="button"
                onClick={() => {
                  setSelectedPage(page.page_number)
                  setSelectedRegionId(null)
                }}
                className={`w-full text-left rounded-lg border px-3 py-2 ${
                  selectedPage === page.page_number
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="font-semibold text-slate-900">
                  Page {page.page_number}
                </div>
                <div className="text-xs text-slate-500">
                  Regions: {page.regions.length}
                </div>
              </button>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-200">
            <label className="block text-sm font-bold text-slate-700 mb-2">
              Spec Name
            </label>
            <input
              value={layout.spec_name ?? ''}
              onChange={(e) =>
                setLayout((prev) => ({ ...prev, spec_name: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
        </aside>

        <main className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-slate-800">
                Working Canvas — Page {selectedPage}
              </div>
              <div className="text-sm text-slate-500">
                MVP ตอนนี้ยังเป็น manual bbox editor ก่อน ยังไม่ได้ลากบน PDF จริง
              </div>
            </div>

            <button
              type="button"
              onClick={addRegion}
              className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold"
            >
              + Region
            </button>
          </div>

          <div className="rounded-xl border border-dashed border-slate-300 min-h-[520px] bg-slate-50 p-4">
            <div className="text-sm text-slate-500 mb-4">
              ตรงนี้ในรอบถัดไปเราจะเปลี่ยนเป็น PDF page viewer + drag rectangle
            </div>

            <div className="space-y-3">
              {(currentPage?.regions ?? []).map((region) => (
                <button
                  key={region.id}
                  type="button"
                  onClick={() => setSelectedRegionId(region.id)}
                  className={`w-full text-left rounded-lg border px-4 py-3 ${
                    selectedRegionId === region.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="font-semibold text-slate-900">
                    {region.label || region.id}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    kind: {region.kind} • q: {region.question_no || '-'} • bbox:{' '}
                    {region.bbox_norm?.join(', ') || 'n/a'}
                  </div>
                </button>
              ))}

              {(!currentPage || currentPage.regions.length === 0) && (
                <div className="text-sm text-slate-500">
                  ยังไม่มี region ในหน้านี้
                </div>
              )}
            </div>
          </div>
        </main>

        <aside className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-800">Region Detail</div>
            <button
              type="button"
              onClick={removeSelectedRegion}
              disabled={!selectedRegion}
              className="px-3 py-1.5 rounded-md bg-red-600 text-white text-sm font-semibold disabled:bg-red-300"
            >
              Delete
            </button>
          </div>

          {!selectedRegion ? (
            <div className="text-sm text-slate-500">กรุณาเลือก region</div>
          ) : (
            <div className="space-y-4">
              <Field label="Region ID">
                <input
                  value={selectedRegion.id}
                  onChange={(e) => updateSelectedRegion('id', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </Field>

              <Field label="Label">
                <input
                  value={selectedRegion.label ?? ''}
                  onChange={(e) => updateSelectedRegion('label', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </Field>

              <Field label="Kind">
                <select
                  value={selectedRegion.kind}
                  onChange={(e) => updateSelectedRegion('kind', e.target.value as any)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
                >
                  <option value="identity">identity</option>
                  <option value="answer">answer</option>
                  <option value="table_cell">table_cell</option>
                  <option value="working">working</option>
                  <option value="instruction_ignored">instruction_ignored</option>
                </select>
              </Field>

              <Field label="Question No">
                <input
                  value={selectedRegion.question_no ?? ''}
                  onChange={(e) => updateSelectedRegion('question_no', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </Field>

              <Field label="Part No">
                <input
                  value={selectedRegion.part_no ?? ''}
                  onChange={(e) => updateSelectedRegion('part_no', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </Field>

              <Field label="Group ID">
                <input
                  value={selectedRegion.group_id ?? ''}
                  onChange={(e) => updateSelectedRegion('group_id', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </Field>

              <Field label="Identity Type">
                <select
                  value={selectedRegion.identity_type ?? ''}
                  onChange={(e) => updateSelectedRegion('identity_type', e.target.value || null)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
                >
                  <option value="">-- none --</option>
                  <option value="student_id">student_id</option>
                  <option value="full_name">full_name</option>
                  <option value="section">section</option>
                  <option value="other">other</option>
                </select>
              </Field>

              <Field label="Answer Type">
                <select
                  value={selectedRegion.answer_type ?? ''}
                  onChange={(e) => updateSelectedRegion('answer_type', e.target.value || null)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
                >
                  <option value="">-- none --</option>
                  <option value="number">number</option>
                  <option value="text">text</option>
                  <option value="fraction">fraction</option>
                  <option value="expression">expression</option>
                  <option value="multiple_choice">multiple_choice</option>
                  <option value="table_value">table_value</option>
                </select>
              </Field>

              <Field label="BBox (x1,y1,x2,y2 normalized 0-1)">
                <div className="grid grid-cols-2 gap-2">
                  {selectedRegion.bbox_norm?.map((value, idx) => (
                    <input
                      key={idx}
                      type="number"
                      step="0.001"
                      min={0}
                      max={1}
                      value={value}
                      onChange={(e) => {
                        const next = [...(selectedRegion.bbox_norm ?? [0, 0, 0, 0])] as [
                          number,
                          number,
                          number,
                          number
                        ]
                        next[idx as 0 | 1 | 2 | 3] = Number(e.target.value)
                        updateSelectedRegion('bbox_norm', next)
                      }}
                      className="rounded-lg border border-slate-300 px-3 py-2"
                    />
                  )) ?? null}
                </div>
              </Field>
            </div>
          )}
        </aside>
      </section>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-bold text-slate-700 mb-2">{label}</label>
      {children}
    </div>
  )
}