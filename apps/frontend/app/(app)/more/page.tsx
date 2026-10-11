'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

// Libellés sous `layout.nav.<clé>`.
const MENU_ITEMS = [
  { href: '/invoices', label: 'invoices' },
  { href: '/stock/add', label: 'stock_in' },
  { href: '/stock/out', label: 'stock_out' },
  { href: '/reminders', label: 'reminders' },
  { href: '/notes', label: 'notes' },
  { href: '/zakat', label: 'zakat' },
  { href: '/settings', label: 'settings' },
] as const;

export default function MorePage() {
  const t = useTranslations('layout');
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <>
      <TopBar title={t('nav.more')} />
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
              {t(`nav.${label}`)}
              <span className="text-muted-foreground rtl:rotate-180">›</span>
            </Link>
          ))}
        </div>

        <Button
          variant="destructive"
          className="w-full"
          onClick={handleLogout}
        >
          {t('common.logout')}
        </Button>
      </div>
    </>
  );
}
