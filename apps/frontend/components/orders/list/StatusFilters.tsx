'use client';

import { useTranslations } from 'next-intl';
import { STATUSES, type StatusFilterKey } from './constants';

interface StatusFiltersProps {
  value: string;
  onChange: (value: StatusFilterKey) => void;
}

export function StatusFilters({ value, onChange }: StatusFiltersProps) {
  const t = useTranslations('orders.statusFilter');
  return (
    <div className="-mx-4 lg:-mx-8 px-4 lg:px-8 overflow-x-auto no-scrollbar">
      <div className="flex gap-2 pr-4">
        {STATUSES.map(({ value: optionValue, labelKey, dot, activeClass }) => {
          const isActive = value === optionValue;
          return (
            <button
              key={optionValue}
              onClick={() => onChange(optionValue)}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors active:scale-95 ${
                isActive ? activeClass : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {!isActive && dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
              {t(labelKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
