'use client';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { UpgradeCard, type UpgradeFeature } from '@/components/subscription/UpgradeCard';

interface UpgradeSheetProps {
  open: boolean;
  onClose: () => void;
  feature: UpgradeFeature;
  /** Le geste qui a ouvert la fenêtre (« Télécharger le PDF », « Limite atteinte »). */
  title: string;
  description?: string;
}

/** Fenêtre de mise à niveau, ouverte par le geste sur une fonction verrouillée ou une limite atteinte. */
export function UpgradeSheet({ open, onClose, feature, title, description }: UpgradeSheetProps) {
  if (!open) return null;
  return (
    <BottomSheet open onClose={onClose} title={title} description={description}>
      <UpgradeCard feature={feature} />
    </BottomSheet>
  );
}
