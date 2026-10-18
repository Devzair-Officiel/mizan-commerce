'use client';

import type { KeyboardEvent, Ref } from 'react';
import { cn } from '@/lib/utils';

interface ChoiceCardProps {
  title: string;
  text?: string;
  checked: boolean;
  /** Seule carte atteignable au clavier (Tab) dans son groupe ; les flèches passent aux autres. */
  focusable: boolean;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  chips: readonly string[];
  /** Montant propre à l'option, sous le texte (valeur du stock). */
  amount?: string;
  /** Montant à droite de la carte (dette déduite). */
  trailing?: string;
  /** Effet sur la zakat estimée (« Zakat estimée : 412,00 € »). */
  effect?: string;
  buttonRef?: Ref<HTMLButtonElement>;
}

function Chips({ chips }: { chips: readonly string[] }) {
  if (chips.length === 0) return null;
  return (
    <span className="mt-2.5 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span key={chip} className="inline-flex h-5.5 items-center whitespace-nowrap rounded-full border border-border bg-card px-2 text-[0.71875rem] font-semibold text-muted-foreground">
          {chip}
        </span>
      ))}
    </span>
  );
}

/** Option d'un choix d'avis : bouton `radio`, toutes les options à égalité, aucune mise en avant. */
export function ChoiceCard({ title, text, checked, focusable, onSelect, onKeyDown, chips, amount, trailing, effect, buttonRef }: ChoiceCardProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      role="radio"
      aria-checked={checked}
      tabIndex={focusable ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn(
        'relative flex w-full gap-3 rounded-[0.875rem] border-[1.5px] bg-card p-3.5 text-start outline-none transition-colors lg:gap-3.5 lg:p-4',
        'focus-visible:ring-3 focus-visible:ring-primary/30 active:scale-[0.99] motion-reduce:active:scale-100',
        checked ? 'border-primary bg-primary/6' : 'border-border hover:border-primary/50',
      )}
    >
      <span aria-hidden className={cn('mt-px flex size-5 shrink-0 items-center justify-center rounded-full border-2', checked ? 'border-primary' : 'border-border')}>
        {checked && <span className="size-2.5 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.90625rem] font-semibold text-foreground lg:text-[0.9375rem]">{title}</span>
        {text && <span className="mt-0.5 block text-[0.78125rem] leading-[1.45] text-muted-foreground lg:text-[0.8125rem]">{text}</span>}
        {amount && <span className="mt-2 block text-[0.8125rem] font-semibold tabular-nums text-foreground lg:mt-2.5 lg:text-[1.375rem] lg:font-bold lg:tracking-tight">{amount}</span>}
        <Chips chips={chips} />
        {trailing && <span className="mt-2 block text-[0.8125rem] font-semibold tabular-nums text-foreground lg:hidden">{trailing}</span>}
        {effect && <span className="mt-2 block text-xs tabular-nums text-muted-foreground">{effect}</span>}
      </span>
      {trailing && <span className="hidden shrink-0 whitespace-nowrap text-[0.9375rem] font-semibold tabular-nums text-foreground lg:block">{trailing}</span>}
    </button>
  );
}
