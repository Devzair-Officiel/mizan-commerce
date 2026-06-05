import { BottomSheet } from '@/components/ui/BottomSheet';

interface CustomerNotesSheetProps {
  open: boolean;
  onClose: () => void;
  notes: string;
}

export function CustomerNotesSheet({ open, onClose, notes }: CustomerNotesSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Notes">
      <p className="text-sm text-foreground leading-relaxed">{notes}</p>
    </BottomSheet>
  );
}
