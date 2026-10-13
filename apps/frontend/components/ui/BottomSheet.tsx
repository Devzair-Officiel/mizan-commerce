'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useScrollLock } from '@base-ui/utils/useScrollLock';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Phrase de contexte sous le titre (« Sandales cuir naturel, pointure 41 »). */
  description?: string;
  fullHeight?: boolean;
  /** Pied fixe sous la zone défilante (actions de validation). */
  footer?: ReactNode;
  children: ReactNode;
}

/** Titre et description éventuelle, séparés du contenu par un filet. */
function SheetHeader({ title, description, titleId, className }: {
  title: string; description?: string; titleId: string; className: string;
}) {
  return (
    <div className={`${className} border-b border-border shrink-0`}>
      <p id={titleId} className="font-semibold text-base text-foreground">{title}</p>
      {description && <p id={`${titleId}-desc`} dir="auto" className="mt-0.5 text-[0.8125rem] text-muted-foreground">{description}</p>}
    </div>
  );
}

function SheetFooter({ children }: { children: ReactNode }) {
  return <div className="shrink-0 border-t border-border px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{children}</div>;
}

function DesktopDialog({
  visible,
  title,
  description,
  titleId,
  sheetRef,
  onClose,
  t,
  footer,
  children,
}: {
  visible: boolean;
  title?: string;
  description?: string;
  titleId: string;
  sheetRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  t: ReturnType<typeof useTranslations<'ui'>>;
  footer?: ReactNode;
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
        aria-describedby={title && description ? `${titleId}-desc` : undefined}
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
        {title && <SheetHeader title={title} description={description} titleId={titleId} className="px-5 pt-4 pb-3 pe-12" />}
        <div className="px-5 py-4 overflow-y-auto">
          {children}
        </div>
        {footer && <SheetFooter>{footer}</SheetFooter>}
      </div>
    </div>
  );
}

function MobileSheet({
  visible,
  title,
  description,
  titleId,
  sheetRef,
  onClose,
  fullHeight,
  t,
  footer,
  children,
}: {
  visible: boolean;
  title?: string;
  description?: string;
  titleId: string;
  sheetRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  fullHeight?: boolean;
  t: ReturnType<typeof useTranslations<'ui'>>;
  footer?: ReactNode;
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
        aria-describedby={title && description ? `${titleId}-desc` : undefined}
        aria-label={title ? undefined : t('panel')}
        className={`flex flex-col rounded-t-3xl bg-card shadow-2xl outline-none ${fullHeight ? 'h-[calc(100dvh-56px)]' : 'max-h-[75vh]'}`}
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>
        {title && <SheetHeader title={title} description={description} titleId={titleId} className="px-5 pt-2 pb-3" />}
        <div className={fullHeight
          ? 'flex flex-col flex-1 min-h-0 overflow-hidden'
          : `px-5 py-4 overflow-y-auto ${footer ? '' : 'pb-safe'}`}>
          {children}
        </div>
        {footer && <SheetFooter>{footer}</SheetFooter>}
      </div>
    </div>
  );
}

export function BottomSheet({ open, onClose, title, description, fullHeight, footer, children }: BottomSheetProps) {
  const [visible, setVisible] = useState(false);
  const [tracked, setTracked] = useState(open);
  const titleId = useId();
  const sheetRef = useFocusTrap<HTMLDivElement>(open);
  // Verrou partagé avec les fenêtres et menus Base UI (un seul compteur) : @base-ui/utils doit
  // rester à la version exacte qu'impose @base-ui/react, sinon deux compteurs coexistent.
  useScrollLock(open);
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

  // Portail : un ancêtre avec `backdrop-filter` (barre du haut) ferait du `fixed` un positionnement relatif à lui.
  return createPortal(
    isDesktop === true
      ? <DesktopDialog visible={visible} title={title} description={description} titleId={titleId} sheetRef={sheetRef} onClose={onClose} t={t} footer={footer}>{children}</DesktopDialog>
      : <MobileSheet visible={visible} title={title} description={description} titleId={titleId} sheetRef={sheetRef} onClose={onClose} fullHeight={fullHeight} t={t} footer={footer}>{children}</MobileSheet>,
    document.body,
  );
}
