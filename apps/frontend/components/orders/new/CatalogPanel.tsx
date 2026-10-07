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

export function CatalogPanel({ form }: CatalogPanelProps) {
  const t = useTranslations('orders.picker');
  const tNew = useTranslations('orders.new');
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';
  const formatMoney = useFormatMoney();
  const money = (v: number | string) => formatMoney(v, currency, { maximumFractionDigits: 2 });

  const picker = useCatalogPicker();
  const [mode, setMode] = useState<PanelMode>('list');

  function handleVariantPick(pick: Parameters<typeof form.addItem>[0]) {
    form.addItem(pick);
    setMode('list');
    picker.backToList();
  }

  function handleFreeLine(line: Parameters<typeof form.addFreeLine>[0]) {
    form.addFreeLine(line);
    setMode('list');
  }

  function handleProductCreated(product: ProductDetail) {
    void form.addProductFromQuickAdd(product.id);
    setMode('list');
  }

  function goCreate() {
    setMode('create');
  }

  function goFree() {
    setMode('free');
  }

  function backToList() {
    setMode('list');
    picker.backToList();
  }

  // Inline variants mode
  if (mode === 'variants' && picker.pickedProductId) {
    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col h-full">
        <div className="px-4 py-3 border-b border-border shrink-0">
          <span className="text-sm font-semibold text-foreground">{t('variant_sheet_title')}</span>
        </div>
        <div className="px-4 py-3 overflow-y-auto flex-1">
          <VariantView
            productId={picker.pickedProductId}
            onBack={backToList}
            onPick={handleVariantPick}
          />
        </div>
      </div>
    );
  }

  // Create mode
  if (mode === 'create') {
    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-border shrink-0">
          <span className="text-sm font-semibold text-foreground">{t('create_product')}</span>
        </div>
        <div className="px-4 py-4">
          <QuickAddProductForm onCreated={handleProductCreated} onClose={backToList} />
        </div>
      </div>
    );
  }

  // Free line mode
  if (mode === 'free') {
    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-border shrink-0">
          <span className="text-sm font-semibold text-foreground">{t('free_sheet_title')}</span>
        </div>
        <div className="px-4 py-4">
          <FreeLineView onCancel={backToList} onSubmit={handleFreeLine} />
        </div>
      </div>
    );
  }

  // Empty catalog with no search — show create form directly
  const isEmpty = picker.filtered.length === 0 && !picker.search && picker.filter === 'all';

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">{tNew('section_items').replace(/^\d+ · /, '')}</span>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 px-4 pt-3 pb-1 shrink-0">
        {FILTER_KEYS.map(({ value, key }) => {
          const active = picker.filter === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => picker.setFilter(value)}
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

      {/* Search */}
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
          value={picker.search}
          onChange={(e) => picker.setSearch(e.target.value)}
          placeholder={t('search_placeholder')}
          className="w-full rounded-xl border border-border bg-muted py-2.5 pl-9 pr-9 text-sm outline-none focus:border-primary"
        />
        {picker.search && (
          <button
            type="button"
            onClick={() => picker.setSearch('')}
            aria-label={t('search_clear_aria')}
            className="absolute right-7 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-y-auto divide-y divide-border px-4">
        {isEmpty ? (
          <div className="py-4 flex flex-col gap-4">
            <p className="text-sm text-center text-muted-foreground">{t('no_products')}</p>
            <QuickAddProductForm onCreated={handleProductCreated} onClose={() => {}} />
            <button
              type="button"
              onClick={goFree}
              className="text-xs text-primary hover:underline text-center"
            >
              {t('free_line_title')}
            </button>
          </div>
        ) : picker.filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('no_results')}</p>
        ) : (
          picker.filtered.map((p) => {
            const itemsForProduct = form.items.filter((i) =>
              // We match items that came from this product by product_name (best we can do without product_id on LineItem)
              i.product_name === p.name,
            );
            const totalQty = itemsForProduct.reduce((acc, i) => acc + i.quantity, 0);
            const hasVariants = (p.variant_count ?? 1) > 1;
            const min = p.min_selling_price;
            const max = p.max_selling_price;
            const priceLabel = min && max
              ? (min === max ? money(min) : `${money(min)} – ${money(max)}`)
              : '—';

            return (
              <div key={p.id} className="flex items-center gap-3 py-3">
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
                        {t('variant_formats', { count: p.variant_count })}
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
                    onClick={() => {
                      picker.handlePickProduct(p);
                      setMode('variants');
                    }}
                    className="shrink-0 w-8 h-8 rounded-full border border-border text-foreground flex items-center justify-center hover:bg-muted hover:border-primary hover:text-primary transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {!isEmpty && (
        <div className="px-4 py-3 border-t border-border shrink-0 flex flex-col gap-2">
          <button
            type="button"
            onClick={goCreate}
            className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <PackagePlus size={15} />
            {t('create_product')}
          </button>
          <button
            type="button"
            onClick={goFree}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors text-left"
          >
            {t('free_line_title')}
          </button>
        </div>
      )}
    </div>
  );
}
