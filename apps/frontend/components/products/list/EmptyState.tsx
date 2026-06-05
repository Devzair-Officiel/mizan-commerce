import { Package, Plus, Search } from 'lucide-react';

interface EmptyStateProps {
  onAdd: () => void;
  searchTerm: string;
  onClearSearch: () => void;
}

export function EmptyState({ onAdd, searchTerm, onClearSearch }: EmptyStateProps) {
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
