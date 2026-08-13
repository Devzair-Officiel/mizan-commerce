'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { matchKindLabel } from '@/lib/ocr/review';
import type { OcrMatchingCandidate } from '@/lib/hooks/useOcr';

interface MatchingCandidatesSheetProps {
  open: boolean;
  onClose: () => void;
  candidates: readonly OcrMatchingCandidate[];
  selectedVariantId: string | null;
  onSelect: (variantId: string | null) => void;
  invoiceDescription: string;
}

/**
 * Sélection LOCALE d'un candidat matching parmi 0..3 propositions.
 *
 * IMPORTANT : le fait qu'un candidat ait `similarity_score = 100`
 * (barcode_exact ou sku_exact) ne vaut PAS validation implicite —
 * l'utilisateur doit cocher explicitement, même dans ce cas.
 *
 * Aucune requête backend n'est déclenchée par ce composant : le
 * choix est propagé au parent et persisté uniquement dans l'état
 * du draft de revue (Step 8).
 */
export function MatchingCandidatesSheet({
  open, onClose, candidates, selectedVariantId, onSelect, invoiceDescription,
}: MatchingCandidatesSheetProps) {
  const t = useTranslations('stock.candidatesSheet');
  return (
    <BottomSheet open={open} onClose={onClose} title={t('title')}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          {t('line_prefix')} <span className="font-medium text-foreground">{invoiceDescription || '—'}</span>
        </p>

        {candidates.length === 0 ? (
          <div className="rounded-2xl border border-border bg-muted/30 p-4 text-center">
            <p className="text-sm font-medium text-foreground">{t('empty_title')}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('empty_body')}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {candidates.map((c) => {
              const selected = c.variant_id === selectedVariantId;
              return (
                <li key={c.variant_id}>
                  <button
                    type="button"
                    onClick={() => { onSelect(selected ? null : c.variant_id); onClose(); }}
                    className={`w-full text-start rounded-2xl border px-4 py-3 flex items-start gap-3 min-h-16 active:scale-[0.98] transition-transform ${
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card'
                    }`}
                  >
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      selected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {selected && <Check size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {c.product_name}
                      </p>
                      {c.packaging_name && (
                        <p className="text-xs text-muted-foreground truncate">{c.packaging_name}</p>
                      )}
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">{matchKindLabel(c.match_kind)}</span>
                        <span className="text-[11px] tabular-nums text-muted-foreground/80">·</span>
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {c.similarity_score}/100
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {selectedVariantId && (
          <button
            type="button"
            onClick={() => { onSelect(null); onClose(); }}
            className="text-xs text-muted-foreground underline mt-2 py-2"
          >
            {t('remove_selection')}
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
