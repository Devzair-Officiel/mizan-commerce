'use client';

import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const [visible, setVisible] = useState(false);
  const [tracked, setTracked] = useState(open);
  const titleId = useId();
  const sheetRef = useFocusTrap<HTMLDivElement>(open);

  if (tracked !== open) {
    setTracked(open);
    if (!open) setVisible(false);
  }

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-70 flex flex-col justify-end"
      style={{
        backdropFilter: visible ? 'blur(4px)' : 'none',
        background: visible ? 'rgba(0,0,0,0.25)' : 'transparent',
        transition: 'background 0.25s ease, backdrop-filter 0.25s ease',
      }}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Panneau'}
        className="flex flex-col rounded-t-3xl bg-card shadow-2xl max-h-[75vh] outline-none"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {title && (
          <p
            id={titleId}
            className="px-5 pt-2 pb-3 font-semibold text-base text-foreground border-b border-border shrink-0"
          >
            {title}
          </p>
        )}

        <div className="px-5 py-4 pb-safe overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
