import Link from 'next/link';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Actions de l'en-tête du stock : « Sortie de stock » (contour) et « Entrée de
 * stock » (principale). Sur mobile, l'entrée seule, en bouton icône de 44px.
 */
export function StockHeaderActions() {
  const t = useTranslations('stock.page');
  return (
    <div className="flex items-center gap-2">
      <Link href="/stock/sortie" className={cn(buttonVariants({ variant: 'outline' }), 'hidden h-10 rounded-full px-4 text-sm lg:inline-flex')}>
        <ArrowUpFromLine aria-hidden />
        {t('exit_cta')}
      </Link>
      <Link href="/stock/entree" className={cn(buttonVariants(), 'hidden h-10 rounded-full px-4 text-sm font-semibold lg:inline-flex')}>
        <ArrowDownToLine aria-hidden />
        {t('entry_cta')}
      </Link>
      <Link href="/stock/sortie" aria-label={t('exit_cta')}
        className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'size-11 rounded-full lg:hidden')}>
        <ArrowUpFromLine className="size-5" aria-hidden />
      </Link>
      <Link href="/stock/entree" aria-label={t('entry_cta')}
        className={cn(buttonVariants({ size: 'icon' }), 'size-11 rounded-full lg:hidden')}>
        <ArrowDownToLine className="size-5" aria-hidden />
      </Link>
    </div>
  );
}
