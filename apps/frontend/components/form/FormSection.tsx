'use client';

import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';

interface FormSectionProps {
  title: string;
  /** À droite du titre : badge « Obligatoire » ou mention « Facultatif ». */
  status?: 'required' | 'optional';
  /** Une phrase sous le titre, facultative. */
  description?: string;
  /** Section facultative, repliable sur mobile : repliée, elle montre son résumé (ou son explication si elle est vide). */
  collapse?: { open: boolean; onToggle: () => void; summary: string };
  /** Place de la carte sur mobile, où les deux colonnes s'empilent (`max-lg:order-N`). */
  order: string;
  /** Ancre de la carte (« Gérer les photos » ouvre le formulaire sur la carte Photo). */
  id?: string;
  children: ReactNode;
}

/**
 * Carte du gabarit de formulaire v3. Desktop : titre, statut et explication, champs toujours
 * visibles. Mobile : les cartes facultatives se replient ; les champs restent montés (valeurs et refs).
 */
export function FormSection({ title, status, description, collapse, order, id, children }: FormSectionProps) {
  const t = useTranslations('ui.form');
  const uid = useId();
  const showSummary = collapse && !collapse.open && collapse.summary !== '';
  const line = showSummary ? collapse.summary : description;

  return (
    <section id={id} aria-labelledby={`${uid}-title`}
      className={`${order} scroll-mt-20 rounded-2xl border border-border bg-card ${collapse ? 'lg:p-5' : 'p-5'}`}>
      {collapse && (
        <h2 className="lg:hidden">
          <button type="button" aria-expanded={collapse.open} aria-controls={`${uid}-panel`} onClick={collapse.onToggle}
            className="flex w-full items-center gap-3 rounded-2xl p-5 text-start outline-none focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:ring-inset">
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-[0.9375rem] font-semibold text-foreground">{title}</span>
                <span className="text-xs font-medium text-muted-foreground">{t('optional')}</span>
              </span>
              {line && (
                <span dir={showSummary ? 'auto' : undefined}
                  className={`mt-1 block truncate text-[0.8125rem] ${showSummary ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {line}
                </span>
              )}
            </span>
            <ChevronDown size={18} aria-hidden className={`shrink-0 text-muted-foreground transition-transform ${collapse.open ? 'rotate-180' : ''}`} />
          </button>
        </h2>
      )}
      <div className={collapse ? 'hidden lg:block' : undefined}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 id={`${uid}-title`} className="text-[0.9375rem] font-semibold text-foreground">{title}</h2>
          {status === 'required' && (
            <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-secondary px-2.5 text-xs font-semibold whitespace-nowrap text-secondary-foreground">
              {t('required')}
            </span>
          )}
          {status === 'optional' && <span className="text-xs font-medium text-muted-foreground">{t('optional')}</span>}
        </div>
        {description && <p className="mt-1 text-[0.8125rem] text-muted-foreground">{description}</p>}
      </div>
      <div id={`${uid}-panel`}
        className={`mt-4 flex flex-col gap-4 ${collapse ? `max-lg:mt-0 max-lg:px-5 max-lg:pb-5 ${collapse.open ? '' : 'max-lg:hidden'}` : ''}`}>
        {children}
      </div>
    </section>
  );
}
