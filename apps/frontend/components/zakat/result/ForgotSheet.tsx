'use client';

import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { StepLink } from '../wizard/StepLink';

/** Étapes de saisie : Trésorerie, Stock, Créances, Autres biens, Dettes. */
const ENTRY_STEPS = [1, 2, 3, 4, 5] as const;

interface ForgotSheetProps {
  id: string;
  onGo: (step: number) => void;
  onClose: () => void;
}

/** « Un oubli ? » : ouvre directement l'étape concernée, sans repasser par tout l'assistant. */
export function ForgotSheet({ id, onGo, onClose }: ForgotSheetProps) {
  const t = useTranslations('zakat');
  return (
    <BottomSheet open onClose={onClose} title={t('result.forgot_title')}>
      <ul className="-mx-5 -my-4">
        {ENTRY_STEPS.map((step) => (
          <li key={step} className="border-b border-border last:border-b-0">
            <StepLink id={id} step={step} onGo={onGo}
              className="flex min-h-13 items-center justify-between gap-3 px-5 text-[0.9375rem] font-medium text-foreground outline-none hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:ring-inset">
              {t(`wizard.step.${step}`)}
              <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
            </StepLink>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
