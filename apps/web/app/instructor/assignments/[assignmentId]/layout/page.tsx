'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { Document, Page, pdfjs } from 'react-pdf'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

type RoiItem = {
  id: string
  kind: 'answer' | 'table_cell' | 'student_id'
  question_no: string | null
  subquestion_no: string | null
  part_no: string | null
  group_id: string | null
  page_number: number
  x: number
  y: number
  w: number
  h: number
  answer_type: string
  score_weight: number
  grader?: any
}

function prettyJson(value: any) {
  return JSON.stringify(value, null, 2)
}

function defaultLayoutData() {
  return {
    schema_version: 2,
    document_type: 'worksheet',
    page_count: 1,
    settings: {
      allow_multi_roi_per_question: true,
      enable_identity_verification: true,
    },
    pages: [
      {
        page_number: 1,
        rois: [],
      },
    ],
  }
}

function ensurePages(layoutData: any, pageCount: number) {
  const base = layoutData && typeof layoutData === 'object' ? { ...layoutData } : defaultLayoutData()
  const pages = Array.isArray(base.pages) ? [...base.pages] : []
  const existing = new Map<number, any>()

  for (const p of pages) {
    const pageNumber = Number(p?.page_number ?? p?.page ?? 1)
    existing.set(pageNumber, {
      page_number: pageNumber,
      rois: Array.isArray(p?.rois) ? p.rois : [],
    })
  }

  const normalizedPages = []
  for (let i = 1; i <= pageCount; i += 1) {
    normalizedPages.push(
      existing.get(i) ?? {
        page_number: i,
        rois: [],
      }
    )
  }

  base.page_count = pageCount
  base.pages = normalizedPages
  return base
}

function extractRois(layoutData: any): RoiItem[] {
  const result: RoiItem[] = []
  for (const page of layoutData?.pages ?? []) {
    const pageNumber = Number(page?.page_number ?? page?.page ?? 1)
    const rois = Array.isArray(page?.rois) ? page.rois : []
    for (const roi of rois) {
      result.push({
        id: String(roi.id ?? crypto.randomUUID()),
        kind: roi.kind ?? 'answer',
        question_no: roi.question_no ?? null,
        subquestion_no: roi.subquestion_no ?? null,
        part_no: roi.part_no ?? null,
        group_id: roi.group_id ?? null,
        page_number: pageNumber,
        x: Number(roi.x ?? 0),
        y: Number(roi.y ?? 0),
        w: Number(roi.w ?? 120),
        h: Number(roi.h ?? 50),
        answer_type: roi.answer_type ?? 'number',
        score_weight: Number(roi.score_weight ?? 1),
        grader: roi.grader ?? {
          mode: 'deterministic',
          tolerance: { abs_tol: 0, rel_tol: 0 },
        },
      })
    }
  }
  return result
}

function rebuildLayoutDataFromRois(baseLayoutData: any, rois: RoiItem[], pageCount: number) {
  const next = ensurePages(baseLayoutData, pageCount)
  const grouped = new Map<number, RoiItem[]>()

  for (const roi of rois) {
    const list = grouped.get(roi.page_number) ?? []
    list.push(roi)
    grouped.set(roi.page_number, list)
  }

  next.pages = next.pages.map((page: any) => {
    const pageNumber = Number(page.page_number)
    const pageRois = grouped.get(pageNumber) ?? []
    return {
      ...page,
      page_number: pageNumber,
      rois: pageRois.map((roi) => ({
        id: roi.id,
        kind: roi.kind,
        question_no: roi.question_no,
        subquestion_no: roi.subquestion_no,
        part_no: roi.part_no,
        group_id: roi.group_id,
        page_number: roi.page_number,
        x: roi.x,
        y: roi.y,
        w: roi.w,
        h: roi.h,
        answer_type: roi.answer_type,
        score_weight: roi.score_weight,
        grader: roi.grader,
      })),
    }
  })

  return next
}

export default function AssignmentLayoutPage() {
  const params = useParams<{ assignmentId: string }>()
  const assignmentId = params.assignmentId

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'create' | 'save' | 'approve' | 'active' | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [active, setActive] = useState<any>(null)
  const [selectedSpecId, setSelectedSpecId] = useState<string>('')

  const [specName, setSpecName] = useState('Layout v1')
  const [pageCount, setPageCount] = useState('1')
  const [notes, setNotes] = useState('')
  const [layoutDataText, setLayoutDataText] = useState(prettyJson(defaultLayoutData()))
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfNumPages, setPdfNumPages] = useState<number>(1)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [rois, setRois] = useState<RoiItem[]>([])
  const [selectedRoiId, setSelectedRoiId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [pageRenderWidth, setPageRenderWidth] = useState<number>(900)

  async function loadPdfUrl() {
    try {
      const res = await fetch(`/api/instructor/assignments/${assignmentId}/source-pdf/url`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      const data = await res.json()
      if (res.ok) {
        setPdfUrl(data.signed_url)
      } else {
        setPdfUrl(null)
      }
    } catch {
      setPdfUrl(null)
    }
  }

  async function loadData() {
    const res = await fetch(`/api/instructor/assignments/${assignmentId}/layout`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to load layout')

    setItems(data.items ?? [])
    setActive(data.active ?? null)

    const current = data.active ?? data.items?.[0] ?? null
    if (current) {
      const normalized = ensurePages(current.layout_data ?? defaultLayoutData(), Number(current.page_count ?? 1))
      setSelectedSpecId(current.id)
      setSpecName(current.spec_name ?? `Layout v${current.version}`)
      setPageCount(String(current.page_count ?? 1))
      setNotes(current.notes ?? '')
      setLayoutDataText(prettyJson(normalized))
      setRois(extractRois(normalized))
      setCurrentPage(1)
      setSelectedRoiId(null)
    } else {
      const layout = defaultLayoutData()
      setSelectedSpecId('')
      setSpecName('Layout v1')
      setPageCount('1')
      setNotes('')
      setLayoutDataText(prettyJson(layout))
      setRois([])
      setCurrentPage(1)
      setSelectedRoiId(null)
    }
  }

  useEffect(() => {
    const run = async () => {
      try {
        await Promise.all([loadData(), loadPdfUrl()])
      } catch (e: any) {
        setStatus({ type: 'error', text: e.message || 'โหลด layout ไม่สำเร็จ' })
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [assignmentId])

  useEffect(() => {
    const handleResize = () => {
      const width = containerRef.current?.clientWidth ?? 900
      setPageRenderWidth(Math.max(400, Math.min(1000, width - 24)))
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const parsedLayoutData = useMemo(() => {
    try {
      return { ok: true, value: JSON.parse(layoutDataText) }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  }, [layoutDataText])

  const currentPageRois = useMemo(
    () => rois.filter((r) => r.page_number === currentPage),
    [rois, currentPage]
  )

  const selectedRoi = useMemo(
    () => rois.find((r) => r.id === selectedRoiId) ?? null,
    [rois, selectedRoiId]
  )

  function syncTextFromRois(nextRois: RoiItem[], nextPageCount = Number(pageCount || '1')) {
    const base =
      parsedLayoutData.ok ? parsedLayoutData.value : defaultLayoutData()
    const nextLayout = rebuildLayoutDataFromRois(base, nextRois, nextPageCount)
    setLayoutDataText(prettyJson(nextLayout))
  }

  function selectSpec(id: string) {
    const found = items.find((x) => x.id === id)
    setSelectedSpecId(id)

    if (found) {
      const normalized = ensurePages(found.layout_data ?? defaultLayoutData(), Number(found.page_count ?? 1))
      setSpecName(found.spec_name ?? `Layout v${found.version}`)
      setPageCount(String(found.page_count ?? 1))
      setNotes(found.notes ?? '')
      setLayoutDataText(prettyJson(normalized))
      const extracted = extractRois(normalized)
      setRois(extracted)
      setSelectedRoiId(extracted[0]?.id ?? null)
      setCurrentPage(1)
    }
  }

  function addRoi(kind: RoiItem['kind'] = 'answer') {
    const newRoi: RoiItem = {
      id: crypto.randomUUID(),
      kind,
      question_no: kind === 'student_id' ? null : String(currentPageRois.length + 1),
      subquestion_no: null,
      part_no: null,
      group_id: null,
      page_number: currentPage,
      x: 80,
      y: 80 + currentPageRois.length * 70,
      w: kind === 'student_id' ? 220 : 180,
      h: 50,
      answer_type: kind === 'student_id' ? 'string' : 'number',
      score_weight: kind === 'student_id' ? 0 : 1,
      grader:
        kind === 'student_id'
          ? { mode: 'identity_match' }
          : { mode: 'deterministic', tolerance: { abs_tol: 0, rel_tol: 0 } },
    }

    const nextRois = [...rois, newRoi]
    setRois(nextRois)
    setSelectedRoiId(newRoi.id)
    syncTextFromRois(nextRois)
  }

  function removeRoi(id: string) {
    const nextRois = rois.filter((r) => r.id !== id)
    setRois(nextRois)
    if (selectedRoiId === id) {
      setSelectedRoiId(nextRois[0]?.id ?? null)
    }
    syncTextFromRois(nextRois)
  }

  function updateSelectedRoi(patch: Partial<RoiItem>) {
    if (!selectedRoi) return
    const nextRois = rois.map((r) => (r.id === selectedRoi.id ? { ...r, ...patch } : r))
    setRois(nextRois)
    syncTextFromRois(nextRois)
  }

  async function createNewSpec() {
    setBusy('create')
    setStatus(null)

    try {
      const layoutData =
        parsedLayoutData.ok ? ensurePages(parsedLayoutData.value, Number(pageCount || '1')) : defaultLayoutData()

      const res = await fetch(`/api/instructor/assignments/${assignmentId}/layout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          action: 'create',
          spec_name: specName.trim() || 'Layout Draft',
          page_count: Number(pageCount || '1'),
          notes: notes.trim() || null,
          layout_data: layoutData,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Create layout failed')

      setStatus({ type: 'success', text: 'สร้าง layout spec ใหม่สำเร็จ' })
      await loadData()
      if (data.item?.id) selectSpec(data.item.id)
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'สร้าง layout ไม่สำเร็จ' })
    } finally {
      setBusy(null)
    }
  }

  async function saveSpec() {
    if (!selectedSpecId) {
      setStatus({ type: 'error', text: 'กรุณาเลือก spec ก่อน' })
      return
    }

    if (!parsedLayoutData.ok) {
      setStatus({ type: 'error', text: `Layout JSON ไม่ถูกต้อง: ${parsedLayoutData.error}` })
      return
    }

    setBusy('save')
    setStatus(null)

    try {
      const normalized = ensurePages(parsedLayoutData.value, Number(pageCount || '1'))

      const res = await fetch(`/api/instructor/assignments/${assignmentId}/layout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          action: 'save',
          spec_id: selectedSpecId,
          spec_name: specName.trim() || null,
          page_count: Number(pageCount || '1'),
          notes: notes.trim() || null,
          layout_data: normalized,
          layout_status: 'staff_defined',
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')

      setStatus({ type: 'success', text: 'บันทึก layout สำเร็จ' })
      await loadData()
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'บันทึก layout ไม่สำเร็จ' })
    } finally {
      setBusy(null)
    }
  }

  async function approveSpec() {
    if (!selectedSpecId) {
      setStatus({ type: 'error', text: 'กรุณาเลือก spec ก่อน' })
      return
    }

    setBusy('approve')
    setStatus(null)

    try {
      const res = await fetch(`/api/instructor/assignments/${assignmentId}/layout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
          spec_id: selectedSpecId,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Approve failed')

      setStatus({ type: 'success', text: 'Approve layout สำเร็จ' })
      await loadData()
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'Approve layout ไม่สำเร็จ' })
    } finally {
      setBusy(null)
    }
  }

  async function setActiveSpec() {
    if (!selectedSpecId) {
      setStatus({ type: 'error', text: 'กรุณาเลือก spec ก่อน' })
      return
    }

    setBusy('active')
    setStatus(null)

    try {
      const res = await fetch(`/api/instructor/assignments/${assignmentId}/layout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          action: 'set_active',
          spec_id: selectedSpecId,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Set active failed')

      setStatus({ type: 'success', text: 'ตั้ง active layout สำเร็จ' })
      await loadData()
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'ตั้ง active layout ไม่สำเร็จ' })
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return <div className="p-8">กำลังโหลด layout editor...</div>
  }

  return (
    <div className="space-y-8 max-w-[1500px] mx-auto">
      <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Visual ROI Layout Editor</h1>
          <p className="text-slate-600 mt-2 text-lg">
            กำหนด ROI บน PDF และจัดการ layout spec ของ assignment
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
            href={`/instructor/assignments/${assignmentId}/answer-key`}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700"
          >
            ไปหน้า Answer Key
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
        <InfoCard title="Specs" value={String(items.length)} />
        <InfoCard title="Active Version" value={active ? `v${active.version}` : '-'} />
        <InfoCard title="Active Status" value={active?.layout_status ?? '-'} />
        <InfoCard title="Current Page" value={String(currentPage)} />
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="font-bold text-slate-900 text-lg mb-4">Spec Controls</div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Select Spec</label>
            <select
              value={selectedSpecId}
              onChange={(e) => selectSpec(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 bg-white"
            >
              <option value="">-- Select Spec --</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  v{item.version} • {item.spec_name ?? 'Untitled'}{item.is_active ? ' • active' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Spec Name</label>
            <input
              value={specName}
              onChange={(e) => setSpecName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Page Count</label>
            <input
              type="number"
              min={1}
              value={pageCount}
              onChange={(e) => setPageCount(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
            />
          </div>

          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={createNewSpec}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:bg-blue-300"
            >
              {busy === 'create' ? 'กำลังสร้าง...' : 'New Spec'}
            </button>

            <button
              type="button"
              disabled={busy !== null || !selectedSpecId}
              onClick={saveSpec}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:bg-indigo-300"
            >
              {busy === 'save' ? 'กำลังบันทึก...' : 'Save Layout'}
            </button>

            <button
              type="button"
              disabled={busy !== null || !selectedSpecId}
              onClick={approveSpec}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:bg-emerald-300"
            >
              {busy === 'approve' ? 'กำลังอนุมัติ...' : 'Approve'}
            </button>

            <button
              type="button"
              disabled={busy !== null || !selectedSpecId}
              onClick={setActiveSpec}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800 disabled:bg-slate-300"
            >
              {busy === 'active' ? 'กำลังตั้งค่า...' : 'Set Active'}
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="font-bold text-slate-900 text-lg">PDF Preview + ROI Overlay</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold disabled:opacity-50"
              >
                Prev
              </button>
              <div className="text-sm text-slate-600">
                Page {currentPage} / {pdfNumPages}
              </div>
              <button
                type="button"
                disabled={currentPage >= pdfNumPages}
                onClick={() => setCurrentPage((p) => Math.min(pdfNumPages, p + 1))}
                className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>

          <div
            ref={containerRef}
            className="rounded-xl border border-slate-200 bg-slate-50 p-3 overflow-auto"
          >
            {pdfUrl ? (
              <div className="relative inline-block">
                <Document
                  file={pdfUrl}
                  onLoadSuccess={(doc) => {
                    setPdfNumPages(doc.numPages)
                    const nextPageCount = String(doc.numPages)
                    setPageCount(nextPageCount)

                    const base =
                      parsedLayoutData.ok ? parsedLayoutData.value : defaultLayoutData()
                    const normalized = ensurePages(base, doc.numPages)
                    setLayoutDataText(prettyJson(normalized))
                    const extracted = extractRois(normalized)
                    setRois(extracted)
                  }}
                >
                  <Page pageNumber={currentPage} width={pageRenderWidth} />
                </Document>

                <div
                  className="absolute left-0 top-0"
                  style={{ width: pageRenderWidth }}
                >
                  {currentPageRois.map((roi) => (
                    <button
                      key={roi.id}
                      type="button"
                      onClick={() => setSelectedRoiId(roi.id)}
                      className={`absolute border-2 text-[10px] font-bold px-1 text-left ${
                        selectedRoiId === roi.id
                          ? 'border-red-500 bg-red-100/40'
                          : roi.kind === 'student_id'
                          ? 'border-amber-500 bg-amber-100/30'
                          : 'border-blue-500 bg-blue-100/30'
                      }`}
                      style={{
                        left: roi.x,
                        top: roi.y,
                        width: roi.w,
                        height: roi.h,
                      }}
                    >
                      {roi.kind === 'student_id'
                        ? 'student_id'
                        : `Q${roi.question_no ?? '?'}${roi.part_no ? `:${roi.part_no}` : ''}`}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-10 text-center text-slate-500">
                ยังไม่มี Source PDF หรือไม่สามารถโหลด PDF ได้
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="font-bold text-slate-900 text-lg mb-4">ROI Actions</div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => addRoi('answer')}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700"
              >
                + Add Answer ROI
              </button>

              <button
                type="button"
                onClick={() => addRoi('table_cell')}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700"
              >
                + Add Table Cell ROI
              </button>

              <button
                type="button"
                onClick={() => addRoi('student_id')}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700"
              >
                + Add Student ID ROI
              </button>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="font-bold text-slate-900 text-lg mb-4">Selected ROI</div>

            {selectedRoi ? (
              <div className="space-y-4">
                <Field label="ROI ID">
                  <input
                    value={selectedRoi.id}
                    onChange={(e) => updateSelectedRoi({ id: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-4 py-3"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Kind">
                    <select
                      value={selectedRoi.kind}
                      onChange={(e) => updateSelectedRoi({ kind: e.target.value as RoiItem['kind'] })}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 bg-white"
                    >
                      <option value="answer">answer</option>
                      <option value="table_cell">table_cell</option>
                      <option value="student_id">student_id</option>
                    </select>
                  </Field>

                  <Field label="Page">
                    <input
                      type="number"
                      min={1}
                      max={Number(pageCount || '1')}
                      value={selectedRoi.page_number}
                      onChange={(e) => updateSelectedRoi({ page_number: Number(e.target.value || '1') })}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Question No">
                    <input
                      value={selectedRoi.question_no ?? ''}
                      onChange={(e) => updateSelectedRoi({ question_no: e.target.value || null })}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3"
                    />
                  </Field>

                  <Field label="Part No">
                    <input
                      value={selectedRoi.part_no ?? ''}
                      onChange={(e) => updateSelectedRoi({ part_no: e.target.value || null })}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Answer Type">
                    <input
                      value={selectedRoi.answer_type}
                      onChange={(e) => updateSelectedRoi({ answer_type: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3"
                    />
                  </Field>

                  <Field label="Score Weight">
                    <input
                      type="number"
                      step="0.1"
                      value={selectedRoi.score_weight}
                      onChange={(e) => updateSelectedRoi({ score_weight: Number(e.target.value || '0') })}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <Field label="x">
                    <input
                      type="number"
                      value={selectedRoi.x}
                      onChange={(e) => updateSelectedRoi({ x: Number(e.target.value || '0') })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-3"
                    />
                  </Field>

                  <Field label="y">
                    <input
                      type="number"
                      value={selectedRoi.y}
                      onChange={(e) => updateSelectedRoi({ y: Number(e.target.value || '0') })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-3"
                    />
                  </Field>

                  <Field label="w">
                    <input
                      type="number"
                      value={selectedRoi.w}
                      onChange={(e) => updateSelectedRoi({ w: Number(e.target.value || '0') })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-3"
                    />
                  </Field>

                  <Field label="h">
                    <input
                      type="number"
                      value={selectedRoi.h}
                      onChange={(e) => updateSelectedRoi({ h: Number(e.target.value || '0') })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-3"
                    />
                  </Field>
                </div>

                <button
                  type="button"
                  onClick={() => removeRoi(selectedRoi.id)}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700"
                >
                  Delete Selected ROI
                </button>
              </div>
            ) : (
              <div className="text-slate-500">ยังไม่ได้เลือก ROI</div>
            )}
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="font-bold text-slate-900 text-lg mb-4">ROI List</div>
            <div className="max-h-[340px] overflow-auto space-y-2">
              {currentPageRois.map((roi) => (
                <button
                  key={roi.id}
                  type="button"
                  onClick={() => setSelectedRoiId(roi.id)}
                  className={`w-full text-left rounded-lg border px-3 py-3 ${
                    roi.id === selectedRoiId
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="font-semibold text-slate-900">
                    {roi.kind === 'student_id'
                      ? 'student_id'
                      : `Q${roi.question_no ?? '?'}${roi.part_no ? `:${roi.part_no}` : ''}`}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    x={roi.x}, y={roi.y}, w={roi.w}, h={roi.h}
                  </div>
                </button>
              ))}

              {currentPageRois.length === 0 && (
                <div className="text-sm text-slate-500">ยังไม่มี ROI ในหน้านี้</div>
              )}
            </div>
          </section>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="font-bold text-slate-900 text-lg mb-4">Notes</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full min-h-[140px] rounded-xl border border-slate-300 p-4 text-sm"
          />
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="font-bold text-slate-900 text-lg mb-4">Layout Data JSON</div>
          <textarea
            value={layoutDataText}
            onChange={(e) => setLayoutDataText(e.target.value)}
            className="w-full min-h-[320px] rounded-xl border border-slate-300 p-4 font-mono text-sm"
            spellCheck={false}
          />
          <div className="mt-3 text-sm">
            {parsedLayoutData.ok ? (
              <span className="text-green-700 font-semibold">JSON ถูกต้อง</span>
            ) : (
              <span className="text-red-700 font-semibold">
                JSON ไม่ถูกต้อง: {parsedLayoutData.error}
              </span>
            )}
          </div>
        </section>
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

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-2">
      <div className="text-sm font-bold text-slate-700">{label}</div>
      {children}
    </label>
  )
}