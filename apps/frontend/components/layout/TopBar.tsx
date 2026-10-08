'use client';

import { Suspense, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, Home, ChevronRight } from 'lucide-react';
import { BurgerButton } from './BurgerMenu';
import { useSearchOverlay, DesktopSearchPopover } from './SearchOverlay';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import type { CatalogKind } from '@/lib/hooks/useMe';

type BreadcrumbSegment =
  | 'products' | 'customers' | 'orders' | 'settings' | 'stock'
  | 'notes'    | 'reminders' | 'new'    | 'edit'     | 'add' | 'out';

const KNOWN_SEGMENTS: ReadonlySet<string> = new Set([
  'products', 'customers', 'orders', 'settings', 'stock',
  'notes', 'reminders', 'new', 'edit', 'add', 'out',
]);

type ContextualResource = 'orders' | 'customers' | 'products';
type ContextualAction   = 'new' | 'edit';

function isContextualResource(seg: string): seg is ContextualResource {
  return seg === 'orders' || seg === 'customers' || seg === 'products';
}
function isContextualAction(seg: string): seg is ContextualAction {
  return seg === 'new' || seg === 'edit';
}

function isId(segment: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(segment)
    || /^\d+$/.test(segment);
}

function Breadcrumb() {
  const t = useTranslations('layout.breadcrumb');
  const tc = useTranslations('layout.common');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawFrom = searchParams.get('from');
  const fromPath = rawFrom && rawFrom.startsWith('/') && !rawFrom.startsWith('//') ? rawFrom : null;
  const ref = useRef<HTMLDivElement>(null);
  const kind = useCatalogKind();

  function segmentLabel(seg: string): string {
    if (!KNOWN_SEGMENTS.has(seg)) return seg;
    const s = seg as BreadcrumbSegment;
    if (s === 'products') return t('products', { kind });
    return t(s);
  }

  function getContextualLabel(resource: ContextualResource, action: ContextualAction): string {
    if (resource === 'products') {
      return action === 'new' ? t('products_new', { kind }) : t('products_edit', { kind });
    }
    if (resource === 'orders') {
      return action === 'new' ? t('orders_new') : t('orders_edit');
    }
    return action === 'new' ? t('customers_new') : t('customers_edit');
  }

  useEffect(() => {
    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!ref.current) return;
        const ratio = Math.min(1, window.scrollY / 60);
        const inv = 1 - ratio;
        ref.current.style.opacity = String(inv);
        ref.current.style.maxHeight = `${inv * 44}px`;
        ref.current.style.paddingTop = `${inv * 10}px`;
        ref.current.style.paddingBottom = `${inv * 10}px`;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  if (pathname === '/dashboard') return null;

  const crumbs: { label: string; href: string }[] = [
    { label: tc('home'), href: '/dashboard' },
  ];

  function pushCategoryCrumbs(segments: string[]) {
    let acc = '';
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg === undefined) continue;
      acc += `/${seg}`;
      if (isId(seg)) continue;
      let href = acc;
      const nextSeg = i + 1 < segments.length ? segments[i + 1] : null;
      if (nextSeg && isId(nextSeg)) {
        const detailHref = `${acc}/${nextSeg}`;
        if (detailHref !== pathname) href = detailHref;
      }
      crumbs.push({ label: segmentLabel(seg), href });
    }
  }

  const currentSegments = pathname.split('/').filter(Boolean);
  const lastSeg = currentSegments[currentSegments.length - 1];
  const resourceSeg = currentSegments[0];
  const contextualLabel = fromPath && resourceSeg && lastSeg
    && isContextualResource(resourceSeg) && isContextualAction(lastSeg)
    ? getContextualLabel(resourceSeg, lastSeg)
    : undefined;

  if (fromPath) pushCategoryCrumbs(fromPath.split('/').filter(Boolean));
  if (contextualLabel) {
    crumbs.push({ label: contextualLabel, href: pathname });
  } else {
    pushCategoryCrumbs(currentSegments);
  }

  return (
    <div
      ref={ref}
      className="flex items-center gap-3 px-4 border-t border-border/50 overflow-hidden no-scrollbar"
      style={{ opacity: 1, maxHeight: '44px', paddingTop: '10px', paddingBottom: '10px' }}
    >
      {crumbs.map((crumb, i) => {
        const isHome = i === 0;
        const isCurrent = crumb.href === pathname;
        const label = isHome
          ? <span className="flex items-center gap-1.5"><Home size={13} className="-mt-px" />{tc('home')}</span>
          : crumb.label;
        return (
          <div key={`${crumb.href}-${i}`} className="flex items-center gap-3 shrink-0">
            {i > 0 && <ChevronRight size={16} className="text-muted-foreground/60 shrink-0 rtl:rotate-180" />}
            {isCurrent ? (
              <span className="text-sm font-semibold tracking-[0.12em] text-foreground">{label}</span>
            ) : (
              <Link href={crumb.href} className="text-sm tracking-[0.12em] text-muted-foreground hover:text-foreground transition-colors">
                {label}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}

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

function TopBarDesktopSearch() {
  const tc = useTranslations('layout.common');
  const { isOpen, open, close, anchorRef } = useSearchOverlay();
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
  const hint = isMac ? '⌘K' : 'Ctrl K';

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
            <TopBarBackLink onClick={handleBack} label={backText} />
          ) : (
            <BurgerButton />
          )}
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0 lg:flex lg:flex-col">
          <h1
            className={`min-w-0 text-center font-semibold text-foreground pointer-events-none truncate lg:text-start lg:text-[28px] lg:tracking-tight lg:pointer-events-auto ${titleClassName ?? 'text-2xl'}`}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="hidden lg:block text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>
          )}
        </div>

        {/* Right actions */}
        <div className="shrink-0 flex items-center gap-1 lg:gap-3 lg:mb-1">
          {action}
          {/* Desktop search — always mounted, hides/shows via CSS in the component */}
          <TopBarDesktopSearch />
          {/* Mobile search button — always visible unless hideSearch */}
          {!hideSearch && (
            <button
              onClick={openSearch}
              className="lg:hidden flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label={tc('search')}
            >
              <Search size={19} />
            </button>
          )}
        </div>
      </div>

      {/* Breadcrumb — mobile only */}
      <div className="lg:hidden">
        {/* Suspense requis : Breadcrumb utilise useSearchParams, sinon le build statique échoue */}
        <Suspense fallback={null}>
          <Breadcrumb />
        </Suspense>
      </div>
    </header>
  );
}
