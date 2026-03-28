// apps/web/components/roster/RosterUpload.tsx
'use client'
import React, { useMemo, useState, useEffect } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

type Section = {
  id: string
  course_code: string
  section_number: number
  term: string
}

type ParsedStudent = {
  student_id_number: string
  full_name: string
  major?: string
}

function normalizeStudentId(input: any) {
  return String(input ?? '').replace(/\D/g, '').trim()
}

function normalizeText(input: any) {
  return String(input ?? '').trim().replace(/\s+/g, ' ')
}

function isLikelyStudentId(id: string) {
  return /^\d{10,15}$/.test(id)
}

export const RosterUpload = () => {
  const [sections, setSections] = useState<Section[]>([])
  const [selectedSection, setSelectedSection] = useState<string>('')
  const [parsedData, setParsedData] = useState<ParsedStudent[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  useEffect(() => {
    fetchSections()
  }, [])

  const fetchSections = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/sections', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setSections(data.items || [])
      } else {
        console.warn('Failed to fetch sections')
      }
    } catch (e) {
      console.error('Failed to load sections', e)
    }
  }

  // --- ฟังก์ชันส่วนกลางสำหรับ Mapping ข้อมูล (ใช้ร่วมกันทั้ง CSV และ XLSX) ---
  const processMappedData = (rows: any[]) => {
    const mapped = rows.map((row) => {
      // อิงจากโครงสร้างคอลัมน์ระบบ SIS PSU จริง
      const studentId =
        row['รหัสนักศึกษา'] ?? row['STUDENT_ID'] ?? row['รหัส'] ?? row['student_id'] ?? row['studentId']
      const name =
        row['ชื่อ - นามสกุล'] ?? row['ชื่อ-สกุล'] ?? row['ชื่อ-นามสกุล'] ?? row['FULL_NAME'] ?? row['ชื่อ'] ?? row['full_name'] ?? row['fullname']
      
      // ดึงวิชาเอกก่อน ถ้าเป็นขีด (-) หรือว่าง ให้ไปดึงสาขาวิชาแทน
      let majorRaw = row['วิชาเอก'];
      if (!majorRaw || majorRaw.trim() === '-') majorRaw = row['สาขาวิชา'];
      if (!majorRaw || majorRaw.trim() === '-') majorRaw = row['MAJOR'];

      const sid = normalizeStudentId(studentId)
      const fullName = normalizeText(name)
      const mj = normalizeText(majorRaw || '')

      return { student_id_number: sid, full_name: fullName, major: mj } as ParsedStudent
    })

    const warn: string[] = []
    const seen = new Set<string>()
    const cleaned: ParsedStudent[] = []

    for (const s of mapped) {
      if (!s.student_id_number || !s.full_name) continue

      if (!isLikelyStudentId(s.student_id_number)) {
        warn.push(`รูปแบบรหัสนักศึกษาอาจไม่ถูก: ${s.student_id_number}`)
      }

      if (seen.has(s.student_id_number)) continue
      seen.add(s.student_id_number)

      cleaned.push({
        student_id_number: s.student_id_number,
        full_name: s.full_name,
        major: s.major || '',
      })
    }

    setWarnings(warn.slice(0, 50))
    setParsedData(cleaned)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setStatusMsg(null)
    setWarnings([])
    setParsedData([])

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')

    if (isExcel) {
      // --- อ่านไฟล์ Excel (.xlsx / .xls) ---
      const reader = new FileReader()
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result
          const wb = XLSX.read(bstr, { type: 'binary' })
          const wsname = wb.SheetNames[0]
          const ws = wb.Sheets[wsname]
          const rows = XLSX.utils.sheet_to_json(ws)
          processMappedData(rows)
        } catch (err: any) {
          setStatusMsg({ type: 'error', text: `อ่านไฟล์ Excel ไม่สำเร็จ: ${err.message}` })
        }
      }
      reader.readAsBinaryString(file)
    } else {
      // --- อ่านไฟล์ CSV ---
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          processMappedData(results.data || [])
        },
        error: (error) => {
          setStatusMsg({ type: 'error', text: `อ่านไฟล์ CSV ไม่สำเร็จ: ${error.message}` })
        },
      })
    }
  }

  const canSubmit = useMemo(() => {
    return !!selectedSection && parsedData.length > 0 && !isUploading
  }, [selectedSection, parsedData.length, isUploading])

  const handleSubmit = async () => {
    if (!selectedSection) {
      setStatusMsg({ type: 'error', text: 'กรุณาเลือกกลุ่มเรียน (Section) ก่อนอัปโหลด' })
      return
    }
    if (parsedData.length === 0) {
      setStatusMsg({ type: 'error', text: 'ไม่มีข้อมูลนักศึกษาในไฟล์ (หลังทำความสะอาดแล้ว)' })
      return
    }

    setIsUploading(true)
    setStatusMsg(null)

    try {
      const res = await fetch('http://localhost:3001/api/rosters/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ section_id: selectedSection, students: parsedData }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Upload failed')

      setStatusMsg({ type: 'success', text: result.message || 'นำเข้ารายชื่อสำเร็จ' })
      if (Array.isArray(result.warnings) && result.warnings.length > 0) {
        setWarnings(result.warnings)
      }
      setParsedData([]) 
      const fileInput = document.getElementById('rosterFileInput') as HTMLInputElement
      if (fileInput) fileInput.value = ''
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: e.message })
    } finally {
      setIsUploading(false)
    }
  }

  // ปิด Mock ใน Production ตามแนวทางรักษาความปลอดภัย
  const showMockOption = process.env.NODE_ENV !== 'production'

  return (
    <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 max-w-4xl mx-auto mt-8">
      <h2 className="text-2xl font-black text-gray-800 mb-6">นำเข้ารายชื่อนักศึกษา (Roster Upload)</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">เลือกกลุ่มเรียน (Section) *</label>
          <select
            className="w-full border border-gray-300 p-3 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
          >
            <option value="">-- กรุณาเลือกกลุ่มเรียน --</option>
            {sections.map((sec) => (
              <option key={sec.id} value={sec.id}>
                {sec.course_code} - Sec {sec.section_number} ({sec.term})
              </option>
            ))}
            {showMockOption && (
              <option value="00000000-0000-0000-0000-000000000000">
                746-102 - Sec 03 (2/2568) [Mock]
              </option>
            )}
          </select>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">ไฟล์รายชื่อจากระบบ SIS (.csv หรือ .xlsx) *</label>
          <input
            id="rosterFileInput"
            type="file"
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
            onChange={handleFileUpload}
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
          />
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-4 rounded-lg mb-6 font-medium ${
            statusMsg.type === 'error'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="p-4 rounded-lg mb-6 bg-yellow-50 text-yellow-800 border border-yellow-200">
          <div className="font-bold mb-2">คำเตือน (Warnings)</div>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {warnings.slice(0, 10).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          {warnings.length > 10 && <div className="text-xs mt-2">แสดง 10 รายการแรกจาก {warnings.length} รายการ</div>}
        </div>
      )}

      {parsedData.length > 0 && (
        <div className="mt-8 border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 p-3 border-b border-gray-200 flex justify-between items-center">
            <span className="font-bold text-gray-700">ตัวอย่างข้อมูล ({parsedData.length} รายการ)</span>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {isUploading ? 'กำลังบันทึก...' : 'ยืนยันการนำเข้าข้อมูล'}
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100 text-gray-600 sticky top-0 shadow-sm">
                <tr>
                  <th className="p-3">รหัสนักศึกษา</th>
                  <th className="p-3">ชื่อ-นามสกุล</th>
                  <th className="p-3">สาขาวิชา</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parsedData.slice(0, 100).map((s, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="p-3 font-mono text-gray-800">{s.student_id_number}</td>
                    <td className="p-3 text-gray-800">{s.full_name}</td>
                    <td className="p-3 text-gray-500">{s.major || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {parsedData.length > 100 && (
            <div className="p-3 text-xs text-gray-500 border-t">
              แสดงตัวอย่าง 100 รายการแรก (จากทั้งหมด {parsedData.length})
            </div>
          )}
        </div>
      )}
    </div>
  )
}