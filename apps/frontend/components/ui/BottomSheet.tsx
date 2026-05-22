'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const [visible, setVisible] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

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
        className="flex flex-col rounded-t-3xl bg-card shadow-2xl"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {title && (
          <p className="px-5 pt-2 pb-3 font-semibold text-base text-foreground border-b border-border">
            {title}
          </p>
        )}

        <div className="px-5 py-4 pb-safe">
          {children}
        </div>
      </div>
    </div>
  );
}
