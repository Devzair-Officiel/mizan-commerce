'use client';

import { useTranslations } from 'next-intl';
import { Check, X } from 'lucide-react';
import { SectionCard } from '@/components/ui/SectionCard';
import { useDayTime } from '@/components/orders/detail/useDayTime';
import { useFormatDate } from '@/lib/hooks/useFormat';
import type { Quote } from '@/lib/hooks/useQuotes';
import { cn } from '@/lib/utils';
import { computeQuoteSteps, type QuoteStep, type QuoteStepState } from './quoteSteps';

// Couleurs du suivi d'une commande (`OrderStatusStepper`), en chronologie verticale.
const CIRCLE: Record<QuoteStepState, string> = {
  done: 'bg-green-700 text-card dark:bg-green-400',
  current: 'bg-amber-500/10 ring-2 ring-inset ring-amber-600 dark:ring-amber-400',
  upcoming: 'bg-card ring-2 ring-inset ring-border',
  cancelled: 'bg-red-700 text-card dark:bg-red-400',
};
const LINE: Record<QuoteStepState, string> = {
  done: 'bg-green-700 dark:bg-green-400', current: 'bg-green-700 dark:bg-green-400', upcoming: 'bg-border', cancelled: 'bg-red-700 dark:bg-red-400',
};
const LABEL: Record<QuoteStepState, string> = {
  done: 'text-foreground', current: 'text-foreground', upcoming: 'text-muted-foreground', cancelled: 'text-red-700 dark:text-red-400',
};

/** Lignes sous le libellé d'une étape : heure, auteur de l'accord, numéro de la facture, date d'expiration. */
function useStepDetails(quote: Quote) {
  const t = useTranslations('quotes.tracking');
  const { format } = useDayTime();
  const date = useFormatDate();
  return (step: QuoteStep): string[] => {
    if (step.state === 'upcoming') return [t('upcoming')];
    if (step.key === 'invoiced') return [quote.invoice_number ? t('invoice', { number: quote.invoice_number }) : t('invoice_draft')];
    if (step.key === 'expired' && quote.valid_until) return [t('expired_on', { date: date(quote.valid_until, { dateStyle: 'medium', timeZone: 'UTC' }) })];
    const lines = step.at ? [format(step.at)] : [];
    if (step.key === 'accepted' && quote.accepted_name) lines.push(t('accepted_by', { name: quote.accepted_name }));
    return lines;
  };
}

/** Une étape : pastille, trait vers l'étape suivante (couleur de celle-ci), libellé et détails. */
function StepItem({ step, next, label, details }: { step: QuoteStep; next: QuoteStep | undefined; label: string; details: string[] }) {
  return <li aria-current={step.state === 'current' ? 'step' : undefined} className="relative flex gap-3 pb-5 last:pb-0">
    {next && <span aria-hidden className={cn('absolute inset-s-3.25 top-8 bottom-1 w-0.5 rounded-full', LINE[next.state])} />}
    <span className={cn('grid size-7 shrink-0 place-items-center rounded-full', CIRCLE[step.state])}>
      {step.state === 'done' && <Check size={16} strokeWidth={3} aria-hidden />}
      {step.state === 'cancelled' && <X size={16} strokeWidth={3} aria-hidden />}
      {step.state === 'current' && <span className="size-2.5 rounded-full bg-amber-600 dark:bg-amber-400" aria-hidden />}
    </span>
    <div className="min-w-0 pt-0.5">
      <p className={cn('text-sm font-semibold', LABEL[step.state])}>{label}</p>
      {details.map(line => <p key={line} dir="auto" className="mt-0.5 text-xs text-muted-foreground wrap-break-word">{line}</p>)}
    </div>
  </li>;
}

/** Carte « Suivi » : créé, envoyé, puis la réponse du client et la facturation. */
export function QuoteTrackingCard({ quote }: { quote: Quote }) {
  const t = useTranslations('quotes.tracking');
  const details = useStepDetails(quote);
  const steps = computeQuoteSteps(quote);
  return <SectionCard title={t('title')}>
    <ol aria-label={t('title')} className="flex flex-col px-4 py-4 lg:px-5">
      {steps.map((step, i) => <StepItem key={step.key} step={step} next={steps[i + 1]} label={t('step', { key: step.key })} details={details(step)} />)}
    </ol>
  </SectionCard>;
}
