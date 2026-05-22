'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Home, ChevronRight } from 'lucide-react';
import { BurgerButton } from './BurgerMenu';
import { ThemeToggleButton } from '@/components/ui/ThemeToggle';
import { useSearchOverlay } from './SearchOverlay';

const SEGMENT_LABELS: Record<string, string> = {
  products:  'Produits',
  customers: 'Clients',
  orders:    'Commandes',
  settings:  'Paramètres',
  stock:     'Stock',
  notes:     'Notes',
  reminders: 'Rappels',
  new:       'Nouveau',
  edit:      'Modifier',
  add:       'Entrée',
  out:       'Sortie',
};

function isId(segment: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(segment)
    || /^\d+$/.test(segment);
}

function Breadcrumb() {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

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

  const segments = pathname.split('/').filter(Boolean);

  const crumbs: { label: string; href: string }[] = [
    { label: 'Accueil', href: '/dashboard' },
  ];

  let accumulated = '';
  for (const seg of segments) {
    accumulated += `/${seg}`;
    crumbs.push({
      label: isId(seg) ? '…' : (SEGMENT_LABELS[seg] ?? seg),
      href: accumulated,
    });
  }

  return (
    <div
      ref={ref}
      className="flex items-center gap-3 px-4 border-t border-border/50 overflow-hidden no-scrollbar"
      style={{ opacity: 1, maxHeight: '44px', paddingTop: '10px', paddingBottom: '10px' }}
    >
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        const isHome = i === 0;
        const label = isHome
          ? <span className="flex items-center gap-1.5"><Home size={13} className="-mt-px" />Accueil</span>
          : crumb.label;
        return (
          <div key={crumb.href} className="flex items-center gap-3 shrink-0">
            {i > 0 && <ChevronRight size={16} className="text-muted-foreground/60 shrink-0" />}
            {isLast ? (
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
  action?: React.ReactNode;
  back?: boolean;
  onBack?: () => void;
  titleClassName?: string;
}

export function TopBar({ title, action, back, onBack, titleClassName }: TopBarProps) {
  const router = useRouter();
  const { open: openSearch } = useSearchOverlay();

  return (
    <header
      className="sticky top-0 z-40 flex flex-col border-b border-border backdrop-blur-md"
      style={{ background: 'color-mix(in oklch, var(--card) 85%, transparent)' }}
    >
      <div className="h-14 flex items-center px-4">
        <h1 className={`absolute inset-x-0 text-center font-semibold text-foreground pointer-events-none capitalize ${titleClassName ?? 'text-2xl'}`}>
          {title}
        </h1>

        <div className="relative z-10">
          {back ? (
            <button
              onClick={() => onBack ? onBack() : router.back()}
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
              aria-label="Retour"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="shrink-0 -translate-y-px">
                <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Retour
            </button>
          ) : (
            <BurgerButton />
          )}
        </div>

        <div className="relative z-10 ml-auto flex items-center gap-1">
          {action && action}
          <button
            onClick={openSearch}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Rechercher"
          >
            <Search size={19} />
          </button>
          <ThemeToggleButton />
        </div>
      </div>
      <Breadcrumb />
    </header>
  );
}
