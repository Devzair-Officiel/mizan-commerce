'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Check, Search, X } from 'lucide-react';
import { useCatalogPicker } from '@/lib/hooks/useCatalogPicker';
import { useShop } from '@/lib/hooks/useShop';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { useProduct } from '@/lib/hooks/useProducts';
import { QuickAddProductForm } from '@/components/orders/new/QuickAddProductForm';
import { FreeLineView } from '@/components/orders/picker/FreeLineView';
import type { NewSaleForm } from '@/lib/hooks/useNewSaleForm';
import type { Product, ProductDetail } from '@/lib/hooks/useProducts';
import type { VariantPick } from '@/components/orders/picker/VariantView';

type PanelMode = 'list' | 'create' | 'free';
type PickFilter = 'all' | 'product' | 'service';
type T = ReturnType<typeof useTranslations<'orders.picker'>>;

const FILTER_KEYS = [
  { value: 'all' as PickFilter, key: 'filter_all' as const },
  { value: 'product' as PickFilter, key: 'filter_product' as const },
  { value: 'service' as PickFilter, key: 'filter_service' as const },
];

function DesktopAddButton({ name, qty, onClick, t }: { name: string; qty: number; onClick: () => void; t: T }) {
  if (qty > 0) {
    return (
      <button type="button" onClick={onClick}
        className="shrink-0 w-16 h-9 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center gap-1 text-xs font-semibold">
        <Check size={13} strokeWidth={2.5} />{qty}
      </button>
    );
  }
  return (
    <button type="button" aria-label={t('add_aria', { name })} onClick={onClick}
      className="shrink-0 w-16 h-9 rounded-full border border-border text-primary flex items-center justify-center hover:bg-primary/5 transition-colors">
      <Plus size={18} strokeWidth={2} />
    </button>
  );
}

function DesktopProductSubtext({ p, t }: { p: Product; t: T }) {
  if (p.type === 'service') return null;
  if (p.variant_count > 1) {
    return (
      <p className="text-[0.8125rem] text-muted-foreground mt-0.5">
        {t('variant_formats', { count: p.variant_count })}
        {p.is_out_of_stock && <> · <span className="text-destructive">{t('out_of_stock')}</span></>}
      </p>
    );
  }
  if (p.is_out_of_stock) return <p className="text-[0.8125rem] text-destructive mt-0.5">{t('out_of_stock')}</p>;
  return null;
}

function DesktopInlineVariants({ productId, formItems, onPick, money, t }: {
  productId: string; formItems: NewSaleForm['items'];
  onPick: (pick: VariantPick) => void; money: (v: number | string) => string; t: T;
}) {
  const { data: product, isLoading } = useProduct(productId);
  if (isLoading || !product) return <p className="px-5 py-3 text-xs text-muted-foreground">{t('loading')}</p>;
  const active = product.variants.filter((v) => v.is_active);
  return (
    <div className="divide-y divide-border/60 bg-muted/30">
      {active.map((v) => {
        const out = product.type === 'product' && parseFloat(v.stock_quantity) <= 0;
        const qtyInCart = formItems.filter((i) => i.variant === v.id).reduce((a, c) => a + c.quantity, 0);
        const pick: VariantPick = { variantId: v.id, productName: product.name, variantName: v.packaging_name, productType: product.type, unitPrice: v.selling_price };
        return (
          <div key={v.id} className="flex items-center gap-3 px-5 py-2.5">
            <div className="flex-1 min-w-0">
              <span className="text-sm text-foreground">{v.packaging_name}</span>
              <span className={`ms-2 text-[0.8125rem] tabular-nums ${out ? 'text-destructive' : 'text-muted-foreground'}`}>
                {money(v.selling_price)}
                {product.type === 'product' && (
                  <> · {out ? t('out_of_stock') : t('stock_label', { qty: v.stock_quantity })}</>
                )}
              </span>
            </div>
            <DesktopAddButton name={`${product.name} – ${v.packaging_name}`} qty={qtyInCart} onClick={() => onPick(pick)} t={t} />
          </div>
        );
      })}
    </div>
  );
}

function DesktopProductRow({ p, formItems, expandedId, setExpandedId, onPick, money, t, catalogKind }: {
  p: Product; formItems: NewSaleForm['items']; expandedId: string | null;
  setExpandedId: (id: string | null) => void; onPick: (pick: VariantPick) => void;
  money: (v: number | string) => string; t: T; catalogKind: string;
}) {
  const totalQty = formItems.filter((i) => i.product_name === p.name).reduce((a, c) => a + c.quantity, 0);
  const priceLabel = p.min_selling_price
    ? (p.min_selling_price === p.max_selling_price
        ? money(p.min_selling_price)
        : `${money(p.min_selling_price)} – ${money(p.max_selling_price!)}`)
    : '—';
  const isExpanded = expandedId === p.id;
  return (
    <div>
      <div className="flex items-center gap-3 px-5 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground truncate">{p.name}</span>
            {p.type === 'service' && catalogKind === 'both' && (
              <span className="shrink-0 h-5 px-2 rounded-full bg-muted text-muted-foreground text-[11px] font-medium flex items-center">
                {t('service_badge')}
              </span>
            )}
          </div>
          <DesktopProductSubtext p={p} t={t} />
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{priceLabel}</span>
        <DesktopAddButton name={p.name} qty={totalQty}
          onClick={() => setExpandedId(isExpanded ? null : p.id)} t={t} />
      </div>
      {isExpanded && <DesktopInlineVariants productId={p.id} formItems={formItems} onPick={onPick} money={money} t={t} />}
    </div>
  );
}

function DesktopCatalogHeader({ title, kind, filter, setFilter, t }: {
  title: string; kind: string; filter: PickFilter; setFilter: (v: PickFilter) => void; t: T;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
      <h2 className="text-[0.9375rem] font-semibold text-foreground">{title}</h2>
      {kind === 'both' && (
        <div role="group" className="flex gap-1.5">
          {FILTER_KEYS.map(({ value, key }) => (
            <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value}
              className={`h-8 rounded-xl px-3 text-[0.8125rem] transition-colors ${
                filter === value
                  ? 'bg-secondary text-secondary-foreground font-semibold'
                  : 'border border-border bg-card text-foreground hover:bg-muted font-medium'
              }`}>
              {t(key)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DesktopCatalogSearch({ search, setSearch, placeholder, t }: {
  search: string; setSearch: (v: string) => void; placeholder: string; t: T;
}) {
  return (
    <div className="px-5 pb-4">
      <div className="relative">
        <Search size={16} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input type="search" inputMode="search" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          value={search} onChange={(e) => setSearch(e.target.value)} placeholder={placeholder}
          className="w-full h-11 rounded-full border border-border bg-background ps-10 pe-9 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary" />
        {search && (
          <button type="button" onClick={() => setSearch('')} aria-label={t('search_clear_aria')}
            className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function DesktopCatalogFooter({ createLabel, freeLabel, onCreate, onFree }: {
  createLabel: string; freeLabel: string; onCreate: () => void; onFree: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-5 py-3.5 border-t border-border">
      <button type="button" onClick={onCreate}
        className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-border bg-card text-sm font-semibold text-foreground hover:bg-muted transition-colors">
        <Plus size={15} className="text-primary" />{createLabel}
      </button>
      <button type="button" onClick={onFree}
        className="text-[0.8125rem] text-muted-foreground hover:text-foreground transition-colors px-1">
        {freeLabel}
      </button>
    </div>
  );
}

export function DesktopCatalogPanel({ form }: { form: NewSaleForm }) {
  const t = useTranslations('orders.picker');
  const { data: shop } = useShop();
  const catalogKind = shop?.catalog_kind ?? 'both';
  const currency = shop?.currency ?? 'EUR';
  const formatMoney = useFormatMoney();
  const money = (v: number | string) => formatMoney(v, currency, { maximumFractionDigits: 2 });
  const picker = useCatalogPicker();
  const [mode, setMode] = useState<PanelMode>('list');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const backToList = () => { setMode('list'); picker.backToList(); };

  const panelTitle = t('panel_items', { kind: catalogKind });
  const createLabel = t('panel_create', { kind: catalogKind });

  if (mode === 'create') {
    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <span className="text-[0.9375rem] font-semibold">{createLabel}</span>
        </div>
        <div className="px-5 py-4">
          <QuickAddProductForm onCreated={(p: ProductDetail) => { void form.addProductFromQuickAdd(p.id); backToList(); }} onClose={backToList} />
        </div>
      </div>
    );
  }
  if (mode === 'free') {
    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <span className="text-[0.9375rem] font-semibold">{t('free_sheet_title')}</span>
        </div>
        <div className="px-5 py-4">
          <FreeLineView onCancel={backToList} onSubmit={(line) => { form.addFreeLine(line); backToList(); }} />
        </div>
      </div>
    );
  }

  const isEmpty = picker.filtered.length === 0 && !picker.search && picker.filter === 'all';

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <DesktopCatalogHeader title={panelTitle} kind={catalogKind} filter={picker.filter}
        setFilter={(v) => { picker.setFilter(v); setExpandedId(null); }} t={t} />
      <DesktopCatalogSearch search={picker.search}
        setSearch={(v) => { picker.setSearch(v); setExpandedId(null); }}
        placeholder={t('desktop_search_placeholder', { kind: catalogKind })} t={t} />
      <div className="border-t border-border divide-y divide-border">
        {isEmpty ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t('no_products', { kind: catalogKind })}</p>
        ) : picker.filtered.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">{t('no_results')}</p>
        ) : (
          picker.filtered.map((p) => (
            <DesktopProductRow key={p.id} p={p} formItems={form.items} expandedId={expandedId}
              setExpandedId={setExpandedId} onPick={form.addItem} money={money} t={t} catalogKind={catalogKind} />
          ))
        )}
      </div>
      {!isEmpty && (
        <DesktopCatalogFooter
          createLabel={createLabel}
          freeLabel={t('free_line_desktop', { kind: catalogKind })}
          onCreate={() => setMode('create')}
          onFree={() => setMode('free')}
        />
      )}
    </div>
  );
}
