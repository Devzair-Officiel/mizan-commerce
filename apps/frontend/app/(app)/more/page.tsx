'use client';

import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const MENU_ITEMS = [
  { href: '/invoices', label: 'Factures' },
  { href: '/stock/add', label: 'Entrée stock' },
  { href: '/stock/out', label: 'Sortie stock' },
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
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {MENU_ITEMS.map(({ href, label }, i) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center justify-between px-4 py-3.5 text-sm font-medium text-foreground hover:bg-muted ${
                i < MENU_ITEMS.length - 1 ? 'border-b border-border' : ''
              }`}
            >
              {label}
              <span className="text-muted-foreground">›</span>
            </Link>
          ))}
        </div>

        <Button
          variant="destructive"
          className="w-full"
          onClick={handleLogout}
        >
          Se déconnecter
        </Button>
      </div>
    </>
  );
}
