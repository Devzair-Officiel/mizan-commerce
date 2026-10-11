'use client';

import { useTranslations } from 'next-intl';
import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { FloatingActionBar } from '@/components/layout/FloatingActionBar';
import type { ReactNode } from 'react';

import { STEP_KEYS } from './wizard/types';

export const TOTAL_STEPS = STEP_KEYS.length;

interface WizardLayoutProps {
  step: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Texte du bouton principal. Défaut : « Suivant ». */
  nextLabel?: string;
  onNext: () => void;
  onPrev?: () => void;
  /** Désactive "Suivant" tant que le formulaire n'est pas valide. */
  canGoNext?: boolean;
  isPending?: boolean;
}

export function WizardLayout({
  step, title, subtitle, children,
  nextLabel,
  onNext, onPrev, canGoNext = true, isPending = false,
}: WizardLayoutProps) {
  const t = useTranslations('zakat.wizard');
  const router = useRouter();
  const stepKey = STEP_KEYS[step];
  const buttonLabel = isPending ? t('saving') : (nextLabel ?? t('next'));

  return (
    // pb généreux pour que le contenu puisse scroller au-delà du footer wizard + BottomNav globale.
    <div className="flex flex-col min-h-screen pb-44 lg:pb-24">
      {/* En-tête : flèche retour + barre de progression compacte */}
      <header className="sticky top-0 z-20 bg-background border-b border-border">
        <div className="flex items-center gap-2 px-3 py-3">
          <button
            type="button"
            onClick={() => (onPrev ? onPrev() : router.push('/zakat'))}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('back')}
          >
            <ChevronLeft size={20} className="rtl:rotate-180" />
          </button>
          <div className="flex-1 flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground tabular-nums">
              {t('progress', { step: step + 1, total: TOTAL_STEPS, label: stepKey ? t(`short.${stepKey}`) : '' })}
            </p>
            <div className="flex gap-1">
              {STEP_KEYS.map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 h-1 rounded-full transition-colors ${
                    i <= step ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Contenu de l'étape */}
      <main className="flex-1 flex flex-col gap-4 px-4 py-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </main>

      <footer className="hidden lg:block lg:py-3">
        <Button onClick={onNext} disabled={!canGoNext || isPending} className="w-full">
          {buttonLabel}
        </Button>
      </footer>
      <FloatingActionBar variant="button">
        <Button onClick={onNext} disabled={!canGoNext || isPending} className="w-full h-12 rounded-full shadow-lg">
          {buttonLabel}
        </Button>
      </FloatingActionBar>
    </div>
  );
}
