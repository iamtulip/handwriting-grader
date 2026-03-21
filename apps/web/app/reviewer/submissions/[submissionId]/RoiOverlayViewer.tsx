//apps/web/app/reviewer/submissions/[submissionId]/RoiOverlayViewer.tsx
'use client'

import { Document, Page, pdfjs } from 'react-pdf'
import { useMemo, useState } from 'react'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

type RoiOverlayViewerProps = {
  pdfUrl: string
  layoutData: any
  selectedRoiId?: string | null
  onSelectRoi?: (roiId: string) => void
}

export default function RoiOverlayViewer({
  pdfUrl,
  layoutData,
  selectedRoiId,
  onSelectRoi,
}: RoiOverlayViewerProps) {
  const [numPages, setNumPages] = useState(1)
  const [pageNumber, setPageNumber] = useState(1)
  const width = 900

  const pageRois = useMemo(() => {
    const page = (layoutData?.pages ?? []).find(
      (p: any) => Number(p?.page_number ?? 1) === pageNumber
    )
    return Array.isArray(page?.rois) ? page.rois : []
  }, [layoutData, pageNumber])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-bold text-slate-900">ROI Overlay Viewer</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold disabled:opacity-50"
          >
            Prev
          </button>
          <div className="text-sm text-slate-600">
            Page {pageNumber} / {numPages}
          </div>
          <button
            type="button"
            disabled={pageNumber >= numPages}
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 overflow-auto">
        <div className="relative inline-block">
          <Document
            file={pdfUrl}
            onLoadSuccess={(doc) => setNumPages(doc.numPages)}
          >
            <Page pageNumber={pageNumber} width={width} />
          </Document>

          <div className="absolute left-0 top-0" style={{ width }}>
            {pageRois.map((roi: any) => {
              const roiId = String(roi.id)
              const selected = selectedRoiId === roiId

              return (
                <button
                  key={roiId}
                  type="button"
                  onClick={() => onSelectRoi?.(roiId)}
                  className={`absolute border-2 px-1 text-[10px] font-bold text-left ${
                    selected
                      ? 'border-red-500 bg-red-100/40'
                      : roi.kind === 'student_id'
                      ? 'border-amber-500 bg-amber-100/30'
                      : 'border-blue-500 bg-blue-100/30'
                  }`}
                  style={{
                    left: Number(roi.x ?? 0),
                    top: Number(roi.y ?? 0),
                    width: Number(roi.w ?? 100),
                    height: Number(roi.h ?? 40),
                  }}
                >
                  {roi.kind === 'student_id'
                    ? 'student_id'
                    : `Q${roi.question_no ?? '?'}${roi.part_no ? `:${roi.part_no}` : ''}`}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}