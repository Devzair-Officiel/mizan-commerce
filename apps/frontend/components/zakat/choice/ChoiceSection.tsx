'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ChoiceName, ChoiceOption } from '@/lib/hooks/useZakat';
import { cn } from '@/lib/utils';
import { CHOICE_TOPIC } from '../basis/basisCatalog';
import { BasisLink } from '../basis/BasisLink';
import { ChoiceGroup, type OptionExtras } from './ChoiceGroup';

interface ChoiceSectionProps<C extends ChoiceName> {
  name: C;
  value: ChoiceOption<C> | null;
  onChange: (value: ChoiceOption<C>) => void;
  extras?: Partial<Record<ChoiceOption<C>, OptionExtras>>;
  columns?: 1 | 2;
  /** La fiche est la plus récente : son choix sera repris pour la suivante (Q6). */
  isLatest: boolean;
  /** Mobile : la question sert déjà de titre à l'étape, on ne la répète pas. */
  questionIsHeading?: boolean;
}

function KeptChoice({ label, value, onModify }: { label: string; value: string; onModify: () => void }) {
  const t = useTranslations('zakat.common');
  return (
    <div className="flex items-center justify-between gap-3 rounded-[0.875rem] bg-secondary px-3.5 py-3 text-secondary-foreground lg:hidden">
      <div className="min-w-0">
        <p className="text-xs">{label}</p>
        <p className="mt-0.5 text-sm font-semibold">{value}</p>
      </div>
      <button type="button" onClick={onModify}
        className="min-h-11 shrink-0 whitespace-nowrap rounded-md text-[0.8125rem] font-semibold underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-primary/30">
        {t('modify')}
      </button>
    </div>
  );
}

/**
 * Choix d'avis d'une étape. Desktop : carte à bandeau (question, aide), options, mention « Modifiable ».
 * Mobile : options nues sous la question ; une fois le choix fait, un rappel avec « Modifier ».
 */
export function ChoiceSection<C extends ChoiceName>({ name, value, onChange, extras, columns, isLatest, questionIsHeading }: ChoiceSectionProps<C>) {
  const t = useTranslations('zakat');
  const [editing, setEditing] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);
  const collapsed = value !== null && !editing;
  // Clés typées `string` : next-intl ne résout pas une clé construite sur le type générique du choix.
  const base: string = `choice.${name}`;
  const summaryKey: string = `summary.value.${name}`;
  const question = t(`${base}.question`);

  function modify() {
    setEditing(true);
    requestAnimationFrame(() => groupRef.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus());
  }

  return (
    <>
      {value !== null && collapsed && (
        // Choix replié (mobile) : les options se cachent, pas leur fondement (M5).
        <div className="flex flex-col lg:hidden">
          <KeptChoice label={t(`${base}.kept`)} value={t(summaryKey, { value })} onModify={modify} />
          <BasisLink view={CHOICE_TOPIC[name]} label={t('basis.why')} className="mt-1.5" />
        </div>
      )}
      <section className={cn('lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border lg:bg-card', collapsed && 'max-lg:hidden')}>
        <div className={cn('lg:header-band lg:border-b lg:border-border lg:px-5 lg:py-4', questionIsHeading && 'max-lg:hidden')}>
          <h2 className="text-[0.9375rem] font-semibold text-foreground lg:text-base">{question}</h2>
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted-foreground lg:text-[0.78125rem]">{t(`${base}.hint`)}</p>
        </div>
        <div ref={groupRef} className={cn('lg:p-5', !questionIsHeading && 'max-lg:mt-3')}>
          <ChoiceGroup name={name} value={value} onChange={onChange} extras={extras} columns={columns} label={question} />
          <BasisLink view={CHOICE_TOPIC[name]} label={t('basis.why')} className="mt-1.5" />
          <p className="mt-1 text-[0.78125rem] text-muted-foreground">{t(isLatest ? 'choice.note_latest' : 'choice.note')}</p>
        </div>
      </section>
    </>
  );
}
