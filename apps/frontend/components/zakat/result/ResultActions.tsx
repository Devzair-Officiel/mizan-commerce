'use client';

import { Download, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FloatingActionBar } from '@/components/layout/FloatingActionBar';
import { Button, buttonVariants } from '@/components/ui/button';
import { zakatPdfHref } from '@/lib/hooks/useZakat';
import { cn } from '@/lib/utils';

interface ResultActionsProps {
  id: string;
  onPrevious: () => void;
  onForgot: () => void;
}

const FOCUS = 'outline-none focus-visible:ring-3 focus-visible:ring-primary/30';

/** Desktop : « Précédent », « Ajouter un élément oublié » et le justificatif ; mobile : « Un oubli ? » et « Justificatif PDF » au-dessus de la barre du bas. */
export function ResultActions({ id, onPrevious, onForgot }: ResultActionsProps) {
  const t = useTranslations('zakat');
  return (
    <>
      <div className="hidden items-center justify-between gap-2 lg:flex">
        <Button type="button" variant="ghost" onClick={onPrevious} className="h-11 rounded-full px-5 text-sm font-semibold text-muted-foreground">
          {t('wizard.previous')}
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onForgot} aria-haspopup="dialog" className="h-11 gap-2 rounded-full px-5 text-sm font-semibold">
            <Plus aria-hidden />
            {t('result.forgot')}
          </Button>
          <a href={zakatPdfHref(id)} download className={cn(buttonVariants(), 'h-11 gap-2 rounded-full px-5 text-sm font-semibold')}>
            <Download aria-hidden />
            {t('result.pdf')}
          </a>
        </div>
      </div>
      <FloatingActionBar variant="button">
        <div className="flex gap-2.5">
          <button type="button" onClick={onForgot} aria-haspopup="dialog"
            className={cn('flex h-12 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-semibold text-primary shadow-lg transition-all active:scale-[0.98]', FOCUS)}>
            <Plus className="size-4" aria-hidden />
            {t('result.forgot_short')}
          </button>
          <a href={zakatPdfHref(id)} download
            className={cn('flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-[0.9375rem] font-semibold text-primary-foreground shadow-lg transition-all active:scale-[0.98]', FOCUS)}>
            <Download className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{t('result.pdf_short')}</span>
          </a>
        </div>
      </FloatingActionBar>
    </>
  );
}
