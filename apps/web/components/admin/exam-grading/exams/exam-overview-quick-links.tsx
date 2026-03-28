import Link from 'next/link'
import { SectionCard } from '../shared/section-card'

type Props = {
  examId: string
}

export function ExamOverviewQuickLinks({ examId }: Props) {
  const links = [
    {
      href: `/admin/exam-grading/exams/${examId}/layout`,
      title: 'ROI Layout',
      desc: 'กำหนดตำแหน่ง ROI ที่ระบบจะใช้ OCR อ่านคำตอบ',
    },
    {
      href: `/admin/exam-grading/exams/${examId}/answer-key`,
      title: 'Answer Key',
      desc: 'กำหนดเฉลย, accepted answers, tolerance, และคะแนน',
    },
    {
      href: `/admin/exam-grading/exams/${examId}/students`,
      title: 'ผู้เข้าสอบ / Student ID',
      desc: 'จัดการรายชื่อและ mapping คะแนนกลับไปยัง student id',
    },
    {
      href: `/admin/exam-grading/exams/${examId}/uploads`,
      title: 'อัปโหลดกระดาษคำตอบ',
      desc: 'อัปโหลดไฟล์คำตอบแบบเดี่ยวหรือ batch',
    },
    {
      href: `/admin/exam-grading/exams/${examId}/processing`,
      title: 'Processing Queue',
      desc: 'ดูสถานะการประมวลผล OCR และ grading',
    },
    {
      href: `/admin/exam-grading/exams/${examId}/results`,
      title: 'ผลตรวจ',
      desc: 'ดูคะแนน, confidence, decision และเปิดตรวจละเอียด',
    },
    {
      href: `/admin/exam-grading/exams/${examId}/export`,
      title: 'Export คะแนน',
      desc: 'ส่งออกคะแนนรวม, รายข้อ, และข้อมูล confidence',
    },
  ]

  return (
    <SectionCard
      title="ลิงก์ด่วน"
      description="เมนูย่อยสำหรับจัดการ exam ชุดนี้"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-2xl border p-4 transition hover:bg-neutral-50"
          >
            <div className="font-semibold text-neutral-900">{link.title}</div>
            <div className="mt-2 text-sm text-neutral-600">{link.desc}</div>
          </Link>
        ))}
      </div>
    </SectionCard>
  )
}