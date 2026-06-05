'use client';

import { useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDown10, ArrowDownAZ, Check, Clock, Search, X } from 'lucide-react';
import type { FilterKey, SortKey } from './types';

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
  const t = useTranslations('customers.filterSheet');

  const sortOptions = useMemo<{ key: SortKey; label: string; icon: React.ReactNode }[]>(
    () => [
      { key: 'name_asc',    label: t('sort_name_asc'),    icon: <ArrowDownAZ size={16} /> },
      { key: 'amount_desc', label: t('sort_amount_desc'), icon: <ArrowDown10 size={16} /> },
      { key: 'recent',      label: t('sort_recent'),      icon: <Clock size={16} /> },
    ],
    [t],
  );

  const filterOptions = useMemo<{ key: FilterKey; label: string }[]>(
    () => [
      { key: 'all',         label: t('filter_all') },
      { key: 'active',      label: t('filter_active') },
      { key: 'pending',     label: t('filter_pending') },
      { key: 'deactivated', label: t('filter_deactivated') },
    ],
    [t],
  );

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
        aria-label={t('aria_label')}
        className={`fixed inset-x-0 bottom-0 z-80 rounded-t-3xl bg-card shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto mt-3 mb-2 h-1 w-10 rounded-full bg-muted-foreground/30" />

        <div className="flex items-center justify-between px-5 pb-2">
          <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
          <button
            onClick={onClose}
            aria-label={t('close')}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-6 pt-2 flex flex-col gap-5 max-h-[75vh] overflow-y-auto">
          <SearchField
            search={search}
            onSearch={onSearch}
            label={t('search_label')}
            placeholder={t('search_placeholder')}
            clearAria={t('search_clear')}
          />
          <OptionsBlock
            title={t('sort_title')}
            options={sortOptions}
            selected={sort}
            onSelect={onSort}
          />
          <OptionsBlock
            title={t('filter_title')}
            options={filterOptions}
            selected={filter}
            onSelect={onFilter}
          />

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={reset}
              disabled={!dirty}
              className="flex-1 h-11 rounded-xl border border-border text-sm font-medium text-foreground disabled:opacity-40 active:scale-[0.98] transition-transform"
            >
              {t('reset')}
            </button>
            <button
              onClick={onClose}
              className="flex-1 h-11 rounded-xl bg-primary text-sm font-medium text-primary-foreground active:scale-[0.98] transition-transform"
            >
              {t('apply')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function SearchField({
  search, onSearch, label, placeholder, clearAria,
}: {
  search: string;
  onSearch: (s: string) => void;
  label: string;
  placeholder: string;
  clearAria: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{label}</p>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          className="w-full h-11 rounded-xl border border-border bg-background pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
        />
        {search && (
          <button
            onClick={() => onSearch('')}
            aria-label={clearAria}
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
