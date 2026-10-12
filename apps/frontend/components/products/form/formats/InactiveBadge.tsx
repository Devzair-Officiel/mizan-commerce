'use client';

import { useTranslations } from 'next-intl';

/** « Inactif » : format retiré de la vente (même badge que la fiche). */
export function InactiveBadge() {
  const t = useTranslations('articles.badges');
  return (
    <span className="inline-flex h-6 items-center whitespace-nowrap rounded-full bg-muted px-2.5 text-xs font-semibold text-muted-foreground">
      {t('inactive')}
    </span>
  );
}
