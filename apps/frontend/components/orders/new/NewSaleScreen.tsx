'use client';

import { useEffect } from 'react';
import { NewSaleFormDesktop } from '@/components/orders/new/NewSaleFormDesktop';
import { NewSaleFormMobile } from '@/components/orders/new/NewSaleFormMobile';
import { registerDirtyChecker, unregisterDirtyChecker } from '@/lib/dirtyGuard';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import type { NewSaleForm } from '@/lib/hooks/useNewSaleForm';

/** Écran caisse partagé par la création et la modification d'une commande. */
export function NewSaleScreen({ form }: { form: NewSaleForm }) {
  const isDesktop = useIsDesktop();
  const { isDirty } = form;
  useEffect(() => {
    registerDirtyChecker(() => isDirty);
    return unregisterDirtyChecker;
  }, [isDirty]);

  if (isDesktop === true) return <NewSaleFormDesktop form={form} />;
  return <NewSaleFormMobile form={form} />;
}
