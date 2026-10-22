'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';

export function ToolSwitcher() {
  const pathname = usePathname();
  return (
    <div className="tool-switcher" aria-label="工具类型">
      <Link className={pathname === '/' ? 'active' : ''} href="/">单图 5 秒特效</Link>
      <Link className={pathname.startsWith('/motion-sequence') ? 'active' : ''} href="/motion-sequence">三图 15 秒微动</Link>
    </div>
  );
}
