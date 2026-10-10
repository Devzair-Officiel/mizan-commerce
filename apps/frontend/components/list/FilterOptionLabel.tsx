import { cn } from '@/lib/utils';
import type { FilterOption } from './FilterMenuButton';

/**
 * Libellé d'une option de filtre, dans le menu comme sur le bouton :
 * en badge si la page fournit `badgeClassName`, sinon précédé d'une
 * pastille si elle fournit `dotClassName`, sinon en texte simple.
 */
export function FilterOptionLabel({ option }: { option: FilterOption<string> }) {
  if (option.badgeClassName) {
    return (
      <span className={cn('inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold', option.badgeClassName)}>
        {option.label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      {option.dotClassName && <span aria-hidden className={cn('size-2 shrink-0 rounded-full', option.dotClassName)} />}
      {option.label}
    </span>
  );
}
