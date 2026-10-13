'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import Link from 'next/link';

// Libellés sous `layout.nav.<clé>` ; les entrées Stock n'existent pas pour une boutique de services.
const MENU_ITEMS = [
  { href: '/invoices', label: 'invoices', stock: false },
  { href: '/stock/entree', label: 'stock_in', stock: true },
  { href: '/stock/sortie', label: 'stock_out', stock: true },
  { href: '/reminders', label: 'reminders', stock: false },
  { href: '/notes', label: 'notes', stock: false },
  { href: '/zakat', label: 'zakat', stock: false },
  { href: '/settings', label: 'settings', stock: false },
] as const;

export default function MorePage() {
  const t = useTranslations('layout');
  const router = useRouter();
  const kind = useCatalogKind();
  const items = MENU_ITEMS.filter((item) => !item.stock || kind !== 'services');

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <>
      <TopBar title={t('nav.more')} />
      <div className="flex flex-col gap-4 p-4">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {items.map(({ href, label }, i) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center justify-between px-4 py-3.5 text-sm font-medium text-foreground hover:bg-muted ${
                i < items.length - 1 ? 'border-b border-border' : ''
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
