// apps/web/app/student/upload/_components/UploadForm.tsx
'use client'

import React, { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { v4 as uuidv4 } from 'uuid'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const MAX_PAGES = 60
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

const PDF_PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320">
    <rect width="100%" height="100%" fill="#e2e8f0"/>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
      font-family="Arial, sans-serif" font-weight="bold" font-size="28" fill="#475569">PDF</text>
  </svg>`)

function safeExt(file: File) {
  const name = file.name || ''
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  if (ext) return ext

  // fallback by mime
  if (file.type === 'image/jpeg') return 'jpg'
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'application/pdf') return 'pdf'
  return 'bin'
}

export default function UploadForm() {
  const supabase = createClient()

  const [assignmentId, setAssignmentId] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'init' | 'uploading' | 'finalizing' | 'success' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewsRef = useRef<string[]>([])
  useEffect(() => { previewsRef.current = previews }, [previews])

  const revokeAllPreviews = () => {
    previewsRef.current.forEach((p) => {
      if (p.startsWith('blob:')) URL.revokeObjectURL(p)
    })
  }

  useEffect(() => {
    return () => revokeAllPreviews()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const processFiles = (selected: FileList | File[]) => {
    const incoming = Array.from(selected)

    // ✅ limit pages (รวมของเดิมด้วย)
    if (files.length >= MAX_PAGES) {
      setMessage(`⚠️ จำนวนหน้าถึงขีดจำกัดแล้ว (สูงสุด ${MAX_PAGES} หน้า)`)
      return
    }

    const nextFiles: File[] = []
    const nextPreviews: string[] = []
    const rejected: string[] = []

    for (const file of incoming) {
      if (files.length + nextFiles.length >= MAX_PAGES) {
        rejected.push(`${file.name} (เกินจำนวนหน้าสูงสุด ${MAX_PAGES})`)
        continue
      }
      if (file.size > MAX_FILE_SIZE) {
        rejected.push(`${file.name} (เกิน 20MB)`)
        continue
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        rejected.push(`${file.name} (ชนิดไฟล์ไม่รองรับ)`)
        continue
      }

      nextFiles.push(file)
      if (file.type.startsWith('image/')) nextPreviews.push(URL.createObjectURL(file))
      else nextPreviews.push(PDF_PLACEHOLDER)
    }

    if (rejected.length > 0) setMessage(`⚠️ ข้ามไฟล์ที่ไม่ผ่านเงื่อนไข: ${rejected.join(', ')}`)
    else setMessage('')

    if (nextFiles.length > 0) {
      setFiles(prev => [...prev, ...nextFiles])
      setPreviews(prev => [...prev, ...nextPreviews])
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (['init', 'uploading', 'finalizing', 'success'].includes(uploadStatus)) return
    if (e.dataTransfer.files) processFiles(e.dataTransfer.files)
  }

  const removeFile = (index: number) => {
    setPreviews(prev => {
      const target = prev[index]
      if (target?.startsWith('blob:')) URL.revokeObjectURL(target)
      return prev.filter((_, i) => i !== index)
    })
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const requestCleanup = (paths: string[], assignmentIdLocked: string) => {
    if (!paths.length || !assignmentIdLocked) return

    const payload = JSON.stringify({ paths, assignment_id: assignmentIdLocked })

    // 1) sendBeacon (ทนการปิดหน้าได้ดี)
    try {
      if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
        const blob = new Blob([payload], { type: 'application/json' })
        ;(navigator as any).sendBeacon('/api/storage/cleanup', blob)
        return
      }
    } catch {}

    // 2) fallback fetch keepalive
    try {
      fetch('/api/storage/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {})
    } catch {}
  }

  const handleUploadProcess = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!assignmentId || files.length === 0) return

    if (files.length > MAX_PAGES) {
      setMessage(`❌ จำนวนหน้ามากเกินไป (สูงสุด ${MAX_PAGES} หน้า)`)
      return
    }

    // ✅ Stable assignmentId used throughout this transaction
    const assignmentIdLocked = assignmentId.trim()
    const uploadedPaths: string[] = []

    try {
      setUploadStatus('init')
      setMessage('กำลังตรวจสอบข้อมูลวิชา...')

      const initRes = await fetch('/api/submissions/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_id: assignmentIdLocked }),
      })
      const initData = await initRes.json()
      if (!initRes.ok) throw new Error(initData.error || 'Init failed')

      const { submission_id, student_id } = initData

      setUploadStatus('uploading')

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const ext = safeExt(file)
        const path = `${assignmentIdLocked}/${student_id}/${uuidv4()}.${ext}`

        const { error: uploadErr } = await supabase.storage
          .from('exam-papers')
          .upload(path, file, { cacheControl: '3600', upsert: false })

        if (uploadErr) throw new Error(`Upload failed for file ${i + 1}: ${uploadErr.message}`)

        uploadedPaths.push(path)
        setProgress(Math.round(((i + 1) / files.length) * 100))
      }

      setUploadStatus('finalizing')
      setMessage('กำลังจัดคิวให้ระบบ AI ตรวจ...')

      const finalizeRes = await fetch('/api/submissions/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id, assignment_id: assignmentIdLocked, files: uploadedPaths }),
      })
      const finalizeData = await finalizeRes.json()
      if (!finalizeRes.ok) throw new Error(finalizeData.error || 'Finalize failed')

      setUploadStatus('success')
      setMessage(`✅ ส่งข้อสอบสำเร็จ! งานถูกส่งเข้าคิว AI เรียบร้อยแล้ว (Ref: ${String(submission_id).split('-')[0]})`)

      revokeAllPreviews()
      setFiles([])
      setPreviews([])
      setProgress(0)

    } catch (err: any) {
      console.error(err)

      // ✅ Orphan cleanup (server-side)
      if (uploadedPaths.length > 0) {
        requestCleanup(uploadedPaths, assignmentIdLocked)
      }

      setUploadStatus('error')
      setMessage(`❌ ผิดพลาด: ${err?.message || 'Unknown error'}`)
      setProgress(0)
    }
  }

  return (
    <form onSubmit={handleUploadProcess} className="space-y-6">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">รหัสชุดข้อสอบ (Assignment ID)</label>
        <input
          type="text"
          required
          placeholder="Ex: a1b2c3d4-..."
          value={assignmentId}
          onChange={(e) => setAssignmentId(e.target.value)}
          className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none font-mono text-sm transition shadow-sm"
          disabled={['init', 'uploading', 'finalizing', 'success'].includes(uploadStatus)}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">อัปโหลดภาพข้อสอบ</label>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center bg-slate-50 hover:bg-slate-100 transition relative cursor-pointer ${
            ['init', 'uploading', 'finalizing', 'success'].includes(uploadStatus) ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          <input
            type="file"
            multiple
            ref={fileInputRef}
            accept="image/jpeg, image/png, image/webp, application/pdf"
            onChange={(e) => e.target.files && processFiles(e.target.files)}
            className="hidden"
            disabled={['init', 'uploading', 'finalizing', 'success'].includes(uploadStatus)}
          />
          <span className="text-4xl mb-3 block">📥</span>
          <span className="text-sm font-bold text-blue-600">คลิก หรือ ลากไฟล์มาวางที่นี่</span>
          <p className="text-xs text-slate-500 mt-2">รองรับ JPEG, PNG, WEBP, PDF (สูงสุด {MAX_PAGES} หน้า, หน้าละ 20MB)</p>
        </div>

        {previews.length > 0 && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {previews.map((src, idx) => (
              <div
                key={idx}
                className="relative group rounded-lg overflow-hidden border border-slate-200 aspect-[3/4] bg-slate-100 flex items-center justify-center shadow-sm"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`หน้า ${idx + 1}`} className="object-cover w-full h-full" />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeFile(idx) }}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm opacity-0 group-hover:opacity-100 transition disabled:hidden shadow-md hover:bg-red-600"
                  disabled={['init', 'uploading', 'finalizing'].includes(uploadStatus)}
                >
                  ✕
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-slate-900/75 backdrop-blur-md text-white text-[10px] px-2 py-1.5 flex justify-between items-center">
                  <span className="font-medium">หน้า {idx + 1}</span>
                  <span className="text-slate-300 font-mono">{(files[idx]?.size ? files[idx].size / 1024 / 1024 : 0).toFixed(1)}MB</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {uploadStatus === 'uploading' && (
        <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
          <div className="bg-blue-600 h-2.5 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
        </div>
      )}

      <button
        type="submit"
        disabled={['init', 'uploading', 'finalizing'].includes(uploadStatus) || files.length === 0}
        className="w-full bg-blue-700 text-white font-bold py-3.5 rounded-lg hover:bg-blue-800 transition disabled:bg-slate-300 disabled:text-slate-500 shadow-md flex justify-center items-center gap-2"
      >
        {['init', 'uploading', 'finalizing'].includes(uploadStatus) ? 'กำลังประมวลผล...' : 'ยืนยันการส่งข้อสอบ'}
      </button>

      {message && (
        <div
          className={`p-4 rounded-lg text-sm font-medium flex items-start gap-3 border shadow-sm ${
            uploadStatus === 'error' || message.includes('⚠️')
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : uploadStatus === 'success'
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-blue-50 text-blue-700 border-blue-200'
          }`}
        >
          <span>
            {uploadStatus === 'error' ? '❌' : uploadStatus === 'success' ? '✅' : message.includes('⚠️') ? '⚠️' : '⏳'}
          </span>
          <span className="leading-relaxed">{message}</span>
        </div>
      )}
    </form>
  )
}