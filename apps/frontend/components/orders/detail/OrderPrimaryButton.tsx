'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { OrderAction } from './useOrderPrimaryAction';

/** Bouton de l'action principale : en-tête desktop (h-10) ou barre flottante mobile (`className`). */
export function OrderPrimaryButton({ action, className }: { action: OrderAction; className?: string }) {
  const Icon = action.icon;
  return (
    <Button onClick={action.onSelect} disabled={action.disabled} className={cn('h-10 rounded-full px-4 font-semibold', className)}>
      <Icon aria-hidden />
      {action.label}
    </Button>
  );
}
