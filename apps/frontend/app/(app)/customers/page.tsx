'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowDownAZ, Clock, CreditCard, Users, ChevronRight,
  SlidersHorizontal, Search, X, Check, ArrowDown10, UserPlus,
} from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { useCustomers, type CustomerSummary } from '@/lib/hooks/useCustomers';

type SortKey = 'name_asc' | 'amount_desc' | 'recent';
type FilterKey = 'all' | 'active' | 'pending' | 'deactivated';

const SORT_OPTIONS: { key: SortKey; label: string; icon: React.ReactNode }[] = [
  { key: 'name_asc',    label: 'Nom A → Z',           icon: <ArrowDownAZ size={16} /> },
  { key: 'amount_desc', label: 'Montant décroissant', icon: <ArrowDown10 size={16} /> },
  { key: 'recent',      label: 'Dernière commande',   icon: <Clock size={16} /> },
];

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: 'all',         label: 'Tous les clients' },
  { key: 'active',      label: 'Clients actifs' },
  { key: 'pending',     label: 'Avec paiement en attente' },
  { key: 'deactivated', label: 'Désactivés' },
];

const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-rose-100 text-rose-700',
  'bg-primary/15 text-primary',
];

function getInitials(name: string): string {
  return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function avatarColor(name: string) {
  const code = name.charCodeAt(0) + (name.charCodeAt(1) || 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

export default function CustomersPage() {
  const { data, isLoading } = useCustomers(undefined, true);
  const [sort, setSort]     = useState<SortKey>('name_asc');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  const all = data?.results ?? [];

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
      <TopBar title="Clients" titleClassName="text-3xl" />
      <div className="flex flex-col gap-4 p-4 lg:px-8 lg:py-6 pb-28">

        {/* Stats — cartes cliquables agissant comme filtres */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Clients actifs"
            value={isLoading ? '—' : activeCount}
            icon={<Users size={14} />}
            active={filter === 'active'}
            onClick={() => setFilter((f) => (f === 'active' ? 'all' : 'active'))}
          />
          <StatCard
            label="Paiements en attente"
            value={isLoading ? '—' : `${totalPending.toFixed(2)} €`}
            icon={<CreditCard size={14} />}
            active={filter === 'pending'}
            tone={totalPending > 0 ? 'amber' : 'neutral'}
            onClick={() => setFilter((f) => (f === 'pending' ? 'all' : 'pending'))}
          />
        </div>

        {/* Compteur + actions */}
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? 'Chargement…'
              : filterActive
                ? `${visible.length} client${visible.length > 1 ? 's' : ''} affiché${visible.length > 1 ? 's' : ''} · filtré`
                : `${visible.length} client${visible.length > 1 ? 's' : ''} enregistré${visible.length > 1 ? 's' : ''}`}
          </p>
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/customers/new"
              className="flex h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm active:scale-95 transition-transform"
            >
              <UserPlus size={16} strokeWidth={2.2} />
              Nouveau client
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
              Filtrer / Trier
            </button>
          </div>
        </div>

        {/* Liste */}
        {!isLoading && visible.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Aucun client correspondant.</p>
        )}
        {!isLoading && visible.length > 0 && (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {visible.map((customer, i) => (
              <CustomerRow key={customer.id} customer={customer} first={i === 0} />
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

function StatCard({
  label, value, icon, active, tone = 'neutral', onClick,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  active: boolean;
  tone?: 'neutral' | 'amber';
  onClick: () => void;
}) {
  const valueTone =
    tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-foreground';
  const iconWrap =
    tone === 'amber'
      ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300'
      : 'bg-primary/10 text-primary';

  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-2xl border p-4 flex flex-col gap-2 text-left transition-colors active:scale-[0.98] ${
        active ? 'border-primary bg-primary/5' : 'border-border bg-card'
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className={`flex h-7 w-7 items-center justify-center rounded-xl ${iconWrap}`}>
          {icon}
        </div>
      </div>
      <p className={`text-3xl font-bold ${valueTone}`}>{value}</p>
    </button>
  );
}

function CustomerRow({ customer, first }: { customer: CustomerSummary; first: boolean }) {
  const pending = parseFloat(customer.pending_amount);
  const hasPending = pending > 0;
  const subtitle = customer.phone || 'Téléphone non renseigné';
  const city = customer.city?.trim();

  return (
    <Link
      href={`/customers/${customer.id}`}
      className={`flex items-center gap-3 px-4 py-3.5 active:bg-muted transition-colors ${
        first ? '' : 'border-t border-border'
      }`}
    >
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarColor(customer.name)}`}>
        {getInitials(customer.name)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground capitalize truncate">{customer.name}</span>
          {!customer.is_active && (
            <span className="shrink-0 rounded-full bg-red-50 dark:bg-red-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400">
              Désactivé
            </span>
          )}
        </div>
        <p className="text-sm text-foreground/70 mt-0.5 truncate">
          {subtitle}
          {city && <span className="text-muted-foreground"> · {city}</span>}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {hasPending && (
          <div className="flex flex-col items-end leading-tight">
            <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
              {pending.toFixed(2)} €
            </span>
            <span className="text-[11px] font-medium text-amber-600/80 dark:text-amber-400/80">à régler</span>
          </div>
        )}
        <ChevronRight size={16} className="text-muted-foreground" />
      </div>
    </Link>
  );
}

function FilterSortSheet({
  open, onClose,
  sort, onSort,
  filter, onFilter,
  search, onSearch,
}: {
  open: boolean;
  onClose: () => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  filter: FilterKey;
  onFilter: (f: FilterKey) => void;
  search: string;
  onSearch: (s: string) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function reset() {
    onSort('name_asc');
    onFilter('all');
    onSearch('');
  }

  const dirty = sort !== 'name_asc' || filter !== 'all' || search.trim() !== '';

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-70 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filtrer et trier"
        className={`fixed inset-x-0 bottom-0 z-80 rounded-t-3xl bg-card shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto mt-3 mb-2 h-1 w-10 rounded-full bg-muted-foreground/30" />

        <div className="flex items-center justify-between px-5 pb-2">
          <h2 className="text-lg font-semibold text-foreground">Filtrer / Trier</h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-6 pt-2 flex flex-col gap-5 max-h-[75vh] overflow-y-auto">
          {/* Recherche locale */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Recherche locale</p>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Rechercher un client, téléphone, ville…"
                className="w-full h-11 rounded-xl border border-border bg-background pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
              {search && (
                <button
                  onClick={() => onSearch('')}
                  aria-label="Effacer"
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Trier */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Trier par</p>
            <div className="flex flex-col gap-1">
              {SORT_OPTIONS.map(({ key, label, icon }) => {
                const selected = sort === key;
                return (
                  <button
                    key={key}
                    onClick={() => onSort(key)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-left transition-colors ${
                      selected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="shrink-0">{icon}</span>
                    <span className="flex-1">{label}</span>
                    {selected && <Check size={16} className="shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filtrer */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Afficher</p>
            <div className="flex flex-col gap-1">
              {FILTER_OPTIONS.map(({ key, label }) => {
                const selected = filter === key;
                return (
                  <button
                    key={key}
                    onClick={() => onFilter(key)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-left transition-colors ${
                      selected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="flex-1">{label}</span>
                    {selected && <Check size={16} className="shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={reset}
              disabled={!dirty}
              className="flex-1 h-11 rounded-xl border border-border text-sm font-medium text-foreground disabled:opacity-40 active:scale-[0.98] transition-transform"
            >
              Réinitialiser
            </button>
            <button
              onClick={onClose}
              className="flex-1 h-11 rounded-xl bg-primary text-sm font-medium text-primary-foreground active:scale-[0.98] transition-transform"
            >
              Voir les résultats
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
