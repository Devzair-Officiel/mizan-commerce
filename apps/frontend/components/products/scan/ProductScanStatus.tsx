'use client';

import { CircleAlert, RotateCcw, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LoadingRegion } from '@/components/ui/LoadingRegion';
import { Skeleton } from '@/components/ui/skeleton';
import { isScanWarning, SCAN_MAX_MB, type ProductScanFailure, type ScanOutcome } from '@/lib/hooks/useProductScan';

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
          <button type="button" onClick={onRetry}
            className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-transform hover:bg-muted active:scale-95">
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
      {warnings.filter(isScanWarning).map((w) => (
        <p key={w} className="text-amber-700 dark:text-amber-400">{t(`warning.${w}`)}</p>
      ))}
    </div>
  );
}
