'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { UserPlus, ClipboardPlus, Package, PackagePlus, Users } from 'lucide-react';

// Type d'icône suffisamment large pour accepter à la fois les SVG locaux
// (className seul) et les composants lucide-react (qui prennent strokeWidth).
type IconLike = React.ComponentType<{ className?: string; strokeWidth?: number }>;

type NavItemDef = {
  href: string;
  labelKey: 'dashboard' | 'customers' | 'orders' | 'products';
  icon: IconLike;
};

const LEFT_ITEMS: readonly NavItemDef[] = [
  { href: '/dashboard', labelKey: 'dashboard', icon: HomeIcon },
  { href: '/customers', labelKey: 'customers', icon: Users },
];

const RIGHT_ITEMS: readonly NavItemDef[] = [
  { href: '/orders', labelKey: 'orders', icon: ShoppingBagIcon },
  { href: '/products', labelKey: 'products', icon: Package },
];

type QuickActionKey = 'new_customer' | 'new_order' | 'new_product';

/* Positions en arc autour du + — les icônes sortent de derrière le + */
const QUICK_ACTIONS: ReadonlyArray<{
  href: string;
  labelKey: QuickActionKey;
  icon: IconLike;
  x: number;
  y: number;
}> = [
  { href: '/customers/new', labelKey: 'new_customer', icon: UserPlus,      x: -88, y: -62 },
  { href: '/orders/new',    labelKey: 'new_order',    icon: ClipboardPlus, x: 0,   y: -106 },
  { href: '/products/new',  labelKey: 'new_product',  icon: PackagePlus,   x: 88,  y: -62 },
];

export function BottomNav() {
  const tNav = useTranslations('layout.nav');
  const tBottom = useTranslations('layout.bottomNav');
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  /* Fermeture sur Escape + verrouillage du scroll du body tant que le menu est ouvert */
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  return (
    <>
      {/* Overlay assombrissant le fond */}
      <div
        onClick={() => setMenuOpen(false)}
        className={`lg:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${
          menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Conteneur ancré au bouton + : actions en arc + bouton central */}
      <div className="lg:hidden fixed bottom-4 left-1/2 z-60 -translate-x-1/2">
        <div className="relative h-14.5 w-14.5">
          {/* Actions — glissent depuis derrière le + vers leur position en arc */}
          {QUICK_ACTIONS.map(({ href, labelKey, icon: Icon, x, y }, i) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              aria-label={tBottom(labelKey)}
              aria-hidden={!menuOpen}
              tabIndex={menuOpen ? 0 : -1}
              className={`absolute top-1/2 left-1/2 flex items-center justify-center h-14.5 w-14.5 rounded-full bg-card ring-1 ring-primary/15 active:scale-95 ${
                menuOpen ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
              style={{
                transform: menuOpen
                  ? `translate(-50%, -50%) translate(${x}px, ${y}px)`
                  : 'translate(-50%, -50%)',
                opacity: menuOpen ? 1 : 0,
                boxShadow:
                  '0 10px 24px -6px rgba(0,0,0,0.30), 0 4px 8px -2px rgba(0,0,0,0.14), inset 0 0 0 1px rgba(255,255,255,0.04)',
                transition: `transform 220ms cubic-bezier(0.22, 1, 0.36, 1) ${
                  menuOpen ? i * 25 : (QUICK_ACTIONS.length - 1 - i) * 20
                }ms, opacity 120ms ease-out ${menuOpen ? i * 25 : 0}ms`,
              }}
            >
              <Icon className="h-7 w-7 text-primary" strokeWidth={2} />
            </Link>
          ))}

          {/* Bouton + central — toggle des actions rapides */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="absolute inset-0 flex items-center justify-center rounded-full shadow-xl active:scale-95 transition-transform overflow-hidden"
            style={{
              background: 'linear-gradient(171deg, color-mix(in oklch, oklch(0.72 0.14 121.33) 65%, white 35%), color-mix(in oklch, var(--primary) 90%, #000000bf 10%))',
            }}
            aria-label={menuOpen ? tBottom('close_menu') : tBottom('quick_actions')}
            aria-expanded={menuOpen}
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="transition-transform duration-300"
              style={{ transform: menuOpen ? 'rotate(135deg)' : 'rotate(0deg)' }}
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>

      {/* Barre de navigation */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 rounded-t-[28px] shadow-[0_-6px_24px_rgba(0,0,0,0.18)]"
        style={{ background: 'var(--primary)' }}
      >
        <div className="flex h-14 items-center justify-around px-2">
          {LEFT_ITEMS.map(({ href, labelKey, icon: Icon }) => (
            <NavItem key={href} href={href} label={tNav(labelKey)} icon={Icon} active={isActive(href)} />
          ))}

          {/* Espace pour le bouton central */}
          <div className="w-14.5 shrink-0" />

          {RIGHT_ITEMS.map(({ href, labelKey, icon: Icon }) => (
            <NavItem key={href} href={href} label={tNav(labelKey)} icon={Icon} active={isActive(href)} />
          ))}
        </div>
      </nav>
    </>
  );
}

interface NavItemProps {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}

function NavItem({ href, label, icon: Icon, active }: NavItemProps) {
  // Effet : l'icône "tombe" hors de la barre quand l'item devient actif, le label apparaît
  // à sa place ; un petit point indicateur sort en dessous.
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className="relative flex flex-1 flex-col items-center justify-center h-full overflow-visible"
      style={{ color: 'var(--primary-foreground)' }}
    >
      {/* Icône — visible quand inactif, tombe vers le bas quand actif */}
      <span
        aria-hidden={active}
        className="flex flex-col items-center"
        style={{
          transform: active ? 'translateY(28px)' : 'translateY(0)',
          opacity: active ? 0 : 0.65,
          transition:
            'transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 220ms ease-out',
        }}
      >
        <Icon className="h-5 w-5" />
      </span>

      {/* Label — apparaît à la place de l'icône quand actif */}
      <span
        aria-hidden={!active}
        className="absolute inset-0 flex flex-col items-center justify-center text-xs font-semibold"
        style={{
          transform: active ? 'translateY(0)' : 'translateY(-22px)',
          opacity: active ? 1 : 0,
          transition:
            'transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 220ms ease-out',
        }}
      >
        {label}
      </span>

      {/* Ligne indicatrice discrète sous l'item actif */}
      <span
        aria-hidden
        className="absolute left-1/2 bottom-3 h-px rounded-full bg-current/70"
        style={{
          width: active ? 18 : 0,
          opacity: active ? 1 : 0,
          transform: 'translateX(-50%)',
          transition:
            'width 320ms cubic-bezier(0.34, 1.56, 0.64, 1) 80ms, opacity 220ms ease-out 80ms',
        }}
      />
    </Link>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7m-9 2v8m4-8v8m-4 0h4" />
    </svg>
  );
}

function ShoppingBagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  );
}

