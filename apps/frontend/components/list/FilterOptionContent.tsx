import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FilterOption } from './FilterMenuButton';
import { FilterOptionLabel } from './FilterOptionLabel';

/**
 * Contenu d'une option de filtre, identique dans le menu desktop et dans la
 * fenêtre mobile : libellé (pastille ou badge), nombre, coche de sélection.
 */
export function FilterOptionContent({ option, selected }: { option: FilterOption<string>; selected: boolean }) {
  return (
    <>
      <span className={cn(option.count === 0 && 'opacity-50')}><FilterOptionLabel option={option} /></span>
      {option.count !== undefined && (
        <span className="ms-auto text-[0.8125rem] font-normal tabular-nums text-muted-foreground">{option.count}</span>
      )}
      <Check size={16} strokeWidth={2.25} aria-hidden className={cn(
        'shrink-0 text-primary',
        !selected && 'invisible',
        option.count === undefined && 'ms-auto',
      )} />
    </>
  );
}
