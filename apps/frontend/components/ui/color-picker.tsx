'use client';

import { useState } from 'react';
import { HexColorPicker, HexColorInput } from 'react-colorful';
import { BottomSheet } from '@/components/ui/BottomSheet';

interface ColorPickerSheetProps {
  open: boolean;
  onClose: () => void;
  value: string;
  onConfirm: (hex: string) => Promise<void>;
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset draft and error each time the sheet opens.
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setDraft(value);
      setError(null);
    }
  }

  function safeOnClose() {
    if (!busy) onClose();
  }

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(draft);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={safeOnClose} title={title}>
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
        {error && (
          <p className="w-full text-sm text-destructive">{error}</p>
        )}
        <button
          onClick={handleConfirm}
          disabled={busy}
          className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity active:opacity-80 disabled:opacity-50"
        >
          {busy ? '…' : 'Appliquer'}
        </button>
      </div>
    </BottomSheet>
  );
}
