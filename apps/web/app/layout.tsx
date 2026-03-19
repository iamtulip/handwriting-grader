// apps/web/app/layout.tsx
import '../styles/globals.css'; // ดึงความสวยงามของ Tailwind มาใช้
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Diamond V2 - Academic OS',
  description: 'Handwriting Grader System for PSU',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body className="min-h-screen bg-gray-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}