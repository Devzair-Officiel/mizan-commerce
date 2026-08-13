'use client';

import { useTranslations } from 'next-intl';
import { Check, EyeOff, Search } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { OcrMatchingCandidate } from '@/lib/hooks/useOcr';

export interface MatchingCandidateSelection {
  variantId: string;
  productName: string;
  packagingName: string;
}

interface MatchingCandidatesSheetProps {
  open: boolean;
  onClose: () => void;
  candidates: readonly OcrMatchingCandidate[];
  selectedVariantId: string | null;
  onPickCandidate: (selection: MatchingCandidateSelection) => void;
  onOpenCatalog: () => void;
  onIgnore: () => void;
  invoiceDescription: string;
}

/**
 * Sélection LOCALE d'un candidat matching + actions annexes (Step 9B).
 *
 * IMPORTANT : le fait qu'un candidat ait `similarity_score = 100`
 * (barcode_exact ou sku_exact) ne vaut PAS validation implicite —
 * l'utilisateur doit cocher explicitement, même dans ce cas.
 *
 * Aucune requête backend n'est déclenchée par ce composant : la
 * décision (`stock`/`ignore`) est propagée au parent qui persiste
 * dans le draft de revue. La validation part uniquement via
 * `useValidateOcrReview` déclenché par le bouton sticky.
 */
export function MatchingCandidatesSheet({
  open, onClose, candidates, selectedVariantId,
  onPickCandidate, onOpenCatalog, onIgnore, invoiceDescription,
}: MatchingCandidatesSheetProps) {
  const t = useTranslations('stock.candidatesSheet');
  const tMatch = useTranslations('stock.matchKind');

  return (
    <BottomSheet open={open} onClose={onClose} title={t('title')}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          {t('line_prefix')}{' '}
          <span className="font-medium text-foreground">{invoiceDescription || '—'}</span>
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
                    onClick={() => {
                      onPickCandidate({
                        variantId: c.variant_id,
                        productName: c.product_name,
                        packagingName: c.packaging_name,
                      });
                      onClose();
                    }}
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
                        <span className="text-[11px] text-muted-foreground">{tMatch(c.match_kind)}</span>
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

        <div className="mt-1 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => { onOpenCatalog(); onClose(); }}
            className="w-full rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 min-h-13 flex items-center gap-3 text-start text-primary active:scale-[0.98] transition-transform"
          >
            <span className="shrink-0 w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Search size={16} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{t('pick_other_title')}</p>
              <p className="text-[11px] text-muted-foreground">{t('pick_other_sub')}</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => { onIgnore(); onClose(); }}
            className="w-full rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-3 min-h-13 flex items-center gap-3 text-start text-foreground active:scale-[0.98] transition-transform"
          >
            <span className="shrink-0 w-9 h-9 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
              <EyeOff size={16} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{t('ignore_title')}</p>
              <p className="text-[11px] text-muted-foreground">{t('ignore_sub')}</p>
            </div>
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
