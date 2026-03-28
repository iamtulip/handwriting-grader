'use client'

import { useMemo, useState } from 'react'
import type { ExamGradingItem } from '@/lib/admin/exam-grading'
import { ExamItemCard } from './exam-item-card'

type Props = {
  items: ExamGradingItem[]
}

export function ExamItemList({ items }: Props) {
  const [filter, setFilter] = useState<'all' | 'auto_graded' | 'needs_review'>(
    'all'
  )

  const filteredItems = useMemo(() => {
    const base =
      filter === 'all'
        ? items
        : items.filter((item) => item.decision === filter)

    return [...base].sort((a, b) =>
      a.itemNo.localeCompare(b.itemNo, 'th', {
        numeric: true,
        sensitivity: 'base',
      })
    )
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

        <span className="ml-auto rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-600">
          {filteredItems.length} items
        </span>
      </div>

      <div className="space-y-4">
        {filteredItems.map((item) => (
          <ExamItemCard key={`${item.itemNo}-${item.roiId ?? 'roi'}`} item={item} />
        ))}
      </div>
    </div>
  )
}