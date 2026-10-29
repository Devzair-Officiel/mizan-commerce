'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/ui/floating-fields';
import { MAX_LENGTH } from './editorSchema';

const PRESETS = ['night', 'hour', 'day', 'week', 'trip', 'person', 'flat', 'piece'] as const;

interface UnitSheetProps {
  /** Unité actuelle de la ligne (texte libre, imprimé tel quel sur la facture). */
  value: string;
  onClose: () => void;
  onPick: (unit: string) => void;
}

/** Unité d'une ligne : unités courantes en puces, ou la vôtre. Montée à l'ouverture (saisie remise à zéro). */
export function UnitSheet({ value, onClose, onPick }: UnitSheetProps) {
  const t = useTranslations('invoices.editor.unit');
  const presets = PRESETS.map((key) => t('preset', { value: key }));
  // `null` tant que le champ n'est pas touché : « Valider » garde alors l'unité actuelle ; vidé, il l'efface.
  const [custom, setCustom] = useState<string | null>(null);
  const shown = custom ?? (presets.includes(value) ? '' : value);
  const pick = (unit: string) => { onPick(unit.trim()); onClose(); };
  const footer = <Button type="button" className="h-11 w-full rounded-full" onClick={() => pick(custom ?? value)}>{t('confirm')}</Button>;
  return <BottomSheet open onClose={onClose} title={t('title')} description={t('description')} footer={footer}>
    <div className="flex flex-col gap-4">
      <div role="group" aria-label={t('presets')} className="flex flex-wrap gap-2">
        {presets.map((unit) => {
          const active = unit === value && !custom;
          return <button key={unit} type="button" aria-pressed={active} onClick={() => pick(unit)}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-foreground hover:bg-muted'}`}>
            {active && <Check size={14} aria-hidden />}{unit}
          </button>;
        })}
      </div>
      <FloatingInput id="invoice-line-unit" label={t('custom')} value={shown} maxLength={MAX_LENGTH.unit} dir="auto" autoComplete="off"
        onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pick(shown); } }} />
    </div>
  </BottomSheet>;
}
