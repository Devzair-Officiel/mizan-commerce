import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowDownAZ, Check, Clock, Eye, Layers, X,
} from 'lucide-react';
import type { ProductOrdering, ProductType } from '@/lib/hooks/useProducts';

export type TypeFilter = 'all' | ProductType;
export type Visibility = 'active' | 'inactive' | 'all';

const TYPE_KEYS: { key: TypeFilter; tKey: 'type_all' | 'type_products' | 'type_services' }[] = [
  { key: 'all',     tKey: 'type_all' },
  { key: 'product', tKey: 'type_products' },
  { key: 'service', tKey: 'type_services' },
];

const VISIBILITY_KEYS: { key: Visibility; tKey: 'show_active' | 'show_inactive' | 'show_all' }[] = [
  { key: 'active',   tKey: 'show_active' },
  { key: 'inactive', tKey: 'show_inactive' },
  { key: 'all',      tKey: 'show_all' },
];

const SORT_KEYS: { key: ProductOrdering; tKey: 'sort_name_asc' | 'sort_name_desc' | 'sort_recent'; icon: React.ReactNode }[] = [
  { key: 'name',        tKey: 'sort_name_asc',  icon: <ArrowDownAZ size={16} /> },
  { key: '-name',       tKey: 'sort_name_desc', icon: <ArrowDownAZ size={16} /> },
  { key: '-created_at', tKey: 'sort_recent',    icon: <Clock size={16} /> },
];

interface OptionsSheetProps {
  open: boolean;
  onClose: () => void;
  ordering: ProductOrdering;
  onOrderingChange: (v: ProductOrdering) => void;
  visibility: Visibility;
  onVisibilityChange: (v: Visibility) => void;
  typeFilter: TypeFilter;
  onTypeFilterChange: (v: TypeFilter) => void;
  showTypeFilter?: boolean;
}

export function OptionsSheet({
  open, onClose,
  ordering, onOrderingChange,
  visibility, onVisibilityChange,
  typeFilter, onTypeFilterChange,
  showTypeFilter = true,
}: OptionsSheetProps) {
  const t = useTranslations('articles.options');

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
        aria-label={t('title')}
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

        <div className="px-5 pb-6 pt-1 flex flex-col gap-5 max-h-[75vh] overflow-y-auto">
          {showTypeFilter && (
            <OptionGroup label={t('type')}>
              {TYPE_KEYS.map(({ key, tKey }) => (
                <OptionRow
                  key={key}
                  icon={<Layers size={16} className="shrink-0" />}
                  label={t(tKey)}
                  selected={typeFilter === key}
                  onClick={() => onTypeFilterChange(key)}
                />
              ))}
            </OptionGroup>
          )}

          <OptionGroup label={t('sort_by')}>
            {SORT_KEYS.map(({ key, tKey, icon }) => (
              <OptionRow
                key={key}
                icon={<span className="shrink-0">{icon}</span>}
                label={t(tKey)}
                selected={ordering === key}
                onClick={() => onOrderingChange(key)}
              />
            ))}
          </OptionGroup>

          <OptionGroup label={t('show')}>
            {VISIBILITY_KEYS.map(({ key, tKey }) => (
              <OptionRow
                key={key}
                icon={<Eye size={16} className="shrink-0" />}
                label={t(tKey)}
                selected={visibility === key}
                onClick={() => onVisibilityChange(key)}
              />
            ))}
          </OptionGroup>
        </div>
      </div>
    </>
  );
}

function OptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{label}</p>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function OptionRow({
  icon, label, selected, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-left transition-colors ${
        selected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted'
      }`}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {selected && <Check size={16} className="shrink-0" />}
    </button>
  );
}
