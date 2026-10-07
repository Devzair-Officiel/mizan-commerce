'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

function DesktopDialog({
  visible,
  title,
  titleId,
  sheetRef,
  onClose,
  t,
  children,
}: {
  visible: boolean;
  title?: string;
  titleId: string;
  sheetRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  t: ReturnType<typeof useTranslations<'ui'>>;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center"
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
        aria-label={title ? undefined : t('panel')}
        className="relative flex flex-col w-full max-w-lg rounded-2xl bg-card shadow-2xl max-h-[85vh] overflow-y-auto outline-none"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.95)',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label={t('close')}
          onClick={onClose}
          className="absolute top-3 right-3 z-10 rounded-full w-8 h-8 flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X size={16} />
        </button>
        {title && (
          <p
            id={titleId}
            className="px-5 pt-4 pb-3 font-semibold text-base text-foreground border-b border-border shrink-0"
          >
            {title}
          </p>
        )}
        <div className="px-5 py-4 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

function MobileSheet({
  visible,
  title,
  titleId,
  sheetRef,
  onClose,
  t,
  children,
}: {
  visible: boolean;
  title?: string;
  titleId: string;
  sheetRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  t: ReturnType<typeof useTranslations<'ui'>>;
  children: ReactNode;
}) {
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
        aria-label={title ? undefined : t('panel')}
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

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const [visible, setVisible] = useState(false);
  const [tracked, setTracked] = useState(open);
  const titleId = useId();
  const sheetRef = useFocusTrap<HTMLDivElement>(open);
  const isDesktop = useIsDesktop();
  const triggerRef = useRef<Element | null>(null);
  const t = useTranslations('ui');

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

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
    } else if (triggerRef.current instanceof HTMLElement) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [open]);

  if (!open) return null;

  if (isDesktop === true) {
    return <DesktopDialog visible={visible} title={title} titleId={titleId} sheetRef={sheetRef} onClose={onClose} t={t}>{children}</DesktopDialog>;
  }
  return <MobileSheet visible={visible} title={title} titleId={titleId} sheetRef={sheetRef} onClose={onClose} t={t}>{children}</MobileSheet>;
}
