'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, type LucideIcon } from 'lucide-react';

interface FormSectionHeadingProps {
  icon: LucideIcon;
  title: string;
  /** `h2` dans la bande fixe ; texte dans la bande-bouton de l'accordéon (déjà dans un `<h2>`). */
  titleAs: 'h2' | 'span';
  titleId?: string;
  status?: 'required' | 'optional';
  /** Liens d'en-tête, à droite du titre (bande fixe seulement : pas de lien dans un bouton). */
  action?: ReactNode;
  /** Sous le titre : explication, ou résumé du contenu (`summary`, texte saisi). */
  line?: string;
  summary?: boolean;
  /** Accordéon : chevron, tourné quand la carte est ouverte. */
  open?: boolean;
}

/** Contenu de la bande d'en-tête d'une carte de formulaire : icône, titre, statut, liens, phrase. */
export function FormSectionHeading({ icon: Icon, title, titleAs: Title, titleId, status, action, line, summary, open }: FormSectionHeadingProps) {
  const t = useTranslations('ui.form');
  const toggle = open !== undefined;
  return (
    <>
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[0.625rem] bg-card text-primary shadow-xs">
        <Icon size={18} strokeWidth={1.75} />
      </span>
      <span className="block min-w-0 flex-1">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <Title id={titleId} className="text-[1.0625rem] font-semibold text-foreground">{title}</Title>
          {(status || action) && (
            <span className="flex flex-wrap items-center gap-3">
              {status === 'required' && (
                <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-secondary px-2.5 text-xs font-semibold whitespace-nowrap text-secondary-foreground">
                  {t('required')}
                </span>
              )}
              {status === 'optional' && (
                <span className="inline-flex h-5.5 shrink-0 items-center rounded-full border border-border bg-card px-2 text-[0.6875rem] font-semibold whitespace-nowrap text-muted-foreground">
                  {t('optional')}
                </span>
              )}
              {action}
            </span>
          )}
        </span>
        {line && (
          <span dir={summary ? 'auto' : undefined}
            className={`mt-0.75 block text-[0.8125rem] leading-[1.45] ${toggle ? 'truncate' : ''} ${summary ? 'text-foreground' : 'text-muted-foreground'}`}>
            {line}
          </span>
        )}
      </span>
      {toggle && <ChevronDown size={18} aria-hidden className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />}
    </>
  );
}
