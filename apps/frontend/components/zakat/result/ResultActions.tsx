'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FloatingActionBar } from '@/components/layout/FloatingActionBar';
import { Button } from '@/components/ui/button';

interface ResultActionsProps {
  onPrevious: () => void;
  onForgot: () => void;
}

/** Desktop : « Précédent » et « Ajouter un élément oublié » ; mobile : « Un oubli ? » au-dessus de la barre du bas. */
export function ResultActions({ onPrevious, onForgot }: ResultActionsProps) {
  const t = useTranslations('zakat');
  return (
    <>
      <div className="hidden items-center justify-between gap-2 lg:flex">
        <Button type="button" variant="ghost" onClick={onPrevious} className="h-11 rounded-full px-5 text-sm font-semibold text-muted-foreground">
          {t('wizard.previous')}
        </Button>
        <Button type="button" variant="outline" onClick={onForgot} aria-haspopup="dialog" className="h-11 gap-2 rounded-full px-5 text-sm font-semibold">
          <Plus aria-hidden />
          {t('result.forgot')}
        </Button>
      </div>
      <FloatingActionBar variant="button">
        <button type="button" onClick={onForgot} aria-haspopup="dialog"
          className="flex h-12 w-full items-center justify-center gap-1.5 rounded-full border border-border bg-card text-[0.9375rem] font-semibold text-primary shadow-lg outline-none transition-all active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-primary/30">
          <Plus className="size-4" aria-hidden />
          {t('result.forgot_short')}
        </button>
      </FloatingActionBar>
    </>
  );
}
