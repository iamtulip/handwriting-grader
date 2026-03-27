'use client'

import { useMemo, useState } from 'react'
import { ExamItemCard } from './exam-item-card'

type Item = {
  itemNo: string
  pageNumber: number | null
  roiImageUrl: string | null
  expectedAnswer: string | null
  answerType: string | null
  autoScore: number | null
  finalScore: number | null
  confidence: number | null
  decision: 'auto_graded' | 'needs_review'
  selectedCandidateText: string | null
  selectedCandidateNormalized: string | null
  googleRawByVariant: Array<{ variant: string; results: any[] }>
  ocr2RawByVariant: Array<{ variant: string; results: any[] }>
  candidates: any[]
  reason: string | null
  bboxNorm: [number, number, number, number] | null
}

type Props = {
  items: Item[]
}

export function ExamItemList({ items }: Props) {
  const [filter, setFilter] = useState<'all' | 'auto_graded' | 'needs_review'>('all')

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items
    return items.filter((item) => item.decision === filter)
  }, [items, filter])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-4 shadow-sm">
        <button
          onClick={() => setFilter('all')}
          className={`rounded-lg px-3 py-2 text-sm ${
            filter === 'all'
              ? 'bg-neutral-900 text-white'
              : 'border bg-white text-neutral-700'
          }`}
        >
          ทั้งหมด
        </button>

        <button
          onClick={() => setFilter('auto_graded')}
          className={`rounded-lg px-3 py-2 text-sm ${
            filter === 'auto_graded'
              ? 'bg-emerald-600 text-white'
              : 'border bg-white text-neutral-700'
          }`}
        >
          Auto graded
        </button>

        <button
          onClick={() => setFilter('needs_review')}
          className={`rounded-lg px-3 py-2 text-sm ${
            filter === 'needs_review'
              ? 'bg-amber-500 text-white'
              : 'border bg-white text-neutral-700'
          }`}
        >
          Needs review
        </button>
      </div>

      <div className="space-y-4">
        {filteredItems.map((item) => (
          <ExamItemCard key={item.itemNo} item={item} />
        ))}
      </div>
    </div>
  )
}