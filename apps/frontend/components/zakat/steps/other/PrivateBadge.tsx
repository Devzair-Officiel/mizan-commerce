import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Biens personnels : la fiche n'est visible que par la personne qui l'a créée. */
export function PrivateBadge() {
  const t = useTranslations('zakat.steps.other');
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap text-muted-foreground">
      <Lock className="size-3.75" aria-hidden />
      {t('private')}
    </span>
  );
}
