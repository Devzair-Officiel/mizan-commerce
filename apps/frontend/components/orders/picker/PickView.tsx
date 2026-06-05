import { ChevronRight, Search, X, PackagePlus, FilePlus2 } from 'lucide-react';
import type { Product } from '@/lib/hooks/useProducts';

export type PickFilter = 'all' | 'product' | 'service';

interface PickViewProps {
  search: string;
  setSearch: (v: string) => void;
  filter: PickFilter;
  setFilter: (f: PickFilter) => void;
  products: Product[];
  onPick: (p: Product) => void;
  onCreate: () => void;
  onFreeLine: () => void;
}

const FILTERS: { value: PickFilter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'product', label: 'Produits' },
  { value: 'service', label: 'Services' },
];

export function PickView({
  search, setSearch, filter, setFilter, products, onPick, onCreate, onFreeLine,
}: PickViewProps) {
  return (
    <>
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher dans le catalogue…"
          className="w-full rounded-xl border border-border bg-muted py-2.5 pl-9 pr-9 text-sm outline-none focus:border-primary"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Effacer la recherche"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            <X size={13} />
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-3">
        {FILTERS.map((f) => {
          const active = f.value === filter;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              aria-pressed={active}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ease-out active:scale-[0.98] ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 mb-3">
        <button
          type="button"
          onClick={onCreate}
          className="flex items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-3 text-sm font-medium text-primary transition-colors active:bg-primary/10"
        >
          <span className="shrink-0 w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
            <PackagePlus size={16} />
          </span>
          <span className="text-left">Créer un article ou service</span>
        </button>
        <button
          type="button"
          onClick={onFreeLine}
          className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-3 py-3 text-sm transition-colors active:bg-muted"
        >
          <span className="shrink-0 w-9 h-9 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
            <FilePlus2 size={16} />
          </span>
          <span className="flex-1 min-w-0 flex flex-col gap-0.5 text-left">
            <span className="font-medium text-foreground">Article ou service ponctuel</span>
            <span className="text-xs text-muted-foreground">Sans enregistrer au catalogue</span>
          </span>
        </button>
      </div>

      <div className="flex flex-col divide-y divide-border -mx-5 px-5">
        {products.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {search || filter !== 'all' ? 'Aucun résultat.' : 'Aucun article enregistré.'}
          </p>
        ) : (
          products.map((p) => <ProductRow key={p.id} product={p} onPick={onPick} />)
        )}
      </div>
    </>
  );
}

function ProductRow({ product, onPick }: { product: Product; onPick: (p: Product) => void }) {
  const min = product.min_selling_price;
  const max = product.max_selling_price;
  const priceLabel = min && max
    ? (min === max ? `${min} €` : `${min} – ${max} €`)
    : '—';
  const variantCount = product.variant_count ?? 1;

  return (
    <button
      type="button"
      onClick={() => onPick(product)}
      className="flex items-center gap-3 px-1 py-3 text-left text-foreground transition-colors active:bg-muted"
    >
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium truncate">{product.name}</span>
          {product.type === 'service' && (
            <span className="shrink-0 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">
              Service
            </span>
          )}
          {variantCount > 1 && (
            <span className="shrink-0 rounded-full bg-primary/10 text-primary border border-primary/20 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">
              {variantCount} formats
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{priceLabel}</span>
      </div>
      <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
    </button>
  );
}
