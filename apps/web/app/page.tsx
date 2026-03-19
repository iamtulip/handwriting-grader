// apps/web/app/page.tsx
import { redirect } from 'next/navigation';

export default function HomePage() {
  // เด้งไปหน้า Login ทันที
  redirect('/login');
}