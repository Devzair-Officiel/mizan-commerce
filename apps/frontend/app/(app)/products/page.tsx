'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle, PackageX, PackagePlus, SlidersHorizontal, Search, X,
} from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
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

export default function CatalogPage() {
  const router = useRouter();
  const t = useTranslations('articles');
  const [search, setSearch] = useState('');
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

  return (
    <>
      <TopBar title={t('topbar.title')} titleClassName="text-3xl" />

      <div className="flex flex-col gap-4 p-4 lg:px-8 lg:py-6 pb-28">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            inputMode="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('list.search_placeholder')}
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

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setAddOpen(true)}
            className="flex h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm active:scale-95 transition-transform"
          >
            <PackagePlus size={16} strokeWidth={2.2} />
            {t('list.new_product')}
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

        {isLoading && <ProductListSkeleton />}
        {!isLoading && items.length === 0 && (
          <EmptyState
            onAdd={() => setAddOpen(true)}
            searchTerm={debouncedSearch}
            onClearSearch={() => setSearch('')}
          />
        )}
        {!isLoading && items.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground self-end -mb-1 tabular-nums">
              {t('list.count', { count: items.length })}
            </p>
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              {items.map((p, i) => (
                <ProductRow key={p.id} product={p} first={i === 0} />
              ))}
            </div>
          </>
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
      />

      <AddTypeSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onPick={pickType}
      />
    </>
  );
}
