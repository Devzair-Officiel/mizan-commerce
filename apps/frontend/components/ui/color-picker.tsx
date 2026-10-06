'use client';

import { useState } from 'react';
import { HexColorPicker, HexColorInput } from 'react-colorful';
import { BottomSheet } from '@/components/ui/BottomSheet';

interface ColorPickerSheetProps {
  open: boolean;
  onClose: () => void;
  value: string;
  onConfirm: (hex: string) => void;
  title?: string;
}

export function ColorPickerSheet({
  open,
  onClose,
  value,
  onConfirm,
  title,
}: ColorPickerSheetProps) {
  const [draft, setDraft] = useState(value);
  const [prevOpen, setPrevOpen] = useState(open);

  // Reset draft to committed value each time the sheet opens.
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) setDraft(value);
  }

  function handleConfirm() {
    onConfirm(draft);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col items-center gap-4">
        <HexColorPicker
          color={draft}
          onChange={setDraft}
          style={{ width: '100%', height: '200px' }}
        />
        <div className="flex items-center gap-2 w-full">
          <div
            className="h-8 w-8 shrink-0 rounded-full border border-border"
            style={{ backgroundColor: draft }}
          />
          <HexColorInput
            color={draft}
            onChange={setDraft}
            prefixed
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm uppercase tracking-widest text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          onClick={handleConfirm}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity active:opacity-80"
        >
          Appliquer
        </button>
      </div>
    </BottomSheet>
  );
}
