'use client';

import { useTranslations } from 'next-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';

interface CustomerNotesSheetProps {
  open: boolean;
  onClose: () => void;
  notes: string;
}

export function CustomerNotesSheet({ open, onClose, notes }: CustomerNotesSheetProps) {
  const t = useTranslations('customers.notesSheet');
  return (
    <BottomSheet open={open} onClose={onClose} title={t('title')}>
      <p className="text-sm text-foreground leading-relaxed">{notes}</p>
    </BottomSheet>
  );
}
