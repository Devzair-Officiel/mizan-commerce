'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, PackageX, ChevronRight, Plus, PackagePlus, ArrowDownAZ,
  SlidersHorizontal, Clock, Check, X, Search,
  Package, Sparkles, Eye, Layers,
} from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import {
  useProducts,
  useProductsSummary,
  formatPriceRange,
  type Product,
  type ProductOrdering,
  type ProductType,
} from '@/lib/hooks/useProducts';

type TypeFilter = 'all' | ProductType;
type StockFilter = 'all' | 'out_of_stock' | 'low_stock';
type Visibility = 'active' | 'inactive' | 'all';

const TYPE_OPTIONS: { key: TypeFilter; label: string }[] = [
  { key: 'all',     label: 'Produits + services' },
  { key: 'product', label: 'Produits uniquement' },
  { key: 'service', label: 'Services uniquement' },
];

const VISIBILITY_OPTIONS: { key: Visibility; label: string }[] = [
  { key: 'active',   label: 'Actifs uniquement' },
  { key: 'inactive', label: 'Inactifs uniquement' },
  { key: 'all',      label: 'Actifs + inactifs' },
];

const SORT_OPTIONS: { key: ProductOrdering; label: string; icon: React.ReactNode }[] = [
  { key: 'name',        label: 'Nom A → Z',    icon: <ArrowDownAZ size={16} /> },
  { key: '-name',       label: 'Nom Z → A',    icon: <ArrowDownAZ size={16} /> },
  { key: '-created_at', label: 'Plus récents', icon: <Clock size={16} /> },
];

export default function CatalogPage() {
  const router = useRouter();
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
      <TopBar title="Mes articles" titleClassName="text-3xl" />

      <div className="flex flex-col gap-4 p-4 lg:px-8 lg:py-6 pb-28">
        {/* Recherche persistante en évidence */}
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            inputMode="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un article…"
            className="w-full h-12 rounded-2xl border border-border bg-card pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Effacer la recherche"
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Stats cliquables = filtres stock */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="En rupture"
            value={summary?.out_of_stock ?? '—'}
            icon={<PackageX size={14} />}
            tone="red"
            active={stockFilter === 'out_of_stock'}
            onClick={() => setStockFilter((s) => (s === 'out_of_stock' ? 'all' : 'out_of_stock'))}
          />
          <StatCard
            label="Stock faible"
            value={summary?.low_stock ?? '—'}
            icon={<AlertTriangle size={14} />}
            tone="amber"
            active={stockFilter === 'low_stock'}
            onClick={() => setStockFilter((s) => (s === 'low_stock' ? 'all' : 'low_stock'))}
          />
        </div>

        {/* CTA Nouvel article + Options */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setAddOpen(true)}
            className="flex h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm active:scale-95 transition-transform"
          >
            <PackagePlus size={16} strokeWidth={2.2} />
            Nouvel article
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
            Options
          </button>
        </div>

        {/* Liste */}
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
              {items.length} article{items.length > 1 ? 's' : ''}
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

function StatCard({
  label, value, icon, tone, active, onClick,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tone: 'red' | 'amber';
  active: boolean;
  onClick: () => void;
}) {
  const iconWrap =
    tone === 'red'
      ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300'
      : 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300';
  const valueTone = active
    ? tone === 'red'
      ? 'text-red-600 dark:text-red-400'
      : 'text-amber-600 dark:text-amber-400'
    : 'text-foreground';

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
      <p className={`text-3xl font-bold tabular-nums ${valueTone}`}>{value}</p>
    </button>
  );
}

const THUMB_COLORS = [
  'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  'bg-primary/15 text-primary',
];

function thumbColor(name: string) {
  const code = name.charCodeAt(0) + (name.charCodeAt(1) || 0);
  return THUMB_COLORS[code % THUMB_COLORS.length];
}

function getInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
}

function ProductRow({ product, first }: { product: Product; first: boolean }) {
  const range = formatPriceRange(product.min_selling_price, product.max_selling_price);
  const priceLabel = range ?? '—';
  return (
    <Link
      href={`/products/${product.id}`}
      className={`flex items-center gap-3 px-3 py-3 active:bg-muted transition-colors ${
        first ? '' : 'border-t border-border'
      }`}
    >
      <ProductThumb product={product} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground capitalize truncate">{product.name}</span>
          {!product.is_active && (
            <span className="shrink-0 rounded-full bg-red-50 dark:bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
              Inactif
            </span>
          )}
        </div>
        <StockLine product={product} />
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <span className="text-sm font-semibold text-foreground tabular-nums">{priceLabel} €</span>
        <ChevronRight size={16} className="text-muted-foreground" />
      </div>
    </Link>
  );
}

function ProductThumb({ product }: { product: Product }) {
  const isService = product.type === 'service';

  if (product.primary_image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={product.primary_image}
        alt={product.name}
        className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-border"
      />
    );
  }

  if (isService) {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Sparkles size={18} />
      </div>
    );
  }

  return (
    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-bold ${thumbColor(product.name)}`}>
      {getInitial(product.name)}
    </div>
  );
}

function ProductListSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={`flex items-center gap-3 px-3 py-3 ${i === 0 ? '' : 'border-t border-border'}`}
        >
          <div className="h-11 w-11 shrink-0 rounded-xl bg-muted animate-pulse" />
          <div className="flex-1 flex flex-col gap-1.5">
            <div className="h-3.5 w-2/3 rounded bg-muted animate-pulse" />
            <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-3.5 w-14 rounded bg-muted animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  onAdd, searchTerm, onClearSearch,
}: {
  onAdd: () => void;
  searchTerm: string;
  onClearSearch: () => void;
}) {
  if (searchTerm) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card py-12 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Search size={26} />
        </div>
        <p className="text-base font-semibold text-foreground">Aucun résultat</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Rien ne correspond à <span className="font-medium text-foreground">« {searchTerm} »</span>.
        </p>
        <button
          onClick={onClearSearch}
          className="mt-1 flex h-10 items-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-medium text-foreground active:scale-95 transition-transform"
        >
          Effacer la recherche
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card py-12 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Package size={26} />
      </div>
      <p className="text-base font-semibold text-foreground">Aucun article</p>
      <p className="text-sm text-muted-foreground max-w-xs">
        Ajoute ton premier produit ou service pour commencer à gérer ton catalogue.
      </p>
      <button
        onClick={onAdd}
        className="mt-1 flex h-10 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm active:scale-95 transition-transform"
      >
        <Plus size={16} strokeWidth={2.4} />
        Nouvel article
      </button>
    </div>
  );
}

function StockLine({ product }: { product: Product }) {
  const variantCount = product.variant_count ?? 0;
  const formatsLabel = variantCount > 1
    ? `${variantCount} formats`
    : '1 format';

  if (product.type === 'service') {
    return <p className="text-xs text-muted-foreground mt-0.5">Service</p>;
  }
  if (product.is_out_of_stock) {
    return (
      <p className="text-xs font-medium text-red-600 dark:text-red-400 mt-0.5">
        Rupture
      </p>
    );
  }
  if (product.is_low_stock) {
    return (
      <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mt-0.5">
        Stock faible · <span className="tabular-nums">{formatsLabel}</span>
      </p>
    );
  }
  return (
    <p className="text-xs text-muted-foreground mt-0.5">
      <span className="tabular-nums">{formatsLabel}</span> en stock
    </p>
  );
}

function OptionsSheet({
  open, onClose,
  ordering, onOrderingChange,
  visibility, onVisibilityChange,
  typeFilter, onTypeFilterChange,
}: {
  open: boolean;
  onClose: () => void;
  ordering: ProductOrdering;
  onOrderingChange: (v: ProductOrdering) => void;
  visibility: Visibility;
  onVisibilityChange: (v: Visibility) => void;
  typeFilter: TypeFilter;
  onTypeFilterChange: (v: TypeFilter) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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
        aria-label="Options"
        className={`fixed inset-x-0 bottom-0 z-80 rounded-t-3xl bg-card shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto mt-3 mb-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <div className="flex items-center justify-between px-5 pb-2">
          <h2 className="text-lg font-semibold text-foreground">Options</h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-6 pt-1 flex flex-col gap-5 max-h-[75vh] overflow-y-auto">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Type</p>
            <div className="flex flex-col gap-1">
              {TYPE_OPTIONS.map(({ key, label }) => {
                const selected = typeFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => onTypeFilterChange(key)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-left transition-colors ${
                      selected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <Layers size={16} className="shrink-0" />
                    <span className="flex-1">{label}</span>
                    {selected && <Check size={16} className="shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Trier par</p>
            <div className="flex flex-col gap-1">
              {SORT_OPTIONS.map(({ key, label, icon }) => {
                const selected = ordering === key;
                return (
                  <button
                    key={key}
                    onClick={() => onOrderingChange(key)}
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

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Afficher</p>
            <div className="flex flex-col gap-1">
              {VISIBILITY_OPTIONS.map(({ key, label }) => {
                const selected = visibility === key;
                return (
                  <button
                    key={key}
                    onClick={() => onVisibilityChange(key)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-left transition-colors ${
                      selected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <Eye size={16} className="shrink-0" />
                    <span className="flex-1">{label}</span>
                    {selected && <Check size={16} className="shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function AddTypeSheet({
  open, onClose, onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (type: ProductType) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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
        aria-label="Ajouter un article"
        className={`fixed inset-x-0 bottom-0 z-80 rounded-t-3xl bg-card shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto mt-3 mb-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <div className="flex items-center justify-between px-5 pb-2">
          <h2 className="text-lg font-semibold text-foreground">Ajouter au catalogue</h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-8 pt-2 flex flex-col gap-3">
          <AddTypeCard
            icon={<Package size={20} />}
            title="Produit"
            subtitle="Article physique avec stock à suivre"
            onClick={() => onPick('product')}
          />
          <AddTypeCard
            icon={<Sparkles size={20} />}
            title="Service"
            subtitle="Prestation sans gestion de stock"
            onClick={() => onPick('service')}
          />
        </div>
      </div>
    </>
  );
}

function AddTypeCard({
  icon, title, subtitle, onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left active:scale-[0.98] transition-transform hover:bg-muted/40"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-base font-semibold text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </div>
      <ChevronRight size={18} className="text-muted-foreground shrink-0" />
    </button>
  );
}
