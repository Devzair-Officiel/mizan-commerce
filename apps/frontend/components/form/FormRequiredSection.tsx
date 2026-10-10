'use client';

import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { FormBadge } from './FormBadge';
import { FIELD_GRID } from './fieldStyles';

interface FormRequiredSectionProps {
  title: string;
  /** Une phrase qui dit à quoi servent les champs. */
  description: string;
  /** Avant le titre (avatar…). */
  leading?: ReactNode;
  children: ReactNode;
}

/** Section obligatoire, toujours ouverte, en tête de carte : titre, badge « Obligatoire », explication, champs. */
export function FormRequiredSection({ title, description, leading, children }: FormRequiredSectionProps) {
  const t = useTranslations('ui.form');
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="p-5 lg:p-6">
      <div className="flex items-center gap-4">
        {leading}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={titleId} className="text-[1.0625rem] font-semibold text-foreground">{title}</h2>
            <FormBadge tone="required">{t('required')}</FormBadge>
          </div>
          <p className="mt-0.75 text-[0.8125rem] text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className={`mt-5 ${FIELD_GRID}`}>{children}</div>
    </section>
  );
}
