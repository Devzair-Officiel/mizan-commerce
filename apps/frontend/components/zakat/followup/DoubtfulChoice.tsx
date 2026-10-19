'use client';

import { useRef, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { DOUBTFUL_OPTIONS, type DoubtfulOption, type FollowUpItem } from '@/lib/hooks/useZakatFollowUps';
import { BASIS } from '../basis/basisCatalog';
import { arrowStep } from '../choice/arrowStep';
import { ChoiceCard } from '../choice/ChoiceCard';
import type { ChipKey } from '../choice/choiceCatalog';
import type { ZakatFormat } from '../useZakatFormat';
import { useOptionTexts } from './useOptionTexts';

/** Qui retient chaque option D4 : la même source que la fiche « Fondement » des créances. */
function chipsOf(option: DoubtfulOption): readonly ChipKey[] {
  for (const group of BASIS.receivables.opinions) {
    if ('group' in group && group.group === 'doubtful') return group.items.find((i) => i.key === option)?.chips ?? [];
  }
  return [];
}

interface DoubtfulChoiceProps {
  item: FollowUpItem;
  options: Record<DoubtfulOption, string>;
  format: ZakatFormat;
  disabled: boolean;
  onChange: (option: DoubtfulOption) => void;
}

/**
 * Créance douteuse encaissée (D4) : trois options à égalité, montant de chacune affiché avant le
 * choix, rien de coché d'avance. Chaque choix s'enregistre : les flèches déplacent le focus sans
 * choisir, Espace ou Entrée choisit.
 */
export function DoubtfulChoice({ item, options, format, disabled, onChange }: DoubtfulChoiceProps) {
  const t = useTranslations('zakat');
  const texts = useOptionTexts(item, format);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusIndex = item.option === null ? 0 : DOUBTFUL_OPTIONS.indexOf(item.option);

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = arrowStep(event);
    if (step === 0) return;
    event.preventDefault();
    refs.current[(index + step + DOUBTFUL_OPTIONS.length) % DOUBTFUL_OPTIONS.length]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={t('followup.choice_label')} aria-disabled={disabled || undefined} className="grid gap-2.5">
      {DOUBTFUL_OPTIONS.map((option, index) => (
        <ChoiceCard key={option} buttonRef={(el) => { refs.current[index] = el; }}
          title={t(`basis.opinion.doubtful.${option}.title`)} text={texts[option]}
          checked={item.option === option} focusable={index === focusIndex}
          onSelect={() => { if (!disabled && item.option !== option) onChange(option); }}
          onKeyDown={(event) => move(event, index)}
          chips={chipsOf(option).map((chip) => t(`chip.${chip}`))}
          trailing={format.money(options[option])} />
      ))}
    </div>
  );
}
