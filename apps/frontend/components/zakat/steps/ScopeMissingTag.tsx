import { useTranslations } from 'next-intl';

/** Part inférieure à 100 % et portée jamais choisie : la ligne attend « Boutique » ou « Personnelle ». */
export function ScopeMissingTag() {
  const t = useTranslations('zakat.steps.scope');
  return (
    <span className="ms-2 inline-flex h-5.5 items-center rounded-full border border-dashed border-primary/50 px-2 align-middle text-[0.71875rem] font-semibold whitespace-nowrap text-primary">
      {t('missing_tag')}
    </span>
  );
}
