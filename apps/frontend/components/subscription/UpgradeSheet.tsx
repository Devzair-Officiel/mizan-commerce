'use client';

import type { ReactNode } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { UpgradeCard, type UpgradeFeature } from '@/components/subscription/UpgradeCard';

type UpgradeSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Le geste qui a ouvert la fenêtre (« Télécharger le PDF », « Limite atteinte »). */
  title: string;
  description?: string;
} & (
  | { feature: UpgradeFeature; children?: never }
  /** Contenu propre, à la place de la carte de mise à niveau (choix d'une formule sur la page Abonnement). */
  | { feature?: never; children: ReactNode }
);

/** Fenêtre de mise à niveau, ouverte par le geste sur une fonction verrouillée ou une limite atteinte. */
export function UpgradeSheet({ open, onClose, feature, title, description, children }: UpgradeSheetProps) {
  if (!open) return null;
  return (
    <BottomSheet open onClose={onClose} title={title} description={description}>
      {feature ? <UpgradeCard feature={feature} /> : children}
    </BottomSheet>
  );
}
