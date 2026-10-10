'use client';

import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { FormBadge } from './FormBadge';
import { FIELD_GRID } from './fieldStyles';

interface FormCollapsibleSectionProps {
  title: string;
  /** Une phrase qui dit à quoi servent les champs. */
  description: string;
  /** Contenu de la section en une ligne, affiché quand elle est repliée et remplie. */
  summary: string;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/**
 * Section facultative repliable (accordéon). Repliée, elle montre son résumé, ou son explication
 * si elle est vide. Les champs restent montés (`hidden`) : leurs valeurs et leurs refs survivent.
 */
export function FormCollapsibleSection({ title, description, summary, icon, open, onToggle, children }: FormCollapsibleSectionProps) {
  const t = useTranslations('ui.form');
  const id = useId();
  const showSummary = !open && summary !== '';

  return (
    <div className="group/section">
      <h3>
        <button type="button" id={`${id}-button`} aria-expanded={open} aria-controls={`${id}-panel`} onClick={onToggle}
          className="flex w-full items-center gap-4 px-5 py-4.5 text-start outline-none focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:ring-inset group-last/section:aria-[expanded=false]:rounded-b-2xl lg:px-6">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground" aria-hidden>{icon}</span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[0.9375rem] font-semibold text-foreground">{title}</span>
              <FormBadge tone="optional">{t('optional')}</FormBadge>
            </span>
            <span dir={showSummary ? 'auto' : undefined}
              className={`mt-0.75 block truncate text-[0.8125rem] ${showSummary ? 'text-foreground' : 'text-muted-foreground'}`}>
              {showSummary ? summary : description}
            </span>
          </span>
          <ChevronDown size={18} aria-hidden className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </h3>
      <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-button`} hidden={!open}
        className="px-5 pb-5 sm:ps-19 lg:ps-20 lg:pe-6 lg:pb-6">
        <div className={FIELD_GRID}>{children}</div>
      </div>
    </div>
  );
}
