import { useTranslations } from 'next-intl';

/** Ligne personnelle : comptée en entier, la part de la boutique ne s'y applique pas. */
export function PersonalTag() {
  const t = useTranslations('zakat.steps.scope');
  return (
    <span className="ms-2 inline-flex h-5.5 items-center rounded-full bg-muted px-2 align-middle text-[0.71875rem] font-semibold whitespace-nowrap text-muted-foreground">
      {t('personal')}
    </span>
  );
}
