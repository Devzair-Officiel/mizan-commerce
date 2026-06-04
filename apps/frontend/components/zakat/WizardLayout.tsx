'use client';

import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';

export const WIZARD_STEPS = [
  { label: 'Liquidités' },
  { label: 'Créances' },
  { label: 'Stock' },
  { label: 'Exclus' },
  { label: 'Dettes' },
  { label: 'Récap' },
] as const;

export const TOTAL_STEPS = WIZARD_STEPS.length;

interface WizardLayoutProps {
  step: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Texte du bouton principal. Défaut : "Suivant". */
  nextLabel?: string;
  onNext: () => void;
  onPrev?: () => void;
  /** Désactive "Suivant" tant que le formulaire n'est pas valide. */
  canGoNext?: boolean;
  isPending?: boolean;
}

export function WizardLayout({
  step, title, subtitle, children,
  nextLabel = 'Suivant',
  onNext, onPrev, canGoNext = true, isPending = false,
}: WizardLayoutProps) {
  const router = useRouter();

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
            aria-label="Retour"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground tabular-nums">
              Étape {step + 1} sur {TOTAL_STEPS} · {WIZARD_STEPS[step].label}
            </p>
            <div className="flex gap-1">
              {WIZARD_STEPS.map((_, i) => (
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

      {/* Pied : navigation persistante. Sur mobile on remonte au-dessus du FAB "+"
          (BottomNav h-14 + FAB qui dépasse ≈ 74px), sans fond ni bordure pour ne pas
          recouvrir le contenu de l'étape. En desktop le footer est en flux normal. */}
      <footer className="fixed bottom-24 left-0 right-0 z-40 px-4 lg:static lg:bottom-auto lg:px-0 lg:py-3">
        <Button
          onClick={onNext}
          disabled={!canGoNext || isPending}
          className="w-full"
        >
          {isPending ? 'Enregistrement…' : nextLabel}
        </Button>
      </footer>
    </div>
  );
}
