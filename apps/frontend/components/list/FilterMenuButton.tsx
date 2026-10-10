'use client';

import { Menu } from '@base-ui/react/menu';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

interface FilterMenuButtonProps<T extends string> {
  /** Nom du filtre, affiché avant la valeur choisie (« Statut »). */
  label: string;
  value: T;
  options: FilterOption<T>[];
  onChange: (value: T) => void;
}

/** Filtre à choix unique d'une barre de liste : « Statut  Tous ▾ » + menu. */
export function FilterMenuButton<T extends string>({ label, value, options, onChange }: FilterMenuButtonProps<T>) {
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <Menu.Root>
      <Menu.Trigger className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card ps-3.5 pe-3 text-[0.8125rem] font-medium text-foreground transition-colors hover:bg-muted data-popup-open:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{current?.label}</span>
        <ChevronDown size={16} className="text-muted-foreground" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="start" sideOffset={6} className="z-50 min-w-48">
          <Menu.Popup className="rounded-xl border border-border bg-card p-1 shadow-lg outline-none">
            <Menu.RadioGroup value={value} onValueChange={(v) => onChange(v as T)} aria-label={label}>
              {options.map((option) => (
                <Menu.RadioItem
                  key={option.value}
                  value={option.value}
                  closeOnClick
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors data-highlighted:bg-muted',
                    option.value === value && 'font-semibold',
                  )}
                >
                  <Menu.RadioItemIndicator keepMounted className="flex size-4 shrink-0 items-center justify-center">
                    {option.value === value && <span className="size-1.5 rounded-full bg-primary" />}
                  </Menu.RadioItemIndicator>
                  {option.label}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
