'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { ProductResultRow, CustomerResultRow, OrderResultRow } from './SearchResultRow';
import type { SearchProduct, SearchCustomer, SearchOrder } from '@/lib/hooks/useSearch';


const SECTION_TITLE = 'text-[0.8125rem] font-medium text-muted-foreground px-1 mb-2';

interface ProductSectionProps {
  items: SearchProduct[]; total: number; query: string;
  activeId: string | null; idPrefix: string; onNavigate: (href: string) => void; kind: string;
}

export function ProductResultSection({ items, total, query, activeId, idPrefix, onNavigate, kind }: ProductSectionProps) {
  const t = useTranslations('layout.search');
  const router = useRouter();
  if (!items.length) return null;
  return (
    <section>
      <p className={SECTION_TITLE}>{t('section_products', { kind })}</p>
      <div className="rounded-xl border border-border overflow-hidden">
        {items.map((p, i) => (
          <ProductResultRow key={p.id} item={p} query={query}
            id={`${idPrefix}-${i}`} isActive={activeId === `${idPrefix}-${i}`}
            onClick={() => onNavigate(`/products/${p.id}`)} />
        ))}
      </div>
      {total > items.length && (
        <button onClick={() => router.push(`/products?search=${encodeURIComponent(query)}`)}
          className="mt-1.5 w-full text-center text-xs text-primary font-medium py-1.5 hover:underline">
          {t('see_more', { count: total })}
        </button>
      )}
    </section>
  );
}

interface CustomerSectionProps {
  items: SearchCustomer[]; total: number; query: string;
  activeId: string | null; idPrefix: string; onNavigate: (href: string) => void;
}

export function CustomerResultSection({ items, total, query, activeId, idPrefix, onNavigate }: CustomerSectionProps) {
  const t = useTranslations('layout.search');
  const router = useRouter();
  if (!items.length) return null;
  return (
    <section>
      <p className={SECTION_TITLE}>{t('section_customers')}</p>
      <div className="rounded-xl border border-border overflow-hidden">
        {items.map((c, i) => (
          <CustomerResultRow key={c.id} item={c} query={query}
            id={`${idPrefix}-${i}`} isActive={activeId === `${idPrefix}-${i}`}
            onClick={() => onNavigate(`/customers/${c.id}`)} />
        ))}
      </div>
      {total > items.length && (
        <button onClick={() => router.push(`/customers?search=${encodeURIComponent(query)}`)}
          className="mt-1.5 w-full text-center text-xs text-primary font-medium py-1.5 hover:underline">
          {t('see_more', { count: total })}
        </button>
      )}
    </section>
  );
}

interface OrderSectionProps {
  items: SearchOrder[]; total: number; query: string;
  activeId: string | null; idPrefix: string; onNavigate: (href: string) => void;
}

export function OrderResultSection({ items, total, query, activeId, idPrefix, onNavigate }: OrderSectionProps) {
  const t = useTranslations('layout.search');
  const router = useRouter();
  if (!items.length) return null;
  return (
    <section>
      <p className={SECTION_TITLE}>{t('section_orders')}</p>
      <div className="rounded-xl border border-border overflow-hidden">
        {items.map((o, i) => (
          <OrderResultRow key={o.id} item={o} query={query}
            id={`${idPrefix}-${i}`} isActive={activeId === `${idPrefix}-${i}`}
            onClick={() => onNavigate(`/orders/${o.id}`)} />
        ))}
      </div>
      {total > items.length && (
        <button onClick={() => router.push(`/orders?search=${encodeURIComponent(query)}`)}
          className="mt-1.5 w-full text-center text-xs text-primary font-medium py-1.5 hover:underline">
          {t('see_more', { count: total })}
        </button>
      )}
    </section>
  );
}
