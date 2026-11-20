import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RE:SAFE — AI Digital Safety & Recovery Platform',
  description: '딥페이크·온라인 사기 피해자를 위한 신고-상담-삭제요청-후속지원 플랫폼 (DEMO)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
