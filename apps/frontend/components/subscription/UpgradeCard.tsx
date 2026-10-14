'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

/** Fonctions réservées à une formule (Pro ou Boutique+) pour lesquelles une page ou un onglet est masqué. */
export type UpgradeFeature = 'multi_user' | 'public_pages' | 'ocr' | 'whatsapp' | 'exports';

/** Carte « Disponible avec la formule … », à la place d'une page ou d'un onglet hors formule. */
export function UpgradeCard({ feature }: { feature: UpgradeFeature }) {
  const t = useTranslations('settings.upgrade');

  return (
    <div className="rounded-2xl border border-border bg-card p-6 flex flex-col items-center text-center gap-3">
      <div className="w-12 h-12 rounded-full bg-secondary text-primary flex items-center justify-center">
        <Sparkles size={20} aria-hidden />
      </div>
      <h2 className="text-base font-semibold text-foreground">{t('title', { feature })}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{t('text', { feature })}</p>
      <Link href="/settings/subscription" className={`${buttonVariants({ variant: 'default' })} mt-2 h-11 px-5 active:scale-[0.98]`}>
        {t('cta')}
      </Link>
    </div>
  );
}
