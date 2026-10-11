import Image from 'next/image';
import { Sparkles } from 'lucide-react';
import type { Product } from '@/lib/hooks/useProducts';
import { cn } from '@/lib/utils';

const THUMB_COLORS = [
  'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  'bg-primary/15 text-primary',
];

function thumbColor(name: string): string {
  const code = name.charCodeAt(0) + (name.charCodeAt(1) || 0);
  return THUMB_COLORS[code % THUMB_COLORS.length] ?? '';
}

/**
 * Vignette d'un article dans les listes : sa photo, sinon l'initiale sur une
 * couleur tirée du nom ; une étincelle pour un service sans photo.
 * Décorative : le nom est toujours affiché à côté.
 */
export function ProductThumb({ product, className }: { product: Product; className?: string }) {
  const box = cn('flex shrink-0 items-center justify-center rounded-xl', className);
  if (product.primary_image) {
    return (
      <Image src={product.primary_image} alt="" width={44} height={44} unoptimized
        className={cn(box, 'object-cover ring-1 ring-border')} />
    );
  }
  if (product.type === 'service') {
    return <span aria-hidden className={cn(box, 'bg-primary/10 text-primary')}><Sparkles className="size-4.5" /></span>;
  }
  return (
    <span aria-hidden className={cn(box, 'font-bold', thumbColor(product.name))}>
      {product.name.trim()[0]?.toUpperCase() ?? '?'}
    </span>
  );
}
