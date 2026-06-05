'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CreditCard, Users, SlidersHorizontal, UserPlus } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { useCustomers } from '@/lib/hooks/useCustomers';
import { useShop } from '@/lib/hooks/useShop';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { StatCard } from '@/components/customers/list/StatCard';
import { CustomerRow } from '@/components/customers/list/CustomerRow';
import { FilterSortSheet } from '@/components/customers/list/FilterSortSheet';
import type { FilterKey, SortKey } from '@/components/customers/list/types';

export default function CustomersPage() {
  const t = useTranslations('customers.list');
  const { data, isLoading } = useCustomers(undefined, true);
  const { data: shop } = useShop();
  const formatMoney = useFormatMoney();
  const currency = shop?.currency ?? 'EUR';
  const [sort, setSort]     = useState<SortKey>('name_asc');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  const all = useMemo(() => data?.results ?? [], [data]);

  const totalPending = useMemo(
    () => all.reduce((s, c) => s + parseFloat(c.pending_amount ?? '0'), 0),
    [all],
  );
  const activeCount = useMemo(() => all.filter((c) => c.is_active).length, [all]);

  const visible = useMemo(() => {
    let list = all;
    if (filter === 'active')      list = list.filter((c) => c.is_active);
    if (filter === 'pending')     list = list.filter((c) => parseFloat(c.pending_amount) > 0);
    if (filter === 'deactivated') list = list.filter((c) => !c.is_active);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) =>
        c.name.toLowerCase().includes(q)
        || (c.phone ?? '').toLowerCase().includes(q)
        || (c.city ?? '').toLowerCase().includes(q),
      );
    }

    const sorted = [...list];
    if (sort === 'name_asc')    sorted.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    if (sort === 'amount_desc') sorted.sort((a, b) => parseFloat(b.pending_amount) - parseFloat(a.pending_amount));
    if (sort === 'recent')      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return sorted;
  }, [all, filter, search, sort]);

  const filterActive = filter !== 'all' || search.trim() !== '' || sort !== 'name_asc';

  return (
    <>
      <TopBar title={t('title')} titleClassName="text-3xl" />
      <div className="flex flex-col gap-4 p-4 lg:px-8 lg:py-6 pb-28">

        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label={t('active_count')}
            value={isLoading ? '—' : activeCount}
            icon={<Users size={14} />}
            active={filter === 'active'}
            onClick={() => setFilter((f) => (f === 'active' ? 'all' : 'active'))}
          />
          <StatCard
            label={t('pending_total')}
            value={isLoading ? '—' : formatMoney(totalPending, currency, { maximumFractionDigits: 2 })}
            icon={<CreditCard size={14} />}
            active={filter === 'pending'}
            tone={totalPending > 0 ? 'amber' : 'neutral'}
            onClick={() => setFilter((f) => (f === 'pending' ? 'all' : 'pending'))}
          />
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? t('loading')
              : filterActive
                ? t('count_filtered', { count: visible.length })
                : t('count_registered', { count: visible.length })}
          </p>
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/customers/new"
              className="flex h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm active:scale-95 transition-transform"
            >
              <UserPlus size={16} strokeWidth={2.2} />
              {t('new_cta')}
            </Link>
            <button
              onClick={() => setSheetOpen(true)}
              className={`flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-medium transition-colors active:scale-95 ${
                filterActive
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-card text-foreground'
              }`}
            >
              <SlidersHorizontal size={16} />
              {t('filter_sort')}
            </button>
          </div>
        </div>

        {!isLoading && visible.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">{t('empty_filtered')}</p>
        )}
        {!isLoading && visible.length > 0 && (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {visible.map((customer, i) => (
              <CustomerRow key={customer.id} customer={customer} first={i === 0} currency={currency} />
            ))}
          </div>
        )}
      </div>

      <FilterSortSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        sort={sort}
        onSort={setSort}
        filter={filter}
        onFilter={setFilter}
        search={search}
        onSearch={setSearch}
      />
    </>
  );
}
