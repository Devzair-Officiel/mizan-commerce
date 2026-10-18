'use client';

import { useTranslations } from 'next-intl';
import type { ZakatCalculation } from '@/lib/hooks/useZakat';
import { cn } from '@/lib/utils';
import { CHOICE_ORDER, CHOICE_STEP } from '../choice/choiceCatalog';
import { StepLink } from '../wizard/StepLink';
import { HERO_BOX, HERO_EYEBROW, HERO_LEAD, HERO_TITLE } from './heroStyles';

const HAWL_STEP = 0;

interface HeroIncompleteProps {
  calc: ZakatCalculation;
  onGo: (step: number) => void;
}

/** Pas de résultat sans les choix d'avis (Mizan ne choisit pas) ni sans le prix du gramme : un lien par manque. */
export function HeroIncomplete({ calc, onGo }: HeroIncompleteProps) {
  const t = useTranslations('zakat');
  const missing = CHOICE_ORDER.filter((name) => calc.totals.missing_choices.includes(name));
  const choiceMissing = calc.totals.status === 'choice_missing';

  return (
    <section aria-labelledby="zakat-result-verdict" className={cn(HERO_BOX, 'bg-muted text-foreground lg:block')}>
      <h2 id="zakat-result-verdict" className={cn(HERO_EYEBROW, 'text-muted-foreground')}>{t('result.below_eyebrow')}</h2>
      <p className={HERO_TITLE}>
        {choiceMissing ? t('result.missing_title', { count: missing.length }) : t('result.nisab_title')}
      </p>
      <p className={HERO_LEAD}>{t(choiceMissing ? 'result.missing_text' : 'result.nisab_text')}</p>
      {choiceMissing ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {missing.map((name) => (
            <li key={name}>
              <StepLink id={calc.id} step={CHOICE_STEP[name]} onGo={onGo}
                className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-primary outline-none hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-primary/30">
                {t('result.missing_link', { label: t(`summary.label.${name}`), n: CHOICE_STEP[name] + 1 })}
              </StepLink>
            </li>
          ))}
        </ul>
      ) : (
        <StepLink id={calc.id} step={HAWL_STEP} onGo={onGo}
          className="mt-4 inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-primary/30">
          {t('result.nisab_cta')}
        </StepLink>
      )}
    </section>
  );
}
