'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FieldSuffix } from '@/components/form/FieldSuffix';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { FormField } from '@/components/form/FormField';
import { AMOUNT_PATTERN, normalizeDecimal } from '@/lib/decimal';
import { cn } from '@/lib/utils';

interface AmountFieldProps {
  label: string;
  help?: string;
  /** Valeur saisie au départ, déjà mise en forme pour le champ. */
  initial: string;
  suffix: string;
  /** Montant normalisé (« 1234.5 »), envoyé seulement quand la saisie est valide. */
  onSave: (amount: string) => void;
  /** Motif propre au champ (prix du gramme, part) et son message. */
  pattern?: { test: (value: string) => boolean; message: string };
  placeholder?: string;
  className?: string;
}

/**
 * Montant enregistré automatiquement : la frappe reste locale, seule une valeur valide part au serveur
 * (après la pause de frappe de l'assistant). Une saisie invalide reste affichée avec son erreur.
 */
export function AmountField({ label, help, initial, suffix, onSave, pattern, placeholder = '0,00', className }: AmountFieldProps) {
  const t = useTranslations('zakat.common');
  const [text, setText] = useState(initial);
  const valid = (value: string) => (pattern ? pattern.test(value) : AMOUNT_PATTERN.test(value));
  const error = text.trim() === '' || valid(text.trim()) ? undefined : (pattern?.message ?? t('amount_invalid'));

  function change(value: string) {
    setText(value);
    const trimmed = value.trim();
    // Vide : 0 pour un montant ; un prix ou une part vide n'est pas envoyé (la valeur précédente reste).
    if (trimmed === '') { if (!pattern) onSave('0'); } else if (valid(trimmed)) onSave(normalizeDecimal(trimmed));
  }

  return (
    <div className={cn('max-w-80', className)}>
      <FormField label={label} help={help} error={error}>
        {(c) => (
          <FieldSuffix suffix={suffix}>
            <input {...c} value={text} onChange={(e) => change(e.target.value)} inputMode="decimal" autoComplete="off"
              placeholder={placeholder} className={`${FIELD_CONTROL} pe-14 tabular-nums`} />
          </FieldSuffix>
        )}
      </FormField>
    </div>
  );
}
