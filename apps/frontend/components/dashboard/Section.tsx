import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  count: number;
  emptyIcon: React.ReactNode;
  emptyLabel: string;
  emptySub: string;
  accentClass: string;
  headerBg: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}

export function Section({
  icon, title, count, emptyIcon, emptyLabel, emptySub,
  accentClass, headerBg, defaultOpen, children,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors ${headerBg}`}
      >
        <span className={`flex items-center justify-center w-7 h-7 rounded-full border text-xs shrink-0 ${accentClass}`}>
          {icon}
        </span>
        <span className="flex-1 text-left text-sm font-semibold text-foreground">{title}</span>
        {count > 0 && (
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold shrink-0 ${accentClass}`}>
            {count}
          </span>
        )}
        <ChevronDown
          size={16}
          className={`text-muted-foreground shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-border">
          {count === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
                {emptyIcon}
              </span>
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-semibold text-foreground">{emptyLabel}</p>
                <p className="text-xs text-muted-foreground">{emptySub}</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {children}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
