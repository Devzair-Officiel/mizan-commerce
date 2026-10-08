'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { BurgerButton } from './BurgerMenu';
import { useSearchOverlay, DesktopSearchPopover } from './SearchOverlay';


interface TopBarProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  back?: boolean;
  backLabel?: string;
  onBack?: () => void;
  titleClassName?: string;
  hideSearch?: boolean;
}

function TopBarBackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      aria-label={label}
    >
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="shrink-0 -translate-y-px rtl:rotate-180">
        <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      {label}
    </button>
  );
}

function TopBarBackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-muted transition-colors"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="rtl:rotate-180">
        <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}

function TopBarDesktopSearch() {
  const tc = useTranslations('layout.common');
  const { isOpen, open, close, anchorRef, setDesktopSearchActive } = useSearchOverlay();
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
  const hint = isMac ? '⌘K' : 'Ctrl K';

  useEffect(() => {
    setDesktopSearchActive(true);
    return () => setDesktopSearchActive(false);
  }, [setDesktopSearchActive]);

  return (
    <div
      ref={anchorRef as React.RefObject<HTMLDivElement>}
      className="hidden lg:block relative"
    >
      {!isOpen ? (
        <button
          onClick={open}
          aria-label={tc('search')}
          className="flex items-center h-11 w-80 rounded-full gap-3 px-4 bg-card border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          <Search size={16} className="shrink-0" aria-hidden />
          <span className="flex-1 text-start">{tc('search')}</span>
          <span className="text-xs bg-muted rounded px-1.5 py-0.5 font-mono">{hint}</span>
        </button>
      ) : (
        <div className="h-11 w-80 rounded-full flex items-center px-4 bg-card border border-primary">
          <Search size={16} className="shrink-0 text-muted-foreground me-3" aria-hidden />
          <span className="flex-1 text-sm text-muted-foreground">{tc('search')}</span>
        </div>
      )}
      {isOpen && <DesktopSearchPopover onClose={close} anchorRef={anchorRef} />}
    </div>
  );
}

export function TopBar({ title, subtitle, action, back, backLabel, onBack, titleClassName, hideSearch }: TopBarProps) {
  const tc = useTranslations('layout.common');
  const router = useRouter();
  const { open: openSearch } = useSearchOverlay();

  const handleBack = () => (onBack ? onBack() : router.back());
  const backText = backLabel ?? tc('back');
  // Mobile search button always opens the fullscreen overlay

  return (
    <header
      className="sticky top-0 z-40 flex flex-col border-b border-border backdrop-blur-md bg-card/85 lg:static lg:border-b-0 lg:backdrop-blur-none lg:bg-transparent"
    >
      {/* Desktop back link — row above title, large screens only */}
      {back && (
        <div className="hidden lg:block px-4 pt-2 pb-0">
          <TopBarBackLink onClick={handleBack} label={backText} />
        </div>
      )}

      {/* Main row */}
      <div className="h-14 flex items-center px-4 gap-2 lg:h-auto lg:pb-8 lg:items-end">
        {/* Left slot — mobile only */}
        <div className="shrink-0 lg:hidden">
          {back ? (
            <TopBarBackButton onClick={handleBack} label={backText} />
          ) : (
            <BurgerButton />
          )}
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0 flex flex-col">
          <h1
            className={`min-w-0 text-start font-semibold text-foreground truncate lg:text-[28px] lg:tracking-tight ${titleClassName ?? 'text-xl'}`}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-[0.8125rem] text-muted-foreground mt-0.5 truncate">{subtitle}</p>
          )}
        </div>

        {/* Right actions */}
        <div className="shrink-0 flex items-center gap-1 lg:gap-3 lg:mb-1">
          {action}
          {/* Desktop search — hidden on pages that use hideSearch; Ctrl+K still works via SearchProvider */}
          {!hideSearch && <TopBarDesktopSearch />}
          {/* Mobile search button — always visible unless hideSearch */}
          {!hideSearch && (
            <button
              onClick={openSearch}
              className="lg:hidden flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label={tc('search')}
            >
              <Search size={19} />
            </button>
          )}
        </div>
      </div>

    </header>
  );
}
