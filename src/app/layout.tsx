import type {Metadata} from 'next';
import Link from 'next/link';
import {History, Sparkles} from 'lucide-react';
import './globals.css';

export const metadata: Metadata = {
  title: 'MotionFlow · 图片入场动效工坊',
  description: '批量把图片生成 5 秒入场特效视频',
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="topbar">
          <Link href="/" className="brand" aria-label="MotionFlow 首页">
            <span className="brand-mark"><Sparkles size={18} /></span>
            <span>MotionFlow</span>
            <span className="brand-badge">本地版</span>
          </Link>
          <nav className="topnav">
            <Link href="/" className="nav-link">动效工坊</Link>
            <Link href="/history" className="nav-link"><History size={16} />历史任务</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}

