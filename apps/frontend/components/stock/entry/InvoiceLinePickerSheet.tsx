'use client';

import { useTranslations } from 'next-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { OcrMatchingCandidate } from '@/lib/hooks/useOcr';
import { StockVariantSearch } from '../search/StockVariantSearch';
import { StockVariantCell } from '../StockVariantCell';

export interface PickedVariant {
  variant: string;
  name: string;
  packaging: string;
}

interface InvoiceLinePickerSheetProps {
  readLabel: string;
  candidates: OcrMatchingCandidate[];
  onPick: (picked: PickedVariant) => void;
  onClose: () => void;
}

/**
 * Association d'une ligne lue à un format : suggestions du rapprochement, puis recherche.
 * L'association faite ici est mémorisée pour ce fournisseur à l'enregistrement.
 */
export function InvoiceLinePickerSheet({ readLabel, candidates, onPick, onClose }: InvoiceLinePickerSheetProps) {
  const t = useTranslations('stock.invoice');
  const pick = (picked: PickedVariant) => { onPick(picked); onClose(); };

  return (
    <BottomSheet open onClose={onClose} title={t('picker_title')} description={t('picker_read', { label: readLabel })}>
      <div className="flex flex-col gap-4 pb-2">
        <StockVariantSearch scanner={false} autoFocus
          onPick={(level) => pick({ variant: level.id, name: level.product_name, packaging: level.packaging_name })} />
        {candidates.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h3 className="px-1 text-xs font-semibold text-muted-foreground">{t('suggestions')}</h3>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {candidates.map((c) => (
                <li key={c.variant_id}>
                  <button type="button" onClick={() => pick({ variant: c.variant_id, name: c.product_name, packaging: c.packaging_name })}
                    className="flex w-full px-4 py-3 text-start transition-colors hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none">
                    <StockVariantCell productName={c.product_name} packagingName={c.packaging_name} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </BottomSheet>
  );
}
