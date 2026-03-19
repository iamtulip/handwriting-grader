// apps/web/components/dashboard/InstructorExportView.tsx
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

export const InstructorExportView = () => {
  const [sections, setSections] = useState<any[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'error' | 'success', text: string } | null>(null);

  useEffect(() => {
    // ดึงกลุ่มเรียนที่อาจารย์รับผิดชอบ
    const fetchSections = async () => {
      try {
        const res = await fetch('/api/sections', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setSections(data.items || []);
        }
      } catch (e) {
        console.error('Failed to load sections');
      }
    };
    fetchSections();
  }, []);

  const handleExportExcel = async () => {
    if (!selectedSection) {
      setStatusMsg({ type: 'error', text: 'กรุณาเลือกกลุ่มเรียนที่ต้องการ Export' });
      return;
    }

    setLoading(true);
    setStatusMsg(null);

    try {
      // 1. ดึงข้อมูลคะแนนจาก API ที่เราเพิ่งสร้าง
      const res = await fetch(`/api/grades/section/${selectedSection}`, { credentials: 'include' });
      const result = await res.json();

      if (!res.ok) throw new Error(result.error || 'ดึงข้อมูลคะแนนไม่สำเร็จ');
      
      if (!result.data || result.data.length === 0) {
         setStatusMsg({ type: 'error', text: 'ไม่พบข้อมูลนักศึกษา หรือยังไม่มีการให้คะแนนในกลุ่มนี้' });
         return;
      }

      // 2. ใช้ไลบรารี xlsx สร้างไฟล์ Excel
      const worksheet = XLSX.utils.json_to_sheet(result.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Grades');

      // หาชื่อ Section เพื่อตั้งชื่อไฟล์
      const secInfo = sections.find(s => s.id === selectedSection);
      const fileName = secInfo ? `Grades_${secInfo.course_code}_Sec${secInfo.section_number}.xlsx` : 'Grades_Export.xlsx';

      // 3. สั่งดาวน์โหลด
      XLSX.writeFile(workbook, fileName);
      setStatusMsg({ type: 'success', text: `ดาวน์โหลดไฟล์ ${fileName} สำเร็จ!` });

    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 mt-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-black text-gray-800 mb-6">ส่งออกคะแนน (Export Grades to Excel)</h2>
      
      <div className="flex flex-col md:flex-row gap-4 items-end mb-6">
        <div className="flex-grow w-full">
          <label className="block text-sm font-bold text-gray-700 mb-2">เลือกกลุ่มเรียน (Section)</label>
          <select 
            className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-green-500 bg-gray-50"
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
          >
            <option value="">-- กรุณาเลือกกลุ่มเรียน --</option>
            {sections.map(sec => (
              <option key={sec.id} value={sec.id}>
                {sec.course_code} - Sec {sec.section_number} ({sec.term})
              </option>
            ))}
          </select>
        </div>
        
        <button 
          onClick={handleExportExcel}
          disabled={loading || !selectedSection}
          className="w-full md:w-auto bg-green-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 transition"
        >
          {loading ? 'กำลังประมวลผล...' : '📊 ดาวน์โหลด Excel (.xlsx)'}
        </button>
      </div>

      {statusMsg && (
        <div className={`p-4 rounded-lg font-bold ${statusMsg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {statusMsg.text}
        </div>
      )}

      <div className="mt-6 bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800">
        <strong>💡 CTO Tip:</strong> ไฟล์ Excel ที่ดาวน์โหลดจะอ้างอิงรายชื่อจากไฟล์ SIS ต้นฉบับ (รหัสนักศึกษา, ชื่อ-นามสกุล, สาขา) และเพิ่มคอลัมน์คะแนนของแต่ละสัปดาห์ต่อท้ายอัตโนมัติ ทำให้คุณสามารถ Copy/Paste ลงระบบเกรดของมหาวิทยาลัยได้ทันทีครับ
      </div>
    </div>
  );
};