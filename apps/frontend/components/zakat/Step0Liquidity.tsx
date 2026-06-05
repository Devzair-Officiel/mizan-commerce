'use client';

import { Wallet } from 'lucide-react';
import { FloatingInput } from '@/components/ui/floating-fields';
import { ReligiousNote } from './ReligiousNote';

interface Step0Props {
  referenceDate: string;
  cashAmount: string;
  currency: string;
  onChange: (patch: { referenceDate?: string; cashAmount?: string }) => void;
}

export function Step0Liquidity({ referenceDate, cashAmount, currency, onChange }: Step0Props) {
  return (
    <div className="flex flex-col gap-4">
      {/* Bandeau pédagogique : pose le contexte de la question. */}
      <div className="flex gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3">
        <Wallet className="text-primary shrink-0 mt-0.5" size={18} />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">Argent disponible aujourd&apos;hui</p>
          <p className="text-xs text-muted-foreground">
            Comptez tout l&apos;argent immédiatement disponible pour votre activité : caisse, compte
            professionnel, espèces conservées au commerce.
          </p>
        </div>
      </div>

      <FloatingInput
        id="z-ref-date"
        label="Date de référence"
        type="date"
        value={referenceDate}
        onChange={(e) => onChange({ referenceDate: e.target.value })}
      />

      <FloatingInput
        id="z-cash"
        label="Argent disponible"
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        suffix={currency}
        value={cashAmount}
        onChange={(e) => onChange({ cashAmount: e.target.value })}
      />

      <ReligiousNote rubric="cash" />
    </div>
  );
}
