'use client';

import Image from 'next/image';

interface MenuHeaderProps {
  logoUrl?: string | null;
  displayName: string;
  subtitle: string;
  onClose: () => void;
  closeLabel: string;
}

export function MenuHeader({ logoUrl, displayName, subtitle, onClose, closeLabel }: MenuHeaderProps) {
  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-2.5 px-4 border-b border-border bg-background"
      style={{
        paddingTop: 'calc(0.875rem + env(safe-area-inset-top, 0px))',
        paddingBottom: '0.875rem',
      }}
    >
      <div className="h-10 w-10 flex-none rounded-xl bg-primary text-primary-foreground flex items-center justify-center text-[1.0625rem] font-bold shrink-0 overflow-hidden">
        {logoUrl
          ? <Image src={logoUrl} alt={displayName} width={40} height={40} unoptimized className="h-10 w-10 object-cover" />
          : 'M'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-base font-bold text-foreground leading-tight truncate">{displayName}</div>
        {subtitle && <div className="text-[0.8125rem] text-muted-foreground truncate mt-0.5">{subtitle}</div>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="h-11 w-11 flex items-center justify-center rounded-full text-foreground hover:bg-muted transition-colors shrink-0"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}
