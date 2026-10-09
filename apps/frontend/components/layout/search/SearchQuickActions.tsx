'use client';

import { useTranslations } from 'next-intl';
import { ClipboardPlus, UserPlus, Package, ShoppingBag, CreditCard } from 'lucide-react';
import { useCan } from '@/lib/hooks/useMe';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import { useNavBadges } from '@/lib/hooks/useNavBadges';

const ACTION_ROW = 'flex items-center gap-3 px-4 py-3.5 min-h-14 text-sm text-foreground bg-card hover:bg-muted active:bg-muted transition-colors border-t border-border first:border-t-0 cursor-pointer outline-none focus-visible:bg-muted';

interface QuickAction {
  id: string;
  icon: React.ReactNode;
  label: string;
  href: string;
}

interface SearchQuickActionsProps {
  activeId: string | null;
  idPrefix: string;
  onNavigate: (href: string) => void;
}

export function SearchQuickActions({ activeId, idPrefix, onNavigate }: SearchQuickActionsProps) {
  const t = useTranslations('layout.search');
  const kind = useCatalogKind();
  const canOrders = useCan('orders');
  const canCustomers = useCan('customers');
  const canProducts = useCan('products');
  const { data: badges } = useNavBadges();
  const toPrepareCt = badges?.orders_to_prepare ?? 0;

  const actions: QuickAction[] = [];
  if (canOrders) {
    actions.push({ id: 'new-order', icon: <ClipboardPlus size={16} />, label: t('qa_new_order'), href: '/orders/new' });
    actions.push({
      id: 'to-prepare',
      icon: <ShoppingBag size={16} />,
      label: toPrepareCt > 0 ? t('qa_to_prepare_count', { count: toPrepareCt }) : t('qa_to_prepare'),
      href: '/orders?status=to_prepare',
    });
    actions.push({ id: 'unpaid', icon: <CreditCard size={16} />, label: t('qa_unpaid'), href: '/orders?due=true' });
  }
  if (canCustomers) {
    actions.push({ id: 'new-customer', icon: <UserPlus size={16} />, label: t('qa_new_customer'), href: '/customers/new' });
  }
  if (canProducts) {
    actions.push({ id: 'new-product', icon: <Package size={16} />, label: t('qa_new_product', { kind }), href: `/products/new?type=${kind === 'services' ? 'service' : 'product'}` });
  }

  if (!actions.length) return null;

  return (
    <div>
      <p className="text-[0.8125rem] font-medium text-muted-foreground px-1 mb-2">{t('quick_actions')}</p>
      <div className="rounded-xl border border-border overflow-hidden">
        {actions.map((a, i) => (
          <div key={a.id} role="option" id={`${idPrefix}-${i}`} aria-selected={activeId === `${idPrefix}-${i}`}
            tabIndex={-1} onClick={() => onNavigate(a.href)}
            className={`${ACTION_ROW} ${activeId === `${idPrefix}-${i}` ? 'bg-muted' : ''}`}>
            <span className="text-muted-foreground">{a.icon}</span>
            {a.label}
          </div>
        ))}
      </div>
    </div>
  );
}
