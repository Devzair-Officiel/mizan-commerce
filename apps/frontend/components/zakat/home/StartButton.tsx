'use client';

import Link from 'next/link';
import { ArrowRight, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button, buttonVariants } from '@/components/ui/button';
import type { NextHawl } from '@/lib/hooks/useZakat';
import { cn } from '@/lib/utils';
import { resumeHref } from '../wizard/stepNav';
import { useStartZakat } from './useStartZakat';

interface StartButtonProps {
  next: NextHawl | null;
  /** Étapes validées de la fiche en cours, pour la rouvrir où elle en est. */
  doneCount: number;
  className?: string;
}

/** L'action de la page : reprendre la fiche de l'année si elle existe, sinon la créer (au clic). */
export function StartButton({ next, doneCount, className }: StartButtonProps) {
  const t = useTranslations('zakat.home');
  const { start, pending } = useStartZakat();
  const base = cn('rounded-full font-semibold', className);

  if (next?.calculation_id) {
    return (
      <Link href={resumeHref(next.calculation_id, doneCount)} className={cn(buttonVariants(), base)}>
        {t('resume_year', { year: String(next.hawl_year) })}
        <ArrowRight aria-hidden className="rtl:rotate-180" />
      </Link>
    );
  }
  return (
    <Button type="button" onClick={start} disabled={pending} className={base}>
      <Plus aria-hidden />
      {pending ? t('starting') : next ? t('start_year', { year: String(next.hawl_year) }) : t('start')}
    </Button>
  );
}
