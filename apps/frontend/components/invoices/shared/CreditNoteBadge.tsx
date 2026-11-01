'use client';

import { useTranslations } from 'next-intl';

/** Badge « Avoir » : un avoir n'a ni paiement ni statut à suivre (D1). */
export function CreditNoteBadge() {
  const t = useTranslations('invoices');
  return <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-secondary-foreground">
    {t('kind', { kind: 'credit_note' })}
  </span>;
}
