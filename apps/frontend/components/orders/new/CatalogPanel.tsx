'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Check, Search, X, PackagePlus } from 'lucide-react';
import { useCatalogPicker } from '@/lib/hooks/useCatalogPicker';
import { useShop } from '@/lib/hooks/useShop';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { VariantView } from '@/components/orders/picker/VariantView';
import { FreeLineView } from '@/components/orders/picker/FreeLineView';
import { QuickAddProductForm } from '@/components/orders/new/QuickAddProductForm';
import type { NewSaleForm } from '@/lib/hooks/useNewSaleForm';
import type { ProductDetail } from '@/lib/hooks/useProducts';

interface CatalogPanelProps {
  form: NewSaleForm;
}

type PanelMode = 'list' | 'variants' | 'create' | 'free';

const FILTER_KEYS = [
  { value: 'all' as const, key: 'filter_all' as const },
  { value: 'product' as const, key: 'filter_product' as const },
  { value: 'service' as const, key: 'filter_service' as const },
];

function CatalogPanelHeader({ label }: { label: string }) {
  return (
    <div className="px-4 py-3 border-b border-border shrink-0 flex items-center justify-between gap-3">
      <span className="text-sm font-semibold text-foreground">{label}</span>
    </div>
  );
}

function CatalogFilterChips({
  filter,
  setFilter,
  t,
}: {
  filter: 'all' | 'product' | 'service';
  setFilter: (v: 'all' | 'product' | 'service') => void;
  t: ReturnType<typeof useTranslations<'orders.picker'>>;
}) {
  return (
    <div className="flex gap-2 px-4 pt-3 pb-1 shrink-0">
      {FILTER_KEYS.map(({ value, key }) => {
        const active = filter === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={active}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ease-out ${
              active
                ? 'bg-secondary text-secondary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {t(key)}
          </button>
        );
      })}
    </div>
  );
}

function CatalogSearch({
  search,
  setSearch,
  t,
}: {
  search: string;
  setSearch: (v: string) => void;
  t: ReturnType<typeof useTranslations<'orders.picker'>>;
}) {
  return (
    <div className="relative px-4 py-2 shrink-0">
      <Search size={15} className="absolute left-7 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        name="catalog-panel-search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('search_placeholder')}
        className="w-full rounded-xl border border-border bg-muted py-2.5 pl-9 pr-9 text-sm outline-none focus:border-primary"
      />
      {search && (
        <button
          type="button"
          onClick={() => setSearch('')}
          aria-label={t('search_clear_aria')}
          className="absolute right-7 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

function CatalogFooter({
  onCreate,
  onFree,
  t,
}: {
  onCreate: () => void;
  onFree: () => void;
  t: ReturnType<typeof useTranslations<'orders.picker'>>;
}) {
  return (
    <div className="px-4 py-3 border-t border-border shrink-0 flex flex-col gap-2">
      <button
        type="button"
        onClick={onCreate}
        className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
      >
        <PackagePlus size={15} />
        {t('create_product')}
      </button>
      <button
        type="button"
        onClick={onFree}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors text-left"
      >
        {t('free_line_title')}
      </button>
    </div>
  );
}

interface ProductRowProps {
  p: {
    id: string;
    name: string;
    type: string;
    variant_count?: number;
    min_selling_price?: number | string | null;
    max_selling_price?: number | string | null;
  };
  formItems: { product_name?: string; quantity: number }[];
  onAdd: () => void;
  money: (v: number | string) => string;
  t: ReturnType<typeof useTranslations<'orders.picker'>>;
}

function ProductRow({ p, formItems, onAdd, money, t }: ProductRowProps) {
  const totalQty = formItems
    .filter((i) => i.product_name === p.name)
    .reduce((acc, i) => acc + i.quantity, 0);
  const hasVariants = (p.variant_count ?? 1) > 1;
  const min = p.min_selling_price;
  const max = p.max_selling_price;
  const priceLabel = min && max
    ? (min === max ? money(min) : `${money(min)} – ${money(max)}`)
    : '—';

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
          {p.type === 'service' && (
            <span className="shrink-0 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">
              {t('service_badge')}
            </span>
          )}
          {hasVariants && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {t('variant_formats', { count: p.variant_count ?? 0 })}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{priceLabel}</span>
      </div>
      {totalQty > 0 ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs font-semibold text-primary tabular-nums">×{totalQty}</span>
          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <Check size={14} />
          </div>
        </div>
      ) : (
        <button
          type="button"
          aria-label={t('add_aria', { name: p.name })}
          onClick={onAdd}
          className="shrink-0 w-8 h-8 rounded-full border border-border text-foreground flex items-center justify-center hover:bg-muted hover:border-primary hover:text-primary transition-colors"
        >
          <Plus size={14} />
        </button>
      )}
    </div>
  );
}

function CatalogPanelVariantMode({ picker, form, onBack }: {
  picker: ReturnType<typeof useCatalogPicker>;
  form: NewSaleForm;
  onBack: () => void;
}) {
  const t = useTranslations('orders.picker');
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border shrink-0">
        <span className="text-sm font-semibold text-foreground">{t('variant_sheet_title')}</span>
      </div>
      <div className="px-4 py-3 overflow-y-auto flex-1">
        <VariantView
          productId={picker.pickedProductId!}
          onBack={onBack}
          onPick={(pick) => { form.addItem(pick); onBack(); }}
        />
      </div>
    </div>
  );
}

export function CatalogPanel({ form }: CatalogPanelProps) {
  const t = useTranslations('orders.picker');
  const tNew = useTranslations('orders.new');
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';
  const formatMoney = useFormatMoney();
  const money = (v: number | string) => formatMoney(v, currency, { maximumFractionDigits: 2 });

  const picker = useCatalogPicker();
  const [mode, setMode] = useState<PanelMode>('list');
  const backToList = () => { setMode('list'); picker.backToList(); };

  if (mode === 'variants' && picker.pickedProductId) {
    return <CatalogPanelVariantMode picker={picker} form={form} onBack={backToList} />;
  }

  if (mode === 'create') {
    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
        <CatalogPanelHeader label={t('create_product')} />
        <div className="px-4 py-4">
          <QuickAddProductForm
            onCreated={(product: ProductDetail) => { void form.addProductFromQuickAdd(product.id); setMode('list'); }}
            onClose={backToList}
          />
        </div>
      </div>
    );
  }

  if (mode === 'free') {
    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
        <CatalogPanelHeader label={t('free_sheet_title')} />
        <div className="px-4 py-4">
          <FreeLineView onCancel={backToList} onSubmit={(line) => { form.addFreeLine(line); setMode('list'); }} />
        </div>
      </div>
    );
  }

  const isEmpty = picker.filtered.length === 0 && !picker.search && picker.filter === 'all';
  const onCreated = (product: ProductDetail) => { void form.addProductFromQuickAdd(product.id); setMode('list'); };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
      <CatalogPanelHeader label={tNew('section_items').replace(/^\d+ · /, '')} />
      <CatalogFilterChips filter={picker.filter} setFilter={picker.setFilter} t={t} />
      <CatalogSearch search={picker.search} setSearch={picker.setSearch} t={t} />
      <div className="flex-1 overflow-y-auto divide-y divide-border px-4">
        {isEmpty ? (
          <div className="py-4 flex flex-col gap-4">
            <p className="text-sm text-center text-muted-foreground">{t('no_products')}</p>
            <QuickAddProductForm onCreated={onCreated} onClose={() => {}} />
            <button type="button" onClick={() => setMode('free')} className="text-xs text-primary hover:underline text-center">
              {t('free_line_title')}
            </button>
          </div>
        ) : picker.filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('no_results')}</p>
        ) : (
          picker.filtered.map((p) => (
            <ProductRow
              key={p.id} p={p} formItems={form.items}
              onAdd={() => { picker.handlePickProduct(p); setMode('variants'); }}
              money={money} t={t}
            />
          ))
        )}
      </div>
      {!isEmpty && <CatalogFooter onCreate={() => setMode('create')} onFree={() => setMode('free')} t={t} />}
    </div>
  );
}
