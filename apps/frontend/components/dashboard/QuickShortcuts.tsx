import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Plus, ShoppingBag, Package, Users } from 'lucide-react';

const SHORTCUTS = [
  { href: '/orders/new', icon: Plus,        tKey: 'new_order'  as const },
  { href: '/orders',     icon: ShoppingBag, tKey: 'orders'     as const },
  { href: '/products',   icon: Package,     tKey: 'articles'   as const },
  { href: '/customers',  icon: Users,       tKey: 'customers'  as const },
];

export function QuickShortcuts() {
  const t = useTranslations('dashboard.shortcuts');
  return (
    <div className="grid grid-cols-2 gap-3">
      {SHORTCUTS.map(({ href, icon: Icon, tKey }) => (
        <Link
          key={href}
          href={href}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:bg-muted transition-colors active:scale-[0.98]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon size={18} />
          </div>
          <span className="text-sm font-semibold text-foreground">{t(tKey)}</span>
        </Link>
      ))}
    </div>
  );
}
