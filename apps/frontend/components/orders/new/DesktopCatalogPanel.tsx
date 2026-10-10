'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Search, X, Tag } from 'lucide-react';
import { useCatalogPicker } from '@/lib/hooks/useCatalogPicker';
import { useShop } from '@/lib/hooks/useShop';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { useScrollShadow } from '@/lib/hooks/useScrollShadow';
import { QuickAddProductForm } from '@/components/orders/new/QuickAddProductForm';
import { DesktopProductRow } from '@/components/orders/new/DesktopProductRow';
import { CatalogAddActions } from '@/components/orders/picker/CatalogAddActions';
import { FreeLineView } from '@/components/orders/picker/FreeLineView';
import type { NewSaleForm } from '@/lib/hooks/useNewSaleForm';
import type { ProductDetail } from '@/lib/hooks/useProducts';

type PanelMode = 'list' | 'create' | 'free';
type PickFilter = 'all' | 'product' | 'service';
type T = ReturnType<typeof useTranslations<'orders.picker'>>;

/**
 * Le panneau ne dépasse jamais la hauteur visible : son haut est à ~9,7rem sous la barre
 * du haut à l'ouverture, d'où 11rem retirés pour que son bas reste à l'écran ; seule la liste défile.
 */
const PANEL = 'rounded-2xl border border-border bg-card overflow-hidden flex flex-col max-h-[calc(100dvh-11rem)]';

const FILTER_KEYS = [
  { value: 'all' as PickFilter, key: 'filter_all' as const },
  { value: 'product' as PickFilter, key: 'filter_product' as const },
  { value: 'service' as PickFilter, key: 'filter_service' as const },
];

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
    <div className="relative">
      <Search size={16} className="absolute inset-s-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <input type="search" inputMode="search" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
        value={search} onChange={(e) => setSearch(e.target.value)} placeholder={placeholder}
        className="w-full h-11 rounded-full border border-border bg-background ps-10 pe-9 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary" />
      {search && (
        <button type="button" onClick={() => setSearch('')} aria-label={t('search_clear_aria')}
          className="absolute inset-e-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          <X size={13} />
        </button>
      )}
    </div>
  );
}

function DesktopEmptyCatalogPanel({ form, catalogKind, panelTitle, setMode, t }: {
  form: NewSaleForm; catalogKind: string; panelTitle: string;
  setMode: (m: PanelMode) => void;
  t: T;
}) {
  return (
    <div className={PANEL}>
      <div className="px-5 py-4 border-b border-border shrink-0">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">{panelTitle}</h2>
      </div>
      <div className="p-6 flex flex-col overflow-y-auto">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-secondary text-primary flex items-center justify-center shrink-0">
            <Tag size={18} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-base font-semibold text-foreground">{t('empty_catalog_title')}</span>
            <span className="text-sm text-muted-foreground">{t('empty_catalog_text', { kind: catalogKind })}</span>
          </div>
        </div>
        <div className="mt-5">
          <QuickAddProductForm
            onCreated={(p: ProductDetail) => { void form.addProductFromQuickAdd(p.id); }}
            onClose={() => {}}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-x-1.5 items-baseline text-[0.8125rem]">
          <span className="text-muted-foreground">{t('empty_catalog_free_question', { kind: catalogKind })}</span>
          <button type="button" onClick={() => setMode('free')}
            className="text-primary font-semibold hover:underline">
            {t('empty_catalog_free_link')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Liste du catalogue : seule partie qui défile, avec une ombre en bas tant qu'il reste du contenu. */
function DesktopCatalogList({ children }: { children: ReactNode }) {
  const { ref, hasMore } = useScrollShadow();
  return (
    <div className="relative flex-1 min-h-0 flex flex-col border-t border-border">
      <div ref={ref} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="divide-y divide-border">{children}</div>
      </div>
      {hasMore && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-linear-to-t from-black/8 to-transparent dark:from-black/40" />
      )}
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

  if (mode === 'create') {
    return (
      <div className={`${PANEL} p-5 overflow-y-auto`}>
        <QuickAddProductForm
          onCreated={(p: ProductDetail) => { void form.addProductFromQuickAdd(p.id); backToList(); }}
          onClose={backToList}
          onBack={backToList}
        />
      </div>
    );
  }
  if (mode === 'free') {
    return (
      <div className={PANEL}>
        <div className="px-5 py-3.5 border-b border-border shrink-0">
          <span className="text-[0.9375rem] font-semibold">{t('free_sheet_title')}</span>
        </div>
        <div className="px-5 py-4 overflow-y-auto">
          <FreeLineView onCancel={backToList} onSubmit={(line) => { form.addFreeLine(line); backToList(); }} />
        </div>
      </div>
    );
  }
  // Une recherche sans résultat n'est pas un catalogue vide : la recherche reste affichée.
  if (picker.products.length === 0 && !picker.search) {
    return <DesktopEmptyCatalogPanel form={form} catalogKind={catalogKind} panelTitle={panelTitle} setMode={setMode} t={t} />;
  }

  return (
    <div className={PANEL}>
      <div className="shrink-0">
        <DesktopCatalogHeader title={panelTitle} kind={catalogKind} filter={picker.filter}
          setFilter={(v) => { picker.setFilter(v); setExpandedId(null); }} t={t} />
        <div className="flex flex-col gap-3 px-5 pb-4">
          <DesktopCatalogSearch search={picker.search}
            setSearch={(v) => { picker.setSearch(v); setExpandedId(null); }}
            placeholder={t('desktop_search_placeholder', { kind: catalogKind })} t={t} />
          <CatalogAddActions onCreate={() => setMode('create')} onFreeLine={() => setMode('free')} />
        </div>
      </div>
      <DesktopCatalogList>
        {picker.filtered.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">{t('no_results')}</p>
        ) : (
          picker.filtered.map((p) => (
            <DesktopProductRow key={p.id} p={p} items={form.items} isExpanded={expandedId === p.id}
              onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
              onPick={form.addItem} money={money} showServiceBadge={catalogKind === 'both'} />
          ))
        )}
      </DesktopCatalogList>
    </div>
  );
}
