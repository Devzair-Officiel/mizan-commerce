'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { BasisChoices, BasisView } from './basisCatalog';
import { BasisIndex } from './BasisIndex';
import { BasisTopicView } from './BasisTopicView';

interface BasisSheetProps {
  view: BasisView | null;
  choices: BasisChoices;
  onView: (view: BasisView) => void;
  onClose: () => void;
}

/** Tiroir de 440 px (desktop) ou feuille du bas (mobile) : la liste des fiches, ou une fiche avec son retour. */
export function BasisSheet({ view, choices, onView, onClose }: BasisSheetProps) {
  const t = useTranslations('zakat.basis');
  const bodyRef = useRef<HTMLDivElement>(null);
  const index = view === 'index';

  function show(next: BasisView) {
    // Retour à la liste : sur la fiche quittée ; vers une fiche : sur son retour.
    const target = next === 'index' ? `[data-topic="${view}"]` : '[data-basis-back]';
    onView(next);
    requestAnimationFrame(() => bodyRef.current?.querySelector<HTMLElement>(target)?.focus());
  }

  return (
    <BottomSheet
      open={view !== null}
      onClose={onClose}
      desktop="drawer"
      title={view === null ? undefined : t(index ? 'index_title' : `topic.${view}.title`)}
      description={t(index ? 'index_subtitle' : 'subtitle')}
    >
      <div ref={bodyRef}>
        {index && <BasisIndex onOpen={show} />}
        {view !== null && !index && <BasisTopicView topic={view} choices={choices} onBack={() => show('index')} />}
        <p className="mt-1 border-t border-border pt-4 text-[0.8125rem] leading-normal text-muted-foreground">{t('ask')}</p>
      </div>
    </BottomSheet>
  );
}
