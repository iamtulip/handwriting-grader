export function ExamListFilters() {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <input
          type="text"
          placeholder="ค้นหาชุดข้อสอบ"
          className="rounded-xl border px-4 py-2 text-sm outline-none focus:border-neutral-400"
        />
        <select className="rounded-xl border px-4 py-2 text-sm outline-none focus:border-neutral-400">
          <option>ทุกสถานะ</option>
          <option>Draft</option>
          <option>Layout Ready</option>
          <option>Answer Key Ready</option>
          <option>Ready for Upload</option>
          <option>Processing</option>
          <option>Completed</option>
        </select>
        <select className="rounded-xl border px-4 py-2 text-sm outline-none focus:border-neutral-400">
          <option>ทุกภาคเรียน</option>
          <option>1/2026</option>
        </select>
      </div>
    </div>
  )
}