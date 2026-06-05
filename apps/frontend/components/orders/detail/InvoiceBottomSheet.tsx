'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Receipt } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { FloatingInput, FloatingTextarea } from '@/components/ui/floating-fields';

interface InvoiceBottomSheetProps {
  open: boolean;
  onClose: () => void;
  defaultTaxRate: string;
  defaultTermsDays: string;
  isPending: boolean;
  error: string | null;
  onSubmit: (params: { taxRate: string; termsDays: string; notes: string }) => void | Promise<void>;
}

export function InvoiceBottomSheet(props: InvoiceBottomSheetProps) {
  const t = useTranslations('orders.invoiceSheet');
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title={t('title')}>
      {props.open && <InvoiceForm {...props} />}
    </BottomSheet>
  );
}

function InvoiceForm({
  defaultTaxRate, defaultTermsDays, isPending, error, onSubmit,
}: InvoiceBottomSheetProps) {
  const t = useTranslations('orders.invoiceSheet');
  const [taxRate, setTaxRate] = useState(defaultTaxRate);
  const [termsDays, setTermsDays] = useState(defaultTermsDays);
  const [notes, setNotes] = useState('');

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-zinc-500">{t('intro')}</p>
      <div className="grid grid-cols-2 gap-3">
        <FloatingInput
          id="invoice-tax-rate"
          label={t('tax_rate')}
          type="number"
          step="0.01"
          min="0"
          max="100"
          inputMode="decimal"
          suffix={t('tax_suffix')}
          value={taxRate}
          onChange={(e) => setTaxRate(e.target.value)}
        />
        <FloatingInput
          id="invoice-terms-days"
          label={t('terms_days')}
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          suffix={t('terms_suffix')}
          value={termsDays}
          onChange={(e) => setTermsDays(e.target.value)}
        />
      </div>
      <FloatingTextarea
        id="invoice-notes"
        label={t('notes')}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button
        onClick={() => onSubmit({ taxRate, termsDays, notes })}
        disabled={isPending}
        className="w-full inline-flex items-center justify-center gap-2"
      >
        <Receipt size={16} />
        {isPending ? t('issuing') : t('submit')}
      </Button>
      <p className="text-[11px] text-zinc-400 text-center">{t('footnote')}</p>
    </div>
  );
}
