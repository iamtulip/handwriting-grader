// apps/web/app/admin/roster/page.tsx
import { RosterUpload } from '@/components/roster/RosterUpload'

export default function AdminRosterPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <RosterUpload />
    </div>
  )
}