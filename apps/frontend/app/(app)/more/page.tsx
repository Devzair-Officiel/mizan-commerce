'use client';

import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const MENU_ITEMS = [
  { href: '/reminders', label: 'Rappels' },
  { href: '/notes', label: 'Notes' },
  { href: '/zakat', label: 'Zakat' },
  { href: '/settings', label: 'Paramètres boutique' },
];

export default function MorePage() {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <>
      <TopBar title="Plus" />
      <div className="flex flex-col gap-4 p-4">
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
          {MENU_ITEMS.map(({ href, label }, i) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center justify-between px-4 py-3.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 ${
                i < MENU_ITEMS.length - 1 ? 'border-b border-zinc-100' : ''
              }`}
            >
              {label}
              <span className="text-zinc-400">›</span>
            </Link>
          ))}
        </div>

        <Button
          variant="outline"
          className="w-full text-red-500 border-red-200 hover:bg-red-50"
          onClick={handleLogout}
        >
          Se déconnecter
        </Button>
      </div>
    </>
  );
}
