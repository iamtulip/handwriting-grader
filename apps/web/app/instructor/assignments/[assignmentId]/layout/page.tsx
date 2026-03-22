'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { useParams } from 'next/navigation'
import type {
  AnswerType,
  AssignmentLayoutDataV2,
  GraderMode,
  IdentityType,
  LayoutRegion,
  RegionKind,
} from '@/types/layout-spec'
import { defaultLayoutData, normalizeLayoutData } from '@/lib/layout-schema'

const Document = dynamic(
  async () => {
    const mod = await import('react-pdf')
    mod.pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${mod.pdfjs.version}/build/pdf.worker.min.mjs`
    return mod.Document
  },
  { ssr: false }
)

const Page = dynamic(
  async () => {
    const mod = await import('react-pdf')
    return mod.Page
  },
  { ssr: false }
)

type EditorRegionItem = {
  id: string
  kind: RegionKind
  identity_type: IdentityType | null
  label: string
  question_no: number | null
  subquestion_no: string | null
  part_no: string | null
  group_id: string | null
  page_number: number
  x_norm: number
  y_norm: number
  w_norm: number
  h_norm: number
  answer_type: AnswerType | null
  score_weight: number
  grader: {
    mode: GraderMode
    tolerance?: {
      abs_tol: number
      rel_tol: number
    }
    accepted_values?: string[]
    case_sensitive?: boolean
    trim_spaces?: boolean
  }
}

type DragMode = 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se'

type DragState = {
  regionId: string
  mode: DragMode
  startMouseX: number
  startMouseY: number
  startXNorm: number
  startYNorm: number
  startWNorm: number
  startHNorm: number
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function clampMin(value: number, min: number) {
  return value < min ? min : value
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeBySize(deltaPx: number, sizePx: number) {
  if (!Number.isFinite(sizePx) || sizePx <= 0) return 0
  return deltaPx / sizePx
}

function getRegionDisplayName(region: EditorRegionItem) {
  if (region.kind === 'identity') {
    return region.identity_type ?? 'identity'
  }

  if (region.kind === 'table_cell') {
    return `Table Cell${region.question_no != null ? ` Q${region.question_no}` : ''}`
  }

  if (region.kind === 'working') {
    return `Working${region.question_no != null ? ` Q${region.question_no}` : ''}`
  }

  if (region.kind === 'instruction_ignored') {
    return 'Ignored Region'
  }

  return `Q${region.question_no ?? '?'}${region.part_no ? `:${region.part_no}` : ''}`
}

function bboxToEditorGeometry(region: LayoutRegion) {
  if (region.bbox_norm && region.bbox_norm.length === 4) {
    const [x1, y1, x2, y2] = region.bbox_norm
    return {
      x_norm: clamp01(x1),
      y_norm: clamp01(y1),
      w_norm: clamp01(x2 - x1),
      h_norm: clamp01(y2 - y1),
    }
  }

  if (region.polygon_norm && region.polygon_norm.length >= 3) {
    const xs = region.polygon_norm.map((p) => p[0])
    const ys = region.polygon_norm.map((p) => p[1])
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)

    return {
      x_norm: clamp01(minX),
      y_norm: clamp01(minY),
      w_norm: clamp01(maxX - minX),
      h_norm: clamp01(maxY - minY),
    }
  }

  return {
    x_norm: 0.1,
    y_norm: 0.1,
    w_norm: 0.2,
    h_norm: 0.08,
  }
}

function extractEditorRegions(layoutData: AssignmentLayoutDataV2): EditorRegionItem[] {
  const result: EditorRegionItem[] = []

  for (const page of layoutData.pages) {
    for (const region of page.regions) {
      const geometry = bboxToEditorGeometry(region)

      result.push({
        id: region.id,
        kind: region.kind,
        identity_type: region.identity_type ?? null,
        label: region.label ?? '',
        question_no: region.question_no ?? null,
        subquestion_no: region.subquestion_no ?? null,
        part_no: region.part_no ?? null,
        group_id: region.group_id ?? null,
        page_number: page.page_number,
        x_norm: geometry.x_norm,
        y_norm: geometry.y_norm,
        w_norm: geometry.w_norm,
        h_norm: geometry.h_norm,
        answer_type: region.answer_type ?? null,
        score_weight: region.score_weight ?? 1,
        grader: {
          mode: region.grader?.mode ?? 'deterministic',
          tolerance: region.grader?.tolerance,
          accepted_values: region.grader?.accepted_values,
          case_sensitive: region.grader?.case_sensitive,
          trim_spaces: region.grader?.trim_spaces,
        },
      })
    }
  }

  return result
}

function buildRegionFromEditorItem(item: EditorRegionItem): LayoutRegion {
  const x1 = clamp01(item.x_norm)
  const y1 = clamp01(item.y_norm)
  const x2 = clamp01(item.x_norm + Math.max(0.0001, item.w_norm))
  const y2 = clamp01(item.y_norm + Math.max(0.0001, item.h_norm))

  const answerType: AnswerType =
    item.kind === 'identity'
      ? 'text'
      : item.answer_type ?? (item.kind === 'table_cell' ? 'table_value' : 'number')

  return {
    id: item.id,
    kind: item.kind,
    label: item.label || undefined,
    question_no: item.question_no,
    subquestion_no: item.subquestion_no,
    part_no: item.part_no,
    group_id: item.group_id,
    identity_type: item.kind === 'identity' ? item.identity_type ?? 'student_id' : null,
    score_weight: item.score_weight,
    answer_type: answerType,
    grader: {
      mode: item.grader.mode,
      tolerance: item.grader.tolerance,
      accepted_values: item.grader.accepted_values,
      case_sensitive: item.grader.case_sensitive,
      trim_spaces: item.grader.trim_spaces ?? true,
    },
    bbox_norm: [x1, y1, Math.max(x1, x2), Math.max(y1, y2)],
  }
}

function rebuildLayoutDataFromEditorRegions(
  baseLayoutData: AssignmentLayoutDataV2,
  items: EditorRegionItem[],
  pageCount: number
): AssignmentLayoutDataV2 {
  const { normalized } = normalizeLayoutData(baseLayoutData, pageCount)

  const grouped = new Map<number, EditorRegionItem[]>()
  for (const item of items) {
    const list = grouped.get(item.page_number) ?? []
    list.push(item)
    grouped.set(item.page_number, list)
  }

  return {
    ...normalized,
    page_count: pageCount,
    pages: Array.from({ length: pageCount }, (_, i) => {
      const pageNumber = i + 1
      const page = normalized.pages.find((p) => p.page_number === pageNumber) ?? {
        page_number: pageNumber,
        regions: [],
      }

      const pageItems = grouped.get(pageNumber) ?? []

      return {
        ...page,
        page_number: pageNumber,
        regions: pageItems.map(buildRegionFromEditorItem),
      }
    }),
  }
}

function applyDragToRegion(
  region: EditorRegionItem,
  drag: DragState,
  clientX: number,
  clientY: number,
  pageWidth: number,
  pageHeight: number
): EditorRegionItem {
  const dxNorm = normalizeBySize(clientX - drag.startMouseX, pageWidth)
  const dyNorm = normalizeBySize(clientY - drag.startMouseY, pageHeight)

  const minW = 0.01
  const minH = 0.01

  let x = drag.startXNorm
  let y = drag.startYNorm
  let w = drag.startWNorm
  let h = drag.startHNorm

  if (drag.mode === 'move') {
    x = clamp01(drag.startXNorm + dxNorm)
    y = clamp01(drag.startYNorm + dyNorm)

    if (x + w > 1) x = Math.max(0, 1 - w)
    if (y + h > 1) y = Math.max(0, 1 - h)
  }

  if (drag.mode === 'resize-se') {
    w = clampMin(drag.startWNorm + dxNorm, minW)
    h = clampMin(drag.startHNorm + dyNorm, minH)
    if (x + w > 1) w = Math.max(minW, 1 - x)
    if (y + h > 1) h = Math.max(minH, 1 - y)
  }

  if (drag.mode === 'resize-nw') {
    const newX = clamp01(drag.startXNorm + dxNorm)
    const newY = clamp01(drag.startYNorm + dyNorm)
    const right = drag.startXNorm + drag.startWNorm
    const bottom = drag.startYNorm + drag.startHNorm

    x = Math.min(newX, right - minW)
    y = Math.min(newY, bottom - minH)
    w = Math.max(minW, right - x)
    h = Math.max(minH, bottom - y)
  }

  if (drag.mode === 'resize-ne') {
    const newY = clamp01(drag.startYNorm + dyNorm)
    const newRight = clamp01(drag.startXNorm + drag.startWNorm + dxNorm)
    const bottom = drag.startYNorm + drag.startHNorm

    y = Math.min(newY, bottom - minH)
    h = Math.max(minH, bottom - y)
    w = Math.max(minW, newRight - x)
    if (x + w > 1) w = Math.max(minW, 1 - x)
  }

  if (drag.mode === 'resize-sw') {
    const newX = clamp01(drag.startXNorm + dxNorm)
    const newBottom = clamp01(drag.startYNorm + drag.startHNorm + dyNorm)
    const right = drag.startXNorm + drag.startWNorm

    x = Math.min(newX, right - minW)
    w = Math.max(minW, right - x)
    h = Math.max(minH, newBottom - y)
    if (y + h > 1) h = Math.max(minH, 1 - y)
  }

  return {
    ...region,
    x_norm: clamp01(x),
    y_norm: clamp01(y),
    w_norm: clamp01(w),
    h_norm: clamp01(h),
  }
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

  const [regions, setRegions] = useState<EditorRegionItem[]>([])
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [activePointerId, setActivePointerId] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const pageLayerRef = useRef<HTMLDivElement | null>(null)

  const [pageRenderWidth, setPageRenderWidth] = useState<number>(900)
  const [pageRenderHeight, setPageRenderHeight] = useState<number>(1200)

  async function loadPdfUrl() {
    try {
      const res = await fetch(
        `/api/instructor/assignments/${assignmentId}/source-pdf/url?format=json`,
        {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        }
      )
      const data = await res.json()
      if (res.ok) {
        setPdfUrl(data.url ?? data.signed_url ?? null)
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
      const { normalized } = normalizeLayoutData(
        current.layout_data ?? defaultLayoutData(),
        Number(current.page_count ?? 1)
      )

      setSelectedSpecId(current.id)
      setSpecName(current.spec_name ?? `Layout v${current.version}`)
      setPageCount(String(current.page_count ?? normalized.page_count ?? 1))
      setNotes(current.notes ?? '')
      setLayoutDataText(prettyJson(normalized))

      const extracted = extractEditorRegions(normalized)
      setRegions(extracted)
      setCurrentPage(1)
      setSelectedRegionId(extracted[0]?.id ?? null)
    } else {
      const layout = defaultLayoutData()
      setSelectedSpecId('')
      setSpecName('Layout v1')
      setPageCount('1')
      setNotes('')
      setLayoutDataText(prettyJson(layout))
      setRegions([])
      setCurrentPage(1)
      setSelectedRegionId(null)
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

  useEffect(() => {
    const measure = () => {
      const canvas = pageLayerRef.current?.querySelector('canvas')
      if (canvas) {
        setPageRenderWidth(canvas.clientWidth || canvas.width || 900)
        setPageRenderHeight(canvas.clientHeight || canvas.height || 1200)
      }
    }

    const t = window.setTimeout(measure, 100)
    return () => window.clearTimeout(t)
  }, [currentPage, pdfUrl, pageCount])

  const parsedLayoutData = useMemo(() => {
    try {
      const raw = JSON.parse(layoutDataText)
      const { normalized } = normalizeLayoutData(raw, Number(pageCount || '1'))
      return { ok: true as const, value: normalized }
    } catch (e: any) {
      return { ok: false as const, error: e.message }
    }
  }, [layoutDataText, pageCount])

  const currentPageRegions = useMemo(
    () => regions.filter((r) => r.page_number === currentPage),
    [regions, currentPage]
  )

  const selectedRegion = useMemo(
    () => regions.find((r) => r.id === selectedRegionId) ?? null,
    [regions, selectedRegionId]
  )

  function syncTextFromRegions(
    nextRegions: EditorRegionItem[],
    nextPageCount = Number(pageCount || '1')
  ) {
    const base = parsedLayoutData.ok ? parsedLayoutData.value : defaultLayoutData(nextPageCount)
    const nextLayout = rebuildLayoutDataFromEditorRegions(base, nextRegions, nextPageCount)
    setLayoutDataText(prettyJson(nextLayout))
  }

  function selectSpec(id: string) {
    const found = items.find((x) => x.id === id)
    setSelectedSpecId(id)

    if (found) {
      const { normalized } = normalizeLayoutData(
        found.layout_data ?? defaultLayoutData(),
        Number(found.page_count ?? 1)
      )

      setSpecName(found.spec_name ?? `Layout v${found.version}`)
      setPageCount(String(found.page_count ?? normalized.page_count ?? 1))
      setNotes(found.notes ?? '')
      setLayoutDataText(prettyJson(normalized))

      const extracted = extractEditorRegions(normalized)
      setRegions(extracted)
      setSelectedRegionId(extracted[0]?.id ?? null)
      setCurrentPage(1)
    }
  }

  function addRegion(kind: RegionKind) {
    const nextQuestionNo =
      currentPageRegions.filter((r) => r.kind === 'answer' || r.kind === 'table_cell').length + 1

    const isIdentity = kind === 'identity'
    const newItem: EditorRegionItem = {
      id: crypto.randomUUID(),
      kind,
      identity_type: isIdentity ? 'student_id' : null,
      label: '',
      question_no: isIdentity || kind === 'instruction_ignored' ? null : nextQuestionNo,
      subquestion_no: null,
      part_no: null,
      group_id: null,
      page_number: currentPage,
      x_norm: 0.12,
      y_norm: clamp01(0.08 + currentPageRegions.length * 0.06),
      w_norm: isIdentity ? 0.28 : 0.22,
      h_norm: 0.05,
      answer_type: isIdentity ? 'text' : kind === 'table_cell' ? 'table_value' : 'number',
      score_weight: isIdentity ? 0 : 1,
      grader: isIdentity
        ? {
            mode: 'exact_text',
            trim_spaces: true,
          }
        : {
            mode: 'deterministic',
            tolerance: { abs_tol: 0, rel_tol: 0 },
            trim_spaces: true,
          },
    }

    const nextRegions = [...regions, newItem]
    setRegions(nextRegions)
    setSelectedRegionId(newItem.id)
    syncTextFromRegions(nextRegions)
  }

  function removeRegion(id: string) {
    const nextRegions = regions.filter((r) => r.id !== id)
    setRegions(nextRegions)
    if (selectedRegionId === id) {
      setSelectedRegionId(nextRegions[0]?.id ?? null)
    }
    syncTextFromRegions(nextRegions)
  }

  function updateSelectedRegion(patch: Partial<EditorRegionItem>) {
    if (!selectedRegion) return

    const nextRegions = regions.map((r) => {
      if (r.id !== selectedRegion.id) return r

      const next = { ...r, ...patch }

      if (next.kind === 'identity') {
        next.identity_type = next.identity_type ?? 'student_id'
        next.answer_type = 'text'
        next.score_weight = 0
        if (next.grader.mode === 'deterministic') {
          next.grader = {
            ...next.grader,
            mode: 'exact_text',
          }
        }
      } else {
        next.identity_type = null
        if (!next.answer_type) {
          next.answer_type = next.kind === 'table_cell' ? 'table_value' : 'number'
        }
      }

      next.x_norm = clamp01(next.x_norm)
      next.y_norm = clamp01(next.y_norm)
      next.w_norm = clamp01(next.w_norm)
      next.h_norm = clamp01(next.h_norm)

      return next
    })

    setRegions(nextRegions)
    syncTextFromRegions(nextRegions)
  }

  function beginDrag(
  e: React.PointerEvent<HTMLElement>,
  region: EditorRegionItem,
  mode: DragMode
) {
  e.preventDefault()
  e.stopPropagation()

  setSelectedRegionId(region.id)
  setActivePointerId(e.pointerId)

  try {
    e.currentTarget.setPointerCapture(e.pointerId)
  } catch {
    // ignore
  }

  setDragState({
    regionId: region.id,
    mode,
    startMouseX: e.clientX,
    startMouseY: e.clientY,
    startXNorm: region.x_norm,
    startYNorm: region.y_norm,
    startWNorm: region.w_norm,
    startHNorm: region.h_norm,
  })
}

  useEffect(() => {
  if (!dragState) return

  const activeDrag = dragState

  function handleMove(e: PointerEvent) {
    if (activePointerId !== null && e.pointerId !== activePointerId) return

    setRegions((prev) =>
      prev.map((region) =>
        region.id === activeDrag.regionId
          ? applyDragToRegion(
              region,
              activeDrag,
              e.clientX,
              e.clientY,
              pageRenderWidth,
              pageRenderHeight
            )
          : region
      )
    )
  }

  function finishDrag(e?: PointerEvent) {
    if (e && activePointerId !== null && e.pointerId !== activePointerId) return

    setRegions((prev) => {
      syncTextFromRegions(prev)
      return prev
    })
    setDragState(null)
    setActivePointerId(null)
  }

  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', finishDrag)
  window.addEventListener('pointercancel', finishDrag)

  return () => {
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', finishDrag)
    window.removeEventListener('pointercancel', finishDrag)
  }
}, [dragState, activePointerId, pageRenderWidth, pageRenderHeight])

  async function createNewSpec() {
    setBusy('create')
    setStatus(null)

    try {
      const layoutData = parsedLayoutData.ok
        ? rebuildLayoutDataFromEditorRegions(
            parsedLayoutData.value,
            regions,
            Number(pageCount || '1')
          )
        : defaultLayoutData(Number(pageCount || '1'))

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
      setStatus({ type: 'error', text: e.message || 'สร้าง layout spec ไม่สำเร็จ' })
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
      const normalized = rebuildLayoutDataFromEditorRegions(
        parsedLayoutData.value,
        regions,
        Number(pageCount || '1')
      )

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
          <h1 className="text-3xl font-extrabold text-slate-900">Visual Layout Editor</h1>
          <p className="text-slate-600 mt-2 text-lg">
            กำหนด regions บน PDF และจัดการ layout spec ของ assignment
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
                  v{item.version} • {item.spec_name ?? 'Untitled'}
                  {item.is_active ? ' • active' : ''}
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
            <div className="font-bold text-slate-900 text-lg">PDF Preview + Region Overlay</div>
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
              <div ref={pageLayerRef} className="relative inline-block">
                <Document
                  file={pdfUrl}
                  onLoadSuccess={(doc: { numPages: number }) => {
                    setPdfNumPages(doc.numPages)
                    const nextPageCount = String(doc.numPages)
                    setPageCount(nextPageCount)

                    const base = parsedLayoutData.ok
                      ? parsedLayoutData.value
                      : defaultLayoutData(doc.numPages)

                    const { normalized } = normalizeLayoutData(base, doc.numPages)
                    setLayoutDataText(prettyJson(normalized))
                    const extracted = extractEditorRegions(normalized)
                    setRegions(extracted)
                  }}
                >
                  <Page
                    pageNumber={currentPage}
                    width={pageRenderWidth}
                    onRenderSuccess={() => {
                      const canvas = pageLayerRef.current?.querySelector('canvas')
                      if (canvas) {
                        setPageRenderWidth(canvas.clientWidth || canvas.width || 900)
                        setPageRenderHeight(canvas.clientHeight || canvas.height || 1200)
                      }
                    }}
                  />
                </Document>

                <div
                  className="absolute left-0 top-0"
                  style={{
                    width: pageRenderWidth,
                    height: pageRenderHeight,
                  }}
                  onClick={() => setSelectedRegionId(null)}
                >
                  {currentPageRegions.map((region) => {
                    const left = region.x_norm * pageRenderWidth
                    const top = region.y_norm * pageRenderHeight
                    const width = region.w_norm * pageRenderWidth
                    const height = region.h_norm * pageRenderHeight

                    const isSelected = selectedRegionId === region.id

                    return (
                      <div
                        key={region.id}
                        className={`absolute border-2 ${
                          isSelected
                            ? 'border-red-500 bg-red-100/30'
                            : region.kind === 'identity'
                            ? 'border-amber-500 bg-amber-100/20'
                            : region.kind === 'table_cell'
                            ? 'border-indigo-500 bg-indigo-100/20'
                            : 'border-blue-500 bg-blue-100/20'
                        }`}
                        style={{
  left,
  top,
  width,
  height,
  cursor: dragState?.regionId === region.id ? 'grabbing' : 'move',
  userSelect: 'none',
  touchAction: 'none',
  zIndex: isSelected ? 30 : 20,
}}
                        onPointerDown={(e) => beginDrag(e, region, 'move')}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedRegionId(region.id)
                        }}
                      >
                        <div className="absolute left-0 top-0 bg-white/80 text-[10px] font-bold px-1 py-[1px]">
                          {getRegionDisplayName(region)}
                        </div>

                        {isSelected && (
  <>
    <ResizeHandle
      position="nw"
      onPointerDown={(e: React.PointerEvent<HTMLDivElement>) =>
        beginDrag(e, region, 'resize-nw')
      }
    />
    <ResizeHandle
      position="ne"
      onPointerDown={(e: React.PointerEvent<HTMLDivElement>) =>
        beginDrag(e, region, 'resize-ne')
      }
    />
    <ResizeHandle
      position="sw"
      onPointerDown={(e: React.PointerEvent<HTMLDivElement>) =>
        beginDrag(e, region, 'resize-sw')
      }
    />
    <ResizeHandle
      position="se"
      onPointerDown={(e: React.PointerEvent<HTMLDivElement>) =>
        beginDrag(e, region, 'resize-se')
      }
    />
  </>
)}

                      </div>
                    )
                  })}
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
            <div className="font-bold text-slate-900 text-lg mb-4">Region Actions</div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => addRegion('answer')}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700"
              >
                + Add Answer Region
              </button>

              <button
                type="button"
                onClick={() => addRegion('table_cell')}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700"
              >
                + Add Table Cell Region
              </button>

              <button
                type="button"
                onClick={() => addRegion('identity')}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700"
              >
                + Add Student ID Region
              </button>

              <button
                type="button"
                onClick={() => addRegion('working')}
                className="px-4 py-2 rounded-lg bg-slate-700 text-white font-bold hover:bg-slate-800"
              >
                + Add Working Region
              </button>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="font-bold text-slate-900 text-lg mb-4">Selected Region</div>

            {selectedRegion ? (
              <div className="space-y-4">
                <Field label="Region ID">
                  <input
                    value={selectedRegion.id}
                    onChange={(e) => updateSelectedRegion({ id: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-4 py-3"
                  />
                </Field>

                <Field label="Label">
                  <input
                    value={selectedRegion.label}
                    onChange={(e) => updateSelectedRegion({ label: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-4 py-3"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Kind">
                    <select
                      value={selectedRegion.kind}
                      onChange={(e) =>
                        updateSelectedRegion({ kind: e.target.value as RegionKind })
                      }
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 bg-white"
                    >
                      <option value="answer">answer</option>
                      <option value="table_cell">table_cell</option>
                      <option value="identity">identity</option>
                      <option value="working">working</option>
                      <option value="instruction_ignored">instruction_ignored</option>
                    </select>
                  </Field>

                  <Field label="Page">
                    <input
                      type="number"
                      min={1}
                      max={Number(pageCount || '1')}
                      value={selectedRegion.page_number}
                      onChange={(e) =>
                        updateSelectedRegion({ page_number: Number(e.target.value || '1') })
                      }
                      className="w-full rounded-lg border border-slate-300 px-4 py-3"
                    />
                  </Field>
                </div>

                {selectedRegion.kind === 'identity' && (
                  <Field label="Identity Type">
                    <select
                      value={selectedRegion.identity_type ?? 'student_id'}
                      onChange={(e) =>
                        updateSelectedRegion({
                          identity_type: e.target.value as IdentityType,
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 bg-white"
                    >
                      <option value="student_id">student_id</option>
                      <option value="full_name">full_name</option>
                      <option value="section">section</option>
                      <option value="other">other</option>
                    </select>
                  </Field>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Question No">
                    <input
                      type="number"
                      value={selectedRegion.question_no ?? ''}
                      onChange={(e) =>
                        updateSelectedRegion({
                          question_no: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 px-4 py-3"
                    />
                  </Field>

                  <Field label="Part No">
                    <input
                      value={selectedRegion.part_no ?? ''}
                      onChange={(e) => updateSelectedRegion({ part_no: e.target.value || null })}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Subquestion No">
                    <input
                      value={selectedRegion.subquestion_no ?? ''}
                      onChange={(e) =>
                        updateSelectedRegion({ subquestion_no: e.target.value || null })
                      }
                      className="w-full rounded-lg border border-slate-300 px-4 py-3"
                    />
                  </Field>

                  <Field label="Group ID">
                    <input
                      value={selectedRegion.group_id ?? ''}
                      onChange={(e) => updateSelectedRegion({ group_id: e.target.value || null })}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Answer Type">
                    <select
                      value={selectedRegion.answer_type ?? 'number'}
                      onChange={(e) =>
                        updateSelectedRegion({
                          answer_type: e.target.value as AnswerType,
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 bg-white"
                      disabled={selectedRegion.kind === 'identity'}
                    >
                      <option value="number">number</option>
                      <option value="text">text</option>
                      <option value="fraction">fraction</option>
                      <option value="expression">expression</option>
                      <option value="multiple_choice">multiple_choice</option>
                      <option value="table_value">table_value</option>
                    </select>
                  </Field>

                  <Field label="Score Weight">
                    <input
                      type="number"
                      step="0.1"
                      value={selectedRegion.score_weight}
                      onChange={(e) =>
                        updateSelectedRegion({
                          score_weight: Number(e.target.value || '0'),
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 px-4 py-3"
                    />
                  </Field>
                </div>

                <Field label="Grader Mode">
                  <select
                    value={selectedRegion.grader.mode}
                    onChange={(e) =>
                      updateSelectedRegion({
                        grader: {
                          ...selectedRegion.grader,
                          mode: e.target.value as GraderMode,
                        },
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 bg-white"
                  >
                    <option value="deterministic">deterministic</option>
                    <option value="exact_text">exact_text</option>
                    <option value="accepted_values">accepted_values</option>
                    <option value="symbolic_equivalence">symbolic_equivalence</option>
                  </select>
                </Field>

                <div className="grid grid-cols-4 gap-3">
                  <Field label="x_norm">
                    <input
                      type="number"
                      step="0.001"
                      min={0}
                      max={1}
                      value={selectedRegion.x_norm}
                      onChange={(e) =>
                        updateSelectedRegion({ x_norm: Number(e.target.value || '0') })
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-3"
                    />
                  </Field>

                  <Field label="y_norm">
                    <input
                      type="number"
                      step="0.001"
                      min={0}
                      max={1}
                      value={selectedRegion.y_norm}
                      onChange={(e) =>
                        updateSelectedRegion({ y_norm: Number(e.target.value || '0') })
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-3"
                    />
                  </Field>

                  <Field label="w_norm">
                    <input
                      type="number"
                      step="0.001"
                      min={0}
                      max={1}
                      value={selectedRegion.w_norm}
                      onChange={(e) =>
                        updateSelectedRegion({ w_norm: Number(e.target.value || '0') })
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-3"
                    />
                  </Field>

                  <Field label="h_norm">
                    <input
                      type="number"
                      step="0.001"
                      min={0}
                      max={1}
                      value={selectedRegion.h_norm}
                      onChange={(e) =>
                        updateSelectedRegion({ h_norm: Number(e.target.value || '0') })
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-3"
                    />
                  </Field>
                </div>

                <button
                  type="button"
                  onClick={() => removeRegion(selectedRegion.id)}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700"
                >
                  Delete Selected Region
                </button>
              </div>
            ) : (
              <div className="text-slate-500">ยังไม่ได้เลือก Region</div>
            )}
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="font-bold text-slate-900 text-lg mb-4">Region List</div>
            <div className="max-h-[340px] overflow-auto space-y-2">
              {currentPageRegions.map((region) => (
                <button
                  key={region.id}
                  type="button"
                  onClick={() => setSelectedRegionId(region.id)}
                  className={`w-full text-left rounded-lg border px-3 py-3 ${
                    region.id === selectedRegionId
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="font-semibold text-slate-900">
                    {getRegionDisplayName(region)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    x={region.x_norm.toFixed(3)}, y={region.y_norm.toFixed(3)}, w=
                    {region.w_norm.toFixed(3)}, h={region.h_norm.toFixed(3)}
                  </div>
                </button>
              ))}

              {currentPageRegions.length === 0 && (
                <div className="text-sm text-slate-500">ยังไม่มี Region ในหน้านี้</div>
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

function ResizeHandle({
  position,
  onPointerDown,
}: {
  position: 'nw' | 'ne' | 'sw' | 'se'
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
}) {
  const positionClass =
    position === 'nw'
      ? 'left-[-6px] top-[-6px] cursor-nwse-resize'
      : position === 'ne'
      ? 'right-[-6px] top-[-6px] cursor-nesw-resize'
      : position === 'sw'
      ? 'left-[-6px] bottom-[-6px] cursor-nesw-resize'
      : 'right-[-6px] bottom-[-6px] cursor-nwse-resize'

  return (
    <div
      className={`absolute h-3 w-3 rounded-full border border-slate-700 bg-white ${positionClass}`}
      style={{ touchAction: 'none', zIndex: 40 }}
      onPointerDown={onPointerDown}
    />
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
  children: ReactNode
}) {
  return (
    <label className="block space-y-2">
      <div className="text-sm font-bold text-slate-700">{label}</div>
      {children}
    </label>
  )
}