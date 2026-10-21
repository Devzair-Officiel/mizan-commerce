'use client';

import { useState } from 'react';
import { CircleAlert, RotateCcw, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { UpgradeSheet } from '@/components/subscription/UpgradeSheet';
import { LoadingRegion } from '@/components/ui/LoadingRegion';
import { Skeleton } from '@/components/ui/skeleton';
import { isScanWarning, SCAN_MAX_MB, type ProductScanFailure, type ScanOutcome } from '@/lib/hooks/useProductScan';
import { useSubscription } from '@/lib/hooks/useSubscription';

interface ProductScanStatusProps {
  pending: boolean;
  failure: ProductScanFailure | null;
  outcome: ScanOutcome | null;
  warnings: string[];
  /** Nouvel essai avec la même photo (service indisponible, trop de scans). */
  onRetry?: () => void;
}

const ROW = 'border-t border-border px-4 py-3 lg:px-5';
const RETRYABLE: ReadonlySet<ProductScanFailure> = new Set(['throttled', 'unavailable']);
const BUTTON = 'inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-transform hover:bg-muted active:scale-95';

/** Lectures avancées du mois épuisées : le scan a servi quand même ; mise à niveau proposée s'il existe une formule au-dessus. */
function TextQuotaWarning() {
  const t = useTranslations('articles.scan');
  const plan = useSubscription().data?.effective_plan_code;
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-scan-warning="text_quota_reached">
      <p className="min-w-0 flex-1 basis-56 text-amber-700 dark:text-amber-400">{t('warning.text_quota_reached')}</p>
      {plan && plan !== 'commerce_plus' && (
        <button type="button" onClick={() => setOpen(true)} className={BUTTON}>
          <Sparkles size={16} aria-hidden />{t('ai_reads_more')}
        </button>
      )}
      <UpgradeSheet open={open} onClose={() => setOpen(false)} feature="ai_reads" title={t('ai_reads_sheet_title')} />
    </div>
  );
}

/** Sous la carte de scan : lecture en cours (squelette), refus ou panne (avec reprise), ce qui a été pré-rempli. */
export function ProductScanStatus({ pending, failure, outcome, warnings, onRetry }: ProductScanStatusProps) {
  const t = useTranslations('articles.scan');

  if (pending) {
    return (
      <LoadingRegion className={`${ROW} flex flex-col gap-2`}>
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-4 w-2/5" />
      </LoadingRegion>
    );
  }
  if (failure) {
    return (
      <div className={`${ROW} flex flex-wrap items-center gap-x-3 gap-y-2`}>
        <p role="alert" className="flex min-w-0 flex-1 basis-56 items-start gap-2 text-[0.8125rem] text-red-700 dark:text-red-400">
          <CircleAlert size={16} aria-hidden className="mt-px shrink-0" />{t(`error.${failure}`, { max: SCAN_MAX_MB })}
        </p>
        {onRetry && RETRYABLE.has(failure) && (
          <button type="button" onClick={onRetry} className={BUTTON}>
            <RotateCcw size={16} aria-hidden />{t('retry')}
          </button>
        )}
      </div>
    );
  }
  if (!outcome) return null;
  const message = outcome.found === 0 ? t('nothing_found') : outcome.filled === 0 ? t('nothing_filled') : t('filled', { count: outcome.filled });
  return (
    <div role="status" className={`${ROW} flex flex-col gap-1.5 text-[0.8125rem]`}>
      <p className="flex items-start gap-2 font-medium text-foreground">
        <Sparkles size={16} aria-hidden className="mt-px shrink-0 text-primary" />{message}
      </p>
      {warnings.filter(isScanWarning).map((w) => (w === 'text_quota_reached' ? <TextQuotaWarning key={w} /> : (
        <p key={w} className="text-amber-700 dark:text-amber-400">{t(`warning.${w}`)}</p>
      )))}
    </div>
  );
}
