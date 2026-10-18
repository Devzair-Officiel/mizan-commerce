'use client';

import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Pas encore de jour J : la page invite à le choisir dans les réglages. */
export function HawlEmpty() {
  const t = useTranslations('zakat.home');
  return (
    <section aria-labelledby="zakat-hawl-empty"
      className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card px-4 py-5 lg:flex-row lg:items-center lg:gap-6 lg:px-8 lg:py-7">
      <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <CalendarDays className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="zakat-hawl-empty" className="text-lg font-semibold text-foreground lg:text-xl">{t('empty_title')}</h2>
        <p className="mt-1 max-w-prose text-sm leading-normal text-muted-foreground">{t('empty_sub')}</p>
      </div>
      <Link href="/zakat/reglages" className={cn(buttonVariants({ variant: 'outline' }), 'h-11 rounded-full px-5 text-sm font-semibold')}>
        {t('empty_cta')}
      </Link>
    </section>
  );
}
