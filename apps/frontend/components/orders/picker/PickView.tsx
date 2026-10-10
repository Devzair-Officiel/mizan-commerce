'use client';

import { useTranslations } from 'next-intl';
import { Search, X, Loader2 } from 'lucide-react';
import { useShop } from '@/lib/hooks/useShop';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import type { Product } from '@/lib/hooks/useProducts';
import { CatalogAddActions } from './CatalogAddActions';

export type PickFilter = 'all' | 'product' | 'service';
/** Message affiché sous un article après un ajout refusé : rupture de stock ou erreur réseau. */
export type PickFeedback = { productId: string; kind: 'out_of_stock' | 'error' };

interface PickViewProps {
  search: string;
  setSearch: (v: string) => void;
  filter: PickFilter;
  setFilter: (f: PickFilter) => void;
  products: Product[];
  onPick: (p: Product) => void;
  onCreate: () => void;
  onFreeLine: () => void;
  loadingProductId?: string | null;
  feedback?: PickFeedback | null;
}

const FILTER_KEYS: { value: PickFilter; key: 'filter_all' | 'filter_product' | 'filter_service' }[] = [
  { value: 'all', key: 'filter_all' },
  { value: 'product', key: 'filter_product' },
  { value: 'service', key: 'filter_service' },
];

export function PickView({
  search, setSearch, filter, setFilter, products, onPick, onCreate, onFreeLine,
  loadingProductId, feedback,
}: PickViewProps) {
  const t = useTranslations('orders.picker');
  const kind = useCatalogKind();
  return (
    <>
      <div className="relative mb-3">
        <Search size={15} className="absolute inset-s-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          name="catalog-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('search_placeholder')}
          className="w-full rounded-xl border border-border bg-muted py-2.5 ps-9 pe-9 text-sm outline-none focus:border-primary"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label={t('search_clear_aria')}
            className="absolute inset-e-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            <X size={13} />
          </button>
        )}
      </div>

      <div className="mb-3">
        <CatalogAddActions onCreate={onCreate} onFreeLine={onFreeLine} />
      </div>

      <div className="flex gap-2 mb-3">
        {FILTER_KEYS.map((f) => {
          const active = f.value === filter;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              aria-pressed={active}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ease-out active:scale-[0.98] ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {t(f.key)}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col divide-y divide-border -mx-5 px-5">
        {products.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {search || filter !== 'all' ? t('no_results') : t('no_products', { kind })}
          </p>
        ) : (
          products.map((p) => (
            <ProductRow key={p.id} product={p} onPick={onPick}
              isLoading={loadingProductId === p.id}
              feedback={feedback?.productId === p.id ? feedback.kind : null} />
          ))
        )}
      </div>
    </>
  );
}

function ProductRow({ product, onPick, isLoading, feedback }: {
  product: Product; onPick: (p: Product) => void;
  isLoading?: boolean; feedback: PickFeedback['kind'] | null;
}) {
  const t = useTranslations('orders.picker');
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';
  const formatMoney = useFormatMoney();
  const money = (v: number | string) => formatMoney(v, currency, { maximumFractionDigits: 2 });

  const min = product.min_selling_price;
  const max = product.max_selling_price;
  const priceLabel = min && max
    ? (min === max ? money(min) : `${money(min)} – ${money(max)}`)
    : '—';
  const variantCount = product.variant_count ?? 1;

  return (
    <div>
      <button
        type="button"
        onClick={() => onPick(product)}
        disabled={isLoading}
        aria-label={t('add_aria', { name: product.name })}
        className="flex items-center gap-3 px-1 min-h-16 py-2 text-left text-foreground transition-colors active:bg-muted w-full disabled:opacity-60"
      >
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-medium truncate">{product.name}</span>
            {product.type === 'service' && (
              <span className="shrink-0 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">
                {t('service_badge')}
              </span>
            )}
            {variantCount > 1 && (
              <span className="shrink-0 rounded-full bg-primary/10 text-primary border border-primary/20 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">
                {t('variant_formats', { count: variantCount })}
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{priceLabel}</span>
        </div>
        <div className="shrink-0 h-10 w-16 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-xl font-bold">
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : '+'}
        </div>
      </button>
      {feedback && (
        <p role="alert" className="px-1 pb-2 text-xs text-destructive">
          {t(feedback === 'error' ? 'add_error' : 'out_of_stock_pick')}
        </p>
      )}
    </div>
  );
}
