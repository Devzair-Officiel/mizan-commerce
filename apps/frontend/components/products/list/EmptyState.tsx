import { useTranslations } from 'next-intl';
import { Package, Plus, Search } from 'lucide-react';

interface EmptyStateProps {
  onAdd: () => void;
  searchTerm: string;
  onClearSearch: () => void;
}

export function EmptyState({ onAdd, searchTerm, onClearSearch }: EmptyStateProps) {
  const t = useTranslations('articles.empty');

  if (searchTerm) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card py-12 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Search size={26} />
        </div>
        <p className="text-base font-semibold text-foreground">{t('no_results_title')}</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          {t('no_results_message', { term: searchTerm })}
        </p>
        <button
          onClick={onClearSearch}
          className="mt-1 flex h-10 items-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-medium text-foreground active:scale-95 transition-transform"
        >
          {t('clear_search')}
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card py-12 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Package size={26} />
      </div>
      <p className="text-base font-semibold text-foreground">{t('title')}</p>
      <p className="text-sm text-muted-foreground max-w-xs">
        {t('message')}
      </p>
      <button
        onClick={onAdd}
        className="mt-1 flex h-10 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm active:scale-95 transition-transform"
      >
        <Plus size={16} strokeWidth={2.4} />
        {t('new_product')}
      </button>
    </div>
  );
}
