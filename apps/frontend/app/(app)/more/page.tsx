'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import { useMe } from '@/lib/hooks/useMe';
import { passesGate, type Gate } from '@/lib/navigation';
import Link from 'next/link';

// Libellés sous `layout.nav.<clé>` ; les entrées Stock n'existent pas pour une boutique de services.
// Accès : mêmes règles que le menu (`gate`).
type MenuItem = {
  href: string;
  label: 'invoices' | 'stock_in' | 'stock_out' | 'reminders' | 'notes' | 'zakat' | 'settings';
  stock: boolean;
  gate?: Gate;
};

const MENU_ITEMS: readonly MenuItem[] = [
  { href: '/invoices', label: 'invoices', stock: false, gate: { kind: 'module', module: 'invoices' } },
  { href: '/stock/entree', label: 'stock_in', stock: true, gate: { kind: 'module', module: 'stock' } },
  { href: '/stock/sortie', label: 'stock_out', stock: true, gate: { kind: 'module', module: 'stock' } },
  { href: '/reminders', label: 'reminders', stock: false, gate: { kind: 'module', module: 'reminders' } },
  { href: '/notes', label: 'notes', stock: false },
  { href: '/zakat', label: 'zakat', stock: false, gate: { kind: 'admin' } },
  { href: '/settings', label: 'settings', stock: false, gate: { kind: 'admin' } },
];

export default function MorePage() {
  const t = useTranslations('layout');
  const router = useRouter();
  const kind = useCatalogKind();
  const membership = useMe().data?.membership ?? null;
  const items = MENU_ITEMS.filter((item) => (!item.stock || kind !== 'services') && passesGate(item.gate, membership));

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
