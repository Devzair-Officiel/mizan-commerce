import { STATUSES } from './constants';

interface StatusFiltersProps {
  value: string;
  onChange: (value: string) => void;
}

export function StatusFilters({ value, onChange }: StatusFiltersProps) {
  return (
    <div className="-mx-4 lg:-mx-8 px-4 lg:px-8 overflow-x-auto no-scrollbar">
      <div className="flex gap-2 pr-4">
        {STATUSES.map(({ value: optionValue, label, dot, activeClass }) => {
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
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
