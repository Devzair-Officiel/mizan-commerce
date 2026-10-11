import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

/** Zone en cours de chargement, annoncée aux lecteurs d'écran ; le squelette qu'elle contient n'a pas de texte. */
export function LoadingRegion({ children, className }: { children: ReactNode; className?: string }) {
  const t = useTranslations('ui.loading');
  return (
    <div role="status" aria-busy="true" data-skeleton="" className={className}>
      <span className="sr-only">{t('status')}</span>
      {children}
    </div>
  );
}
