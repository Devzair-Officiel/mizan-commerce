'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle, PackageX, PackagePlus, Plus, SlidersHorizontal, Search, X,
} from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { useShop } from '@/lib/hooks/useShop';
import {
  useProducts,
  useProductsSummary,
  type ProductOrdering,
  type ProductType,
} from '@/lib/hooks/useProducts';
import { StatCard } from '@/components/products/list/StatCard';
import { ProductRow } from '@/components/products/list/ProductRow';
import { ProductListSkeleton } from '@/components/products/list/ProductListSkeleton';
import { EmptyState } from '@/components/products/list/EmptyState';
import { OptionsSheet, type TypeFilter, type Visibility } from '@/components/products/list/OptionsSheet';
import { AddTypeSheet } from '@/components/products/list/AddTypeSheet';

type StockFilter = 'all' | 'out_of_stock' | 'low_stock';

function CatalogContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('articles');
  const { data: shop } = useShop();
  const catalogKind = shop?.catalog_kind ?? 'both';
  const forcedType: ProductType | null =
    catalogKind === 'products' ? 'product' : catalogKind === 'services' ? 'service' : null;
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [visibility, setVisibility] = useState<Visibility>('active');
  const [ordering, setOrdering] = useState<ProductOrdering>('name');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: summary } = useProductsSummary();
  const { data, isLoading } = useProducts({
    search: debouncedSearch || undefined,
    type: typeFilter === 'all' ? undefined : typeFilter,
    outOfStock: stockFilter === 'out_of_stock',
    lowStock: stockFilter === 'low_stock',
    inactive: visibility === 'inactive',
    all: visibility === 'all',
    ordering,
  });

  const items = data?.results ?? [];
  const filterActive =
    ordering !== 'name'
    || visibility !== 'active'
    || typeFilter !== 'all'
    || stockFilter !== 'all';

  function pickType(type: ProductType) {
    setAddOpen(false);
    router.push(`/products/new?type=${type}`);
  }

  function handleAdd() {
    if (forcedType) {
      router.push(`/products/new?type=${forcedType}`);
      return;
    }
    setAddOpen(true);
  }

  const hasData = items.length > 0 || isLoading || filterActive;

  return (
    <>
      <TopBar
        title={t('topbar.title', { kind: catalogKind })}
        titleClassName="text-3xl"
        subtitle={items.length > 0 ? t('list.count', { count: items.length, kind: catalogKind }) : undefined}
        hideSearch
        action={
          <button
            onClick={handleAdd}
            className="hidden lg:flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Plus size={15} strokeWidth={2.4} />
            {t('list.new_product', { kind: catalogKind })}
          </button>
        }
      />

      <div className="flex flex-col gap-4 p-4 pb-28">
        {/* Desktop filter bar */}
        {hasData && (
          <div className="hidden lg:flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                inputMode="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('list.search_placeholder', { kind: catalogKind })}
                className="h-11 w-80 rounded-full border border-border bg-card pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  aria-label={t('list.clear_search')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            {catalogKind === 'both' && (
              <div className="flex gap-1">
                {(['all', 'product', 'service'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setTypeFilter(v as TypeFilter)}
                    aria-pressed={typeFilter === v}
                    className={`rounded-full px-4 h-9 text-sm font-medium transition-colors ${
                      typeFilter === v
                        ? 'bg-secondary text-secondary-foreground'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {v === 'all' ? t('list.filter_all') : v === 'product' ? t('list.filter_product') : t('list.filter_service')}
                  </button>
                ))}
              </div>
            )}
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
              className="h-9 rounded-full border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="active">{t('list.visibility_active')}</option>
              <option value="inactive">{t('list.visibility_inactive')}</option>
              <option value="all">{t('list.visibility_all')}</option>
            </select>
          </div>
        )}

        {/* Mobile search */}
        {hasData && (
          <div className="relative lg:hidden">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              inputMode="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('list.search_placeholder', { kind: catalogKind })}
              className="w-full h-12 rounded-2xl border border-border bg-card pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label={t('list.clear_search')}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {/* Stat cards — hidden for services */}
        {catalogKind !== 'services' && hasData && (
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label={t('stats.out_of_stock')}
              value={summary?.out_of_stock ?? '—'}
              icon={<PackageX size={14} />}
              tone="red"
              active={stockFilter === 'out_of_stock'}
              onClick={() => setStockFilter((s) => (s === 'out_of_stock' ? 'all' : 'out_of_stock'))}
            />
            <StatCard
              label={t('stats.low_stock')}
              value={summary?.low_stock ?? '—'}
              icon={<AlertTriangle size={14} />}
              tone="amber"
              active={stockFilter === 'low_stock'}
              onClick={() => setStockFilter((s) => (s === 'low_stock' ? 'all' : 'low_stock'))}
            />
          </div>
        )}

        {/* Mobile: add + options */}
        {hasData && (
          <div className="flex lg:hidden items-center justify-between gap-2">
            <button
              onClick={handleAdd}
              className="flex h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm active:scale-95 transition-transform"
            >
              <PackagePlus size={16} strokeWidth={2.2} />
              {t('list.new_product', { kind: catalogKind })}
            </button>
            <button
              onClick={() => setOptionsOpen(true)}
              className={`flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-medium transition-colors active:scale-95 ${
                filterActive
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-card text-foreground'
              }`}
            >
              <SlidersHorizontal size={16} />
              {t('list.options')}
            </button>
          </div>
        )}

        {isLoading && <ProductListSkeleton />}
        {!isLoading && items.length === 0 && (
          <EmptyState
            onAdd={handleAdd}
            searchTerm={debouncedSearch}
            onClearSearch={() => setSearch('')}
          />
        )}
        {!isLoading && items.length > 0 && (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {items.map((p, i) => (
              <ProductRow key={p.id} product={p} first={i === 0} />
            ))}
          </div>
        )}
      </div>

      <OptionsSheet
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        ordering={ordering}
        onOrderingChange={setOrdering}
        visibility={visibility}
        onVisibilityChange={setVisibility}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        showTypeFilter={!forcedType}
      />

      <AddTypeSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onPick={pickType}
      />
    </>
  );
}

export default function CatalogPage() {
  return (
    <Suspense>
      <CatalogContent />
    </Suspense>
  );
}
