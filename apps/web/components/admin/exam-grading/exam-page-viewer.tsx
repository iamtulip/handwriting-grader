'use client'

import { useMemo, useState } from 'react'
import type { ExamGradingItem } from '@/lib/admin/exam-grading'

type Props = {
  pages: Array<{
    pageNumber: number
    imageUrl: string
  }>
  items: Pick<
    ExamGradingItem,
    | 'itemNo'
    | 'questionNo'
    | 'pageNumber'
    | 'bboxNorm'
    | 'decision'
    | 'confidence'
    | 'selectedCandidateText'
  >[]
}

function sortItemNo(a: string, b: string) {
  return a.localeCompare(b, 'th', {
    numeric: true,
    sensitivity: 'base',
  })
}

function boxTone(decision: 'auto_graded' | 'needs_review') {
  return decision === 'auto_graded'
    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700'
    : 'border-amber-500 bg-amber-500/10 text-amber-700'
}

export function ExamPageViewer({ pages, items }: Props) {
  const [selectedPage, setSelectedPage] = useState<number>(
    pages[0]?.pageNumber ?? 1
  )

  const page = useMemo(
    () => pages.find((p) => p.pageNumber === selectedPage) ?? pages[0],
    [pages, selectedPage]
  )

  const pageItems = useMemo(
    () =>
      items
        .filter((item) => item.pageNumber === selectedPage && item.bboxNorm)
        .sort((a, b) => sortItemNo(a.itemNo, b.itemNo)),
    [items, selectedPage]
  )

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">ข้อสอบจริง</h2>
          <p className="text-sm text-neutral-500">
            หน้า {page?.pageNumber ?? '-'} · ROI {pageItems.length} จุด
          </p>
        </div>

        <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-600">
          Page {page?.pageNumber ?? '-'}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border bg-neutral-50 p-2">
        {page ? (
          <div className="relative mx-auto w-full">
            <img
              src={page.imageUrl}
              alt={`Page ${page.pageNumber}`}
              className="block h-auto w-full rounded-lg object-contain"
            />

            <div className="pointer-events-none absolute inset-0">
              {pageItems.map((item) => {
                const bbox = item.bboxNorm
                if (!bbox) return null

                const [x, y, w, h] = bbox

                return (
                  <div
                    key={`${item.pageNumber}-${item.itemNo}`}
                    className={`absolute border-2 ${boxTone(item.decision)}`}
                    style={{
                      left: `${x * 100}%`,
                      top: `${y * 100}%`,
                      width: `${w * 100}%`,
                      height: `${h * 100}%`,
                    }}
                  >
                    <div className="absolute left-0 top-0 rounded-br-md bg-white/90 px-2 py-1 text-[11px] font-semibold shadow-sm">
                      ข้อ {item.itemNo}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-neutral-500">
            ไม่พบภาพข้อสอบ
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {pages.map((p) => (
          <button
            key={p.pageNumber}
            onClick={() => setSelectedPage(p.pageNumber)}
            className={`rounded-lg border px-3 py-2 text-sm ${
              selectedPage === p.pageNumber
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'bg-white text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            หน้า {p.pageNumber}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-sm font-semibold text-neutral-900">
          รายการข้อในหน้านี้
        </p>

        {pageItems.length === 0 ? (
          <div className="rounded-xl border border-dashed p-3 text-sm text-neutral-500">
            ยังไม่พบ ROI สำหรับหน้านี้
          </div>
        ) : (
          <div className="space-y-2">
            {pageItems.map((item) => (
              <div
                key={`summary-${item.pageNumber}-${item.itemNo}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-neutral-900">
                    ข้อ {item.itemNo}
                  </span>
                  {item.questionNo ? (
                    <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-600">
                      Q {item.questionNo}
                    </span>
                  ) : null}
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      item.decision === 'auto_graded'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {item.decision}
                  </span>
                </div>

                <div className="text-right text-sm text-neutral-600">
                  <div>Conf. {(item.confidence ?? 0).toFixed(2)}</div>
                  <div className="truncate">
                    {item.selectedCandidateText ?? '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}