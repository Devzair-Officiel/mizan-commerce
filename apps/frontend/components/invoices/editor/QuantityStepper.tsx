'use client';

import type { ComponentProps } from 'react';
import { useTranslations } from 'next-intl';
import { Minus, Plus } from 'lucide-react';
import { FloatingInput } from '@/components/ui/floating-fields';
import { decimal } from './editorSchema';

type InputProps = Omit<ComponentProps<typeof FloatingInput>, 'value' | 'onChange'>;

interface QuantityStepperProps extends InputProps {
  value: string;
  onChange: (value: string) => void;
}

const STEP_BUTTON = 'grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent';

/** Quantité saisie librement (décimales permises), − et + d'une unité ; le − s'arrête à 1. */
export function QuantityStepper({ value, onChange, ...input }: QuantityStepperProps) {
  const t = useTranslations('invoices.editor.line');
  const current = Number(decimal(value, 3) ?? 0);
  const step = (delta: number) => {
    const next = String(Math.round(Math.max(current + delta, 1) * 1000) / 1000);
    onChange(value.includes(',') ? next.replace('.', ',') : next);
  };
  return <div className="relative">
    <FloatingInput {...input} value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" autoComplete="off" className="pe-21 tabular-nums" />
    <div className="absolute inset-e-1.5 top-1/2 flex -translate-y-1/2 items-center">
      <button type="button" className={STEP_BUTTON} onClick={() => step(-1)} disabled={current <= 1} aria-label={t('decrease')}><Minus size={16} aria-hidden /></button>
      <button type="button" className={STEP_BUTTON} onClick={() => step(1)} aria-label={t('increase')}><Plus size={16} aria-hidden /></button>
    </div>
  </div>;
}
