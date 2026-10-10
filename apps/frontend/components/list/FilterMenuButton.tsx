'use client';

import { useRef } from 'react';
import { Menu } from '@base-ui/react/menu';
import { Check, ChevronDown, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { FilterOptionLabel } from './FilterOptionLabel';

export interface FilterOption<T extends string> {
  value: T;
  label: string;
  /** Classe de fond de la pastille de 8px (même source que le tableau). */
  dotClassName?: string;
  /** Classes du badge, quand l'option s'affiche comme dans le tableau. */
  badgeClassName?: string;
  /** Nombre de résultats si l'option était choisie ; à 0, l'option est atténuée. */
  count?: number;
}

interface FilterMenuButtonProps<T extends string> {
  /** Nom du filtre, affiché avant la valeur choisie (« Statut »). */
  label: string;
  value: T;
  /** Valeur « Tous » : le filtre est inactif quand `value` vaut celle-ci. */
  allValue: T;
  options: FilterOption<T>[];
  onChange: (value: T) => void;
}

/** Filtre à choix unique d'une barre de liste : « Statut : ● À traiter ▾ ✕ » + menu. */
export function FilterMenuButton<T extends string>({
  label, value, allValue, options, onChange,
}: FilterMenuButtonProps<T>) {
  const t = useTranslations('ui.list');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];
  const isActive = value !== allValue;
  const clear = () => {
    onChange(allValue);
    triggerRef.current?.focus();
  };
  const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className={cn('inline-flex h-10 items-center rounded-full border transition-colors',
      isActive ? 'border-secondary-foreground/15 bg-secondary/60' : 'border-border bg-card')}>
      <Menu.Root>
        <Menu.Trigger ref={triggerRef} className={cn(
          'inline-flex h-full items-center gap-2 whitespace-nowrap rounded-full ps-3.5 pe-3 text-[0.8125rem] font-medium text-foreground transition-colors hover:bg-muted data-popup-open:bg-muted',
          isActive && 'pe-1.5 hover:bg-secondary data-popup-open:bg-secondary', ring,
        )}>
          <span className="text-muted-foreground">{t('filter_label', { name: label })}</span>
          {current && <span className="font-semibold"><FilterOptionLabel option={current} /></span>}
          <ChevronDown size={16} className="text-muted-foreground" aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="start" sideOffset={6} className="z-50 min-w-56">
            <Menu.Popup className="rounded-xl border border-border bg-card p-1 shadow-lg outline-none">
              <Menu.RadioGroup value={value} onValueChange={(v) => onChange(v as T)} aria-label={label}>
                {options.map((option) => (
                  <FilterMenuItem key={option.value} option={option} selected={option.value === value} />
                ))}
              </Menu.RadioGroup>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {isActive && (
        <button type="button" onClick={clear} aria-label={t('remove_filter', { name: label })}
          className={cn('me-1 grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground', ring)}>
          <X size={14} strokeWidth={2.25} aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Option du menu : libellé (pastille ou badge), nombre, coche de sélection. */
function FilterMenuItem({ option, selected }: { option: FilterOption<string>; selected: boolean }) {
  return (
    <Menu.RadioItem value={option.value} closeOnClick className={cn(
      'flex cursor-pointer items-center gap-3 rounded-lg py-2 ps-3 pe-2.5 text-sm text-foreground transition-colors data-highlighted:bg-muted',
      selected && 'font-semibold',
    )}>
      <span className={cn(option.count === 0 && 'opacity-50')}><FilterOptionLabel option={option} /></span>
      {option.count !== undefined && (
        <span className="ms-auto text-[0.8125rem] font-normal tabular-nums text-muted-foreground">{option.count}</span>
      )}
      <Menu.RadioItemIndicator keepMounted className={cn(
        'flex size-4 shrink-0 items-center justify-center text-primary data-unchecked:invisible',
        option.count === undefined && 'ms-auto',
      )}>
        <Check size={16} strokeWidth={2.25} aria-hidden />
      </Menu.RadioItemIndicator>
    </Menu.RadioItem>
  );
}
