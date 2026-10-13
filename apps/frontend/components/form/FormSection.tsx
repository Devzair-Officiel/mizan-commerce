'use client';

import { useId, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { FormSectionHeading } from './FormSectionHeading';

interface FormSectionProps {
  /** Icône de la carte, dans la pastille de la bande d'en-tête. */
  icon: LucideIcon;
  title: string;
  /** À droite du titre : badge « Obligatoire » ou « Facultatif ». */
  status?: 'required' | 'optional';
  /** À droite du titre, après le statut : liens d'en-tête (cartes non repliables). */
  action?: ReactNode;
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

const BAND_ROW = 'flex w-full items-center gap-3 px-5 py-3.5 text-start';

/**
 * Carte du gabarit de formulaire v3 : bande d'en-tête teintée (icône, titre, statut, liens,
 * explication), puis les champs. Desktop : tout est visible. Mobile : la bande d'une carte
 * facultative est l'en-tête de l'accordéon ; les champs restent montés (valeurs et refs).
 */
export function FormSection({ icon, title, status, action, description, collapse, order, id, children }: FormSectionProps) {
  const uid = useId();
  const heading = { icon, title, status };
  const showSummary = collapse && !collapse.open && collapse.summary !== '';

  return (
    <section id={id} aria-labelledby={`${uid}-title`}
      className={`${order} scroll-mt-20 overflow-hidden rounded-2xl border border-border bg-card`}>
      {collapse && (
        <h2 className={`header-band border-border lg:hidden ${collapse.open ? 'border-b' : ''}`}>
          <button type="button" aria-expanded={collapse.open} aria-controls={`${uid}-panel`} onClick={collapse.onToggle}
            className={`${BAND_ROW} outline-none focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:ring-inset`}>
            <FormSectionHeading {...heading} titleAs="span" open={collapse.open}
              line={showSummary ? collapse.summary : description} summary={showSummary} />
          </button>
        </h2>
      )}
      <div className={`header-band border-b border-border ${BAND_ROW} ${collapse ? 'hidden lg:flex' : ''}`}>
        <FormSectionHeading {...heading} titleAs="h2" titleId={`${uid}-title`} action={action} line={description} />
      </div>
      <div id={`${uid}-panel`} className={`flex flex-col gap-4 p-5 ${collapse && !collapse.open ? 'max-lg:hidden' : ''}`}>
        {children}
      </div>
    </section>
  );
}
