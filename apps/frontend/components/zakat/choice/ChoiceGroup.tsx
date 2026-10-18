'use client';

import { useRef, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { CHOICE_OPTIONS, type ChoiceName, type ChoiceOption } from '@/lib/hooks/useZakat';
import { cn } from '@/lib/utils';
import { arrowStep } from './arrowStep';
import { ChoiceCard } from './ChoiceCard';
import { CHOICE_CHIPS } from './choiceCatalog';

export interface OptionExtras {
  amount?: string;
  trailing?: string;
  effect?: string;
}

interface ChoiceGroupProps<C extends ChoiceName> {
  name: C;
  value: ChoiceOption<C> | null;
  onChange: (value: ChoiceOption<C>) => void;
  /** Montants et effet propres à chaque option, déjà mis en forme. */
  extras?: Partial<Record<ChoiceOption<C>, OptionExtras>>;
  columns?: 1 | 2;
  /** Nom accessible du groupe : la question posée. */
  label: string;
}

/**
 * Groupe `radiogroup` d'un choix d'avis : options dans l'ordre fixe du référentiel, rien de coché
 * d'avance. Tab entre dans le groupe, les flèches changent d'option (comme des boutons radio).
 */
export function ChoiceGroup<C extends ChoiceName>({ name, value, onChange, extras, columns = 2, label }: ChoiceGroupProps<C>) {
  const t = useTranslations('zakat');
  const options = CHOICE_OPTIONS[name] as readonly ChoiceOption<C>[];
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const chips = CHOICE_CHIPS[name] as Record<ChoiceOption<C>, readonly string[]>;
  const focusIndex = value === null ? 0 : options.indexOf(value);
  // Clé typée `string` : next-intl ne résout pas une clé construite sur le type générique du choix.
  const keyOf = (option: string, part: 'title' | 'text'): string => `choice.${name}.${option}.${part}`;

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = arrowStep(event);
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    const option = options[next];
    if (option === undefined) return;
    refs.current[next]?.focus();
    onChange(option);
  }

  return (
    <div role="radiogroup" aria-label={label} className={cn('grid gap-2.5 lg:gap-3', columns === 2 && 'lg:grid-cols-2')}>
      {options.map((option, index) => (
        <ChoiceCard
          key={option}
          buttonRef={(el) => { refs.current[index] = el; }}
          title={t(keyOf(option, 'title'))}
          text={t(keyOf(option, 'text'))}
          checked={value === option}
          focusable={index === focusIndex}
          onSelect={() => onChange(option)}
          onKeyDown={(event) => move(event, index)}
          chips={chips[option].map((chip) => t(`chip.${chip}`))}
          {...extras?.[option]}
        />
      ))}
    </div>
  );
}
