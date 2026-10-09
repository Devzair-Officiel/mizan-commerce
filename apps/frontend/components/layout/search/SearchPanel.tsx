'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCan } from '@/lib/hooks/useMe';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import { SearchQuickActions } from './SearchQuickActions';
import { ProductResultSection, CustomerResultSection, OrderResultSection } from './SearchResultSection';
import type { SearchResults } from '@/lib/hooks/useSearch';

interface SearchPanelProps {
  q: string;
  data: SearchResults | undefined;
  isFetching: boolean;
  activeId: string | null;
  listId: string;
  onNavigate: (href: string) => void;
}

function NoResultsBlock({ q, onNavigate }: { q: string; onNavigate: (href: string) => void }) {
  const t = useTranslations('layout.search');
  const canCustomers = useCan('customers');
  return (
    <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
      <p className="text-sm text-muted-foreground">{t('no_results', { query: q })}</p>
      {canCustomers && (
        <button onClick={() => onNavigate(`/customers/new?name=${encodeURIComponent(q)}`)}
          className="text-xs text-primary font-medium hover:underline">
          {t('create_customer', { name: q })}
        </button>
      )}
    </div>
  );
}

export function SearchPanel({ q, data, isFetching, activeId, listId, onNavigate }: SearchPanelProps) {
  const t = useTranslations('layout.search');
  const kind = useCatalogKind();
  const router = useRouter();

  const isShortQuery = q.trim().length < 2;
  const hasOrders = (data?.orders.items.length ?? 0) > 0;
  const hasCustomers = (data?.customers.items.length ?? 0) > 0;
  const hasProducts = (data?.products.items.length ?? 0) > 0;
  const hasAny = hasOrders || hasCustomers || hasProducts;
  const showEmpty = !isShortQuery && !isFetching && !hasAny;

  const navigate = (href: string) => { onNavigate(href); };

  return (
    <div role="listbox" id={listId} aria-label={t('title')} className="flex flex-col gap-4 p-4">
      {isShortQuery && (
        <SearchQuickActions activeId={activeId} idPrefix="qa" onNavigate={navigate} />
      )}
      {!isShortQuery && isFetching && !hasAny && (
        <p className="text-sm text-muted-foreground text-center py-8">{t('searching')}</p>
      )}
      {showEmpty && <NoResultsBlock q={q} onNavigate={navigate} />}
      {hasOrders && (
        <OrderResultSection items={data!.orders.items} total={data!.orders.total}
          query={q} activeId={activeId} idPrefix="ord" onNavigate={navigate} />
      )}
      {hasCustomers && (
        <CustomerResultSection items={data!.customers.items} total={data!.customers.total}
          query={q} activeId={activeId} idPrefix="cst" onNavigate={navigate} />
      )}
      {hasProducts && (
        <ProductResultSection items={data!.products.items} total={data!.products.total}
          query={q} activeId={activeId} idPrefix="prd" onNavigate={navigate} kind={kind} />
      )}
    </div>
  );
}
