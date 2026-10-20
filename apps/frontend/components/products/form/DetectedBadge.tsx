'use client';

import { useWatch, type Control } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import type { ProductFormValues } from './productFormSchema';
import type { ScanTarget } from './productScanPrefill';

interface DetectedBadgeProps {
  control: Control<ProductFormValues>;
  name: ScanTarget;
  /** Valeur posée par le scan ; le badge disparaît dès que le champ en diffère. */
  value: string | undefined;
}

/** « Détecté, à vérifier » à côté du libellé d'un champ pré-rempli par le scan d'emballage. */
export function DetectedBadge({ control, name, value }: DetectedBadgeProps) {
  const t = useTranslations('articles.scan');
  const current = useWatch({ control, name });
  if (value === undefined || current !== value) return null;
  return (
    <span className="inline-flex h-5.5 items-center rounded-full bg-amber-400/15 px-2 text-[0.6875rem] font-semibold text-amber-700 dark:text-amber-300">
      {t('detected')}
    </span>
  );
}
