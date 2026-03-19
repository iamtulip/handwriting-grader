// apps/web/app/admin/page.tsx
'use client';

import { RosterUpload } from '../../components/roster/RosterUpload';

export default function AdminPage() {
  return (
    <div className="min-h-screen py-10">
      <RosterUpload />
    </div>
  );
}