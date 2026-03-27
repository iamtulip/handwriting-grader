'use client'

import { useMemo, useState } from 'react'

type Props = {
  pages: Array<{
    pageNumber: number
    imageUrl: string
  }>
  items: Array<{
    itemNo: string
    pageNumber: number | null
    bboxNorm: [number, number, number, number] | null
  }>
}

export function ExamPageViewer({ pages }: Props) {
  const [selectedPage, setSelectedPage] = useState<number>(
    pages[0]?.pageNumber ?? 1
  )

  const page = useMemo(
    () => pages.find((p) => p.pageNumber === selectedPage) ?? pages[0],
    [pages, selectedPage]
  )

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">ข้อสอบจริง</h2>
        <span className="text-sm text-neutral-500">
          หน้า {page?.pageNumber ?? '-'}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border bg-neutral-50">
        {page ? (
          <img
            src={page.imageUrl}
            alt={`Page ${page.pageNumber}`}
            className="h-auto w-full object-contain"
          />
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
    </div>
  )
}