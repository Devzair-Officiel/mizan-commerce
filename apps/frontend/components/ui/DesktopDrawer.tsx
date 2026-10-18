'use client';

import type { ReactNode, RefObject } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DesktopDrawerProps {
  visible: boolean;
  title?: string;
  description?: string;
  titleId: string;
  sheetRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  closeLabel: string;
  /** Nom accessible du panneau quand il n'a pas de titre. */
  panelLabel: string;
  children: ReactNode;
}

/**
 * Desktop : panneau de 440 px contre le bord de fin (droite en LTR, gauche en RTL), pour lire à côté
 * de la page. Tailwind ne retourne pas translateX en RTL : variante explicite.
 */
export function DesktopDrawer({ visible, title, description, titleId, sheetRef, onClose, closeLabel, panelLabel, children }: DesktopDrawerProps) {
  return (
    <div
      className="fixed inset-0 z-70"
      style={{ background: visible ? 'rgba(0,0,0,0.25)' : 'transparent', transition: 'background 0.25s ease' }}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={title && description ? `${titleId}-desc` : undefined}
        aria-label={title ? undefined : panelLabel}
        className={cn(
          'absolute inset-y-0 inset-e-0 flex w-110 max-w-full flex-col border-s border-border bg-card shadow-2xl outline-none transition-transform duration-300 ease-out motion-reduce:transition-none',
          visible ? 'translate-x-0' : 'translate-x-full rtl:-translate-x-full',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5.5 py-5">
          <div className="min-w-0">
            {title && <h2 id={titleId} className="text-lg font-semibold text-foreground">{title}</h2>}
            {description && <p id={`${titleId}-desc`} className="mt-1 text-[0.8125rem] text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="-me-2.5 -mt-2.5 flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5.5 pt-1.5 pb-5.5">{children}</div>
      </div>
    </div>
  );
}
