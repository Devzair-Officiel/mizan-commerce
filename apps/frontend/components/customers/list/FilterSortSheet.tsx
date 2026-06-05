import { useEffect } from 'react';
import { ArrowDown10, ArrowDownAZ, Check, Clock, Search, X } from 'lucide-react';
import type { FilterKey, SortKey } from './types';

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

interface FilterSortSheetProps {
  open: boolean;
  onClose: () => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  filter: FilterKey;
  onFilter: (f: FilterKey) => void;
  search: string;
  onSearch: (s: string) => void;
}

export function FilterSortSheet({
  open, onClose, sort, onSort, filter, onFilter, search, onSearch,
}: FilterSortSheetProps) {
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
          <SearchField search={search} onSearch={onSearch} />
          <OptionsBlock
            title="Trier par"
            options={SORT_OPTIONS}
            selected={sort}
            onSelect={onSort}
          />
          <OptionsBlock
            title="Afficher"
            options={FILTER_OPTIONS}
            selected={filter}
            onSelect={onFilter}
          />

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

function SearchField({ search, onSearch }: { search: string; onSearch: (s: string) => void }) {
  return (
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
  );
}

interface OptionsBlockProps<T extends string> {
  title: string;
  options: { key: T; label: string; icon?: React.ReactNode }[];
  selected: T;
  onSelect: (k: T) => void;
}

function OptionsBlock<T extends string>({ title, options, selected, onSelect }: OptionsBlockProps<T>) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</p>
      <div className="flex flex-col gap-1">
        {options.map(({ key, label, icon }) => {
          const isSelected = selected === key;
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-left transition-colors ${
                isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted'
              }`}
            >
              {icon && <span className="shrink-0">{icon}</span>}
              <span className="flex-1">{label}</span>
              {isSelected && <Check size={16} className="shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
