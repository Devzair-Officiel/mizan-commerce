'use client';

import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { BookOpen, History, PencilLine } from 'lucide-react';
import { FloatingInput } from '@/components/ui/floating-fields';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { useLineSuggestions, type LineSuggestion } from '@/lib/hooks/useInvoiceDrafts';
import { MAX_LENGTH } from './editorSchema';

interface LineDescriptionFieldProps {
  id: string;
  /** Champ enregistré (`register`) : saisie, perte du focus et ref pour `setFocus`. */
  field: UseFormRegisterReturn;
  /** Valeur suivie (`useWatch`) : sert à la recherche. */
  value: string;
  currency: string;
  /** Suggestion choisie : désignation, détails, unité et prix repris sur la ligne. */
  onPick: (suggestion: LineSuggestion) => void;
}

/** Une suggestion de la liste : catalogue ou ligne déjà facturée, avec son prix et son unité. */
function SuggestionText({ s, currency }: { s: LineSuggestion; currency: string }) {
  const t = useTranslations('invoices.editor.line');
  const money = useFormatMoney();
  return <span className="flex min-w-0 flex-col">
    <span dir="auto" className="truncate text-sm font-medium">{s.description}</span>
    <span className="truncate text-xs text-muted-foreground">
      {t('suggestion_meta', { source: s.source, number: s.invoice_number, price: money(s.unit_price_ht, currency), unit: s.unit || 'none' })}
    </span>
  </span>;
}

/**
 * Désignation avec suggestions (combobox) : catalogue puis lignes déjà facturées, dès deux
 * caractères ; dernière option « Utiliser … tel quel ». Flèches, Entrée et Échap au clavier.
 */
export function LineDescriptionField({ id, field, value, currency, onPick }: LineDescriptionFieldProps) {
  const t = useTranslations('invoices.editor.line');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const { data } = useLineSuggestions(open ? value : '');
  const items = data ?? [];
  const shown = open && value.trim().length >= 2 && items.length > 0;
  const count = items.length + 1;
  const listId = `${id}-suggestions`;
  const choose = (index: number) => {
    const item = items[index];
    if (item) onPick(item);
    setOpen(false);
    setActive(-1);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!shown) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : count - 1)) % count);
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') setOpen(false);
  };
  const option = (index: number) => ({
    id: `${listId}-${index}`, role: 'option', 'aria-selected': index === active,
    onMouseDown: (e: MouseEvent) => e.preventDefault(), onClick: () => choose(index),
    className: `flex cursor-pointer items-center gap-3 px-4 py-2.5 ${index === active ? 'bg-primary/8' : 'hover:bg-muted'}`,
  });
  return <div className="relative">
    <FloatingInput {...field} id={id} label={t('description')} maxLength={MAX_LENGTH.description} dir="auto" autoComplete="off"
      role="combobox" aria-autocomplete="list" aria-expanded={shown} aria-controls={shown ? listId : undefined}
      aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
      onChange={(e) => { void field.onChange(e); setOpen(true); setActive(-1); }}
      onFocus={() => setOpen(true)} onBlur={(e) => { void field.onBlur(e); setOpen(false); }} onKeyDown={onKeyDown} />
    {shown && <ul id={listId} role="listbox" aria-label={t('suggestions')}
      className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-2xl border border-border bg-card py-1 shadow-lg">
      {items.map((s, index) => <li key={`${s.source}-${s.product_id}-${s.invoice_number}-${s.description}`} {...option(index)}>
        {s.source === 'catalog' ? <BookOpen size={16} className="shrink-0 text-primary" aria-hidden /> : <History size={16} className="shrink-0 text-muted-foreground" aria-hidden />}
        <SuggestionText s={s} currency={currency} />
      </li>)}
      <li {...option(items.length)}>
        <PencilLine size={16} className="shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex min-w-0 flex-col">
          <span dir="auto" className="truncate text-sm font-medium">{t('use_as_is', { text: value.trim() })}</span>
          <span className="text-xs text-muted-foreground">{t('free_line')}</span>
        </span>
      </li>
    </ul>}
  </div>;
}
