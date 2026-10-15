'use client';

import { useTranslations } from 'next-intl';
import { Ban, Plus, type LucideIcon } from 'lucide-react';
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
  /** Ligne « à associer » : « Créer cet article » et « Ignorer cette ligne ». */
  unassociated?: { onCreate: () => void; onIgnore: () => void };
  onClose: () => void;
}

/** Action de la fenêtre : icône, libellé et précision. */
function PickerAction({ icon: Icon, label, hint, onClick }: { icon: LucideIcon; label: string; hint: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none">
        <Icon size={18} aria-hidden className="shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="text-xs text-muted-foreground">{hint}</span>
        </span>
      </button>
    </li>
  );
}

/**
 * Association d'une ligne lue à un format : suggestions du rapprochement, puis recherche ; pour une
 * ligne à associer, création de l'article ou ligne ignorée. Le choix fait ici est mémorisé pour ce
 * fournisseur à l'enregistrement.
 */
export function InvoiceLinePickerSheet({ readLabel, candidates, onPick, unassociated, onClose }: InvoiceLinePickerSheetProps) {
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
        {unassociated && (
          <ul aria-label={t('other_choices')} className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            <PickerAction icon={Plus} label={t('create_article')} hint={t('create_article_hint')} onClick={unassociated.onCreate} />
            <PickerAction icon={Ban} label={t('ignore_line')} hint={t('ignore_line_hint')} onClick={() => { unassociated.onIgnore(); onClose(); }} />
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}
