'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  UserPlus, ArrowDownAZ, ArrowUpAZ, Clock, CreditCard,
  UserX, Users, ChevronRight,
} from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { useCustomers } from '@/lib/hooks/useCustomers';

function getInitials(name: string): string {
  return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

type SortKey = 'name_asc' | 'name_desc' | 'recent' | 'pending';

const SORT_OPTIONS: { key: SortKey; label: string; icon: React.ReactNode }[] = [
  { key: 'name_asc',  label: 'Nom A → Z',      icon: <ArrowDownAZ size={15} /> },
  { key: 'name_desc', label: 'Nom Z → A',       icon: <ArrowUpAZ size={15} /> },
  { key: 'recent',    label: 'Plus récents',     icon: <Clock size={15} /> },
  { key: 'pending',   label: 'Solde en attente', icon: <CreditCard size={15} /> },
];

const AVATAR_COLORS = [
  'bg-violet-100 text-violet-600',
  'bg-sky-100 text-sky-600',
  'bg-amber-100 text-amber-600',
  'bg-emerald-100 text-emerald-600',
  'bg-rose-100 text-rose-600',
  'bg-primary/15 text-primary',
];

function avatarColor(name: string) {
  const code = name.charCodeAt(0) + (name.charCodeAt(1) || 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

export default function CustomersPage() {
  const [showInactive, setShowInactive] = useState(false);
  const { data, isLoading } = useCustomers(undefined, showInactive);
  const [sort, setSort] = useState<SortKey>('name_asc');
  const [showSort, setShowSort] = useState(false);

  const sorted = [...(data?.results ?? [])].sort((a, b) => {
    if (sort === 'name_asc')  return a.name.localeCompare(b.name, 'fr');
    if (sort === 'name_desc') return b.name.localeCompare(a.name, 'fr');
    if (sort === 'recent')    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (sort === 'pending')   return parseFloat(b.pending_amount) - parseFloat(a.pending_amount);
    return 0;
  });

  const totalPending = (data?.results ?? []).reduce(
    (sum, c) => sum + parseFloat(c.pending_amount ?? '0'),
    0,
  );

  const currentSort = SORT_OPTIONS.find(o => o.key === sort)!;

  return (
    <>
      <TopBar title="Clients" titleClassName="text-3xl" />
      <div className="flex flex-col gap-4 p-4">

        {/* Actions */}
        <div className="flex items-center gap-4">
          <Link href="/customers/new">
            <button className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground active:scale-95 transition-transform">
              <UserPlus size={26} />
            </button>
          </Link>
          <button
            onClick={() => setShowInactive(v => !v)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-2xl h-14 font-semibold text-sm transition-all active:scale-95 ${
              showInactive
                ? 'bg-red-500 text-white'
                : 'bg-primary/15 text-primary'
            }`}
          >
            {showInactive ? <UserX size={18} /> : <Users size={18} />}
            {showInactive ? 'Désactivés' : 'Actifs'}
          </button>
          <div className="relative shrink-0">
            <button
              onClick={() => setShowSort(v => !v)}
              className="flex h-14 items-center gap-1.5 rounded-2xl border border-border bg-card px-4 text-xs font-medium text-foreground active:scale-95 transition-transform"
            >
                {currentSort.icon}
                {currentSort.label}
              </button>
              {showSort && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowSort(false)} />
                  <div className="absolute right-0 top-9 z-50 w-48 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                    {SORT_OPTIONS.map(({ key, label, icon }) => (
                      <button
                        key={key}
                        onClick={() => { setSort(key); setShowSort(false); }}
                        className={`flex w-full items-center gap-2.5 px-4 py-3 text-sm transition-colors ${
                          sort === key ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted'
                        }`}
                      >
                        {icon}
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{showInactive ? 'Tous les clients' : 'Clients actifs'}</p>
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10">
                <Users size={14} className="text-primary" />
              </div>
            </div>
            <p className="text-3xl font-bold text-foreground">{isLoading ? '—' : (data?.count ?? 0)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Total en attente</p>
              <div className={`flex h-7 w-7 items-center justify-center rounded-xl ${totalPending > 0 ? 'bg-red-100' : 'bg-primary/10'}`}>
                <CreditCard size={14} className={totalPending > 0 ? 'text-red-500' : 'text-primary'} />
              </div>
            </div>
            <p className={`text-3xl font-bold ${totalPending > 0 ? 'text-red-500' : 'text-foreground'}`}>
              {isLoading ? '—' : `${totalPending.toFixed(2)} €`}
            </p>
          </div>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground text-center py-8">Chargement…</p>}
        {!isLoading && sorted.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Aucun client.</p>
        )}

        {/* Liste */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {sorted.map((customer, i) => (
            <Link
              key={customer.id}
              href={`/customers/${customer.id}`}
              className={`flex items-center gap-3 px-4 py-3.5 active:bg-muted transition-colors ${
                i > 0 ? 'border-t border-border' : ''
              }`}
            >
              {/* Avatar */}
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarColor(customer.name)}`}>
                {getInitials(customer.name)}
              </div>

              {/* Infos */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground capitalize truncate">{customer.name}</span>
                  {!customer.is_active && (
                    <span className="shrink-0 rounded-full bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-500">Désactivé</span>
                  )}
                </div>
                {(customer.phone || customer.city) && (
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">
                    {[customer.phone, customer.city].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>

              {/* Montant en attente + chevron */}
              <div className="flex items-center gap-2 shrink-0">
                {parseFloat(customer.pending_amount) > 0 && (
                  <span className="rounded-full bg-red-50 px-2.5 py-1 text-sm font-semibold text-red-500">
                    {parseFloat(customer.pending_amount).toFixed(2)} €
                  </span>
                )}
                <ChevronRight size={16} className="text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>

      </div>
    </>
  );
}
