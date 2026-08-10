'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronRight, ClipboardPlus, Package, PackagePlus, UserPlus, Users, X } from 'lucide-react';
import { useMe, type ModuleKey } from '@/lib/hooks/useMe';
import { usePlanGating, type Feature } from '@/lib/hooks/usePlanGating';

// Type d'icône suffisamment large pour accepter à la fois les SVG locaux
// (className seul) et les composants lucide-react (qui prennent strokeWidth).
type IconLike = React.ComponentType<{ className?: string; strokeWidth?: number }>;

type NavLabel = 'dashboard' | 'customers' | 'orders' | 'products';

type NavItemDef = {
  href: string;
  labelKey: NavLabel;
  module: ModuleKey;
  icon: IconLike;
  feature?: Feature;
};

const LEFT_ITEMS: readonly NavItemDef[] = [
  { href: '/dashboard', labelKey: 'dashboard', module: 'dashboard', icon: HomeIcon },
  { href: '/customers', labelKey: 'customers', module: 'customers', icon: Users },
];

const RIGHT_ITEMS: readonly NavItemDef[] = [
  { href: '/orders',    labelKey: 'orders',    module: 'orders',    icon: ShoppingBagIcon, feature: 'orders' },
  { href: '/products',  labelKey: 'products',  module: 'products',  icon: Package,         feature: 'products' },
];

type QuickActionKey = 'new_customer' | 'new_order' | 'new_product';

type QuickAction = {
  href: string;
  labelKey: QuickActionKey;
  module: ModuleKey;
  icon: IconLike;
  feature?: Feature;
};

const QUICK_ACTIONS: readonly QuickAction[] = [
  { href: '/orders/new',    labelKey: 'new_order',    module: 'orders',    icon: ClipboardPlus, feature: 'orders' },
  { href: '/products/new',  labelKey: 'new_product',  module: 'products',  icon: PackagePlus,   feature: 'products' },
  { href: '/customers/new', labelKey: 'new_customer', module: 'customers', icon: UserPlus },
];

function hasModuleAccess(
  module: ModuleKey,
  membership: { is_admin: boolean; permissions: ModuleKey[] } | null,
): boolean {
  if (!membership) return false;
  if (membership.is_admin) return true;
  return membership.permissions.includes(module);
}

/* Détecte tout dialog/sheet modal externe (hors menu interne du BottomNav,
   marqué par `data-bottom-nav-sheet`) afin de masquer FAB + nav et éviter
   le débordement par-dessus les feuilles ouvertes. */
function useExternalDialogOpen() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const check = () => {
      const nodes = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      let hasExternal = false;
      nodes.forEach((el) => {
        if (!el.hasAttribute('data-bottom-nav-sheet')) hasExternal = true;
      });
      setOpen(hasExternal);
    };

    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['role', 'aria-modal', 'data-state'],
    });
    return () => observer.disconnect();
  }, []);

  return open;
}

export function BottomNav() {
  const tNav = useTranslations('layout.nav');
  const tBottom = useTranslations('layout.bottomNav');
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const externalDialogOpen = useExternalDialogOpen();
  const { data: me } = useMe();
  const membership = me?.membership ?? null;
  const { can } = usePlanGating();

  const allowed = <T extends { module: ModuleKey; feature?: Feature }>(i: T) =>
    hasModuleAccess(i.module, membership) && (i.feature ? can(i.feature) : true);

  const leftItems = LEFT_ITEMS.filter(allowed);
  const rightItems = RIGHT_ITEMS.filter(allowed);
  const quickActions = QUICK_ACTIONS.filter(allowed);
  const showFab = quickActions.length > 0;

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

  if (externalDialogOpen) return null;

  return (
    <>
      {/* Overlay assombrissant le fond — bloque la nav + déclenche la fermeture */}
      <div
        onClick={() => setMenuOpen(false)}
        className={`lg:hidden fixed inset-0 z-70 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${
          menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Bottom sheet — liste explicite des actions rapides */}
      {showFab && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={tBottom('quick_actions')}
          aria-hidden={!menuOpen}
          data-bottom-nav-sheet="true"
          className={`lg:hidden fixed inset-x-0 bottom-0 z-80 rounded-t-[28px] bg-card shadow-[0_-20px_60px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-out ${
            menuOpen ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-muted-foreground/25" />
          <div className="px-6 pt-4">
            <h2 className="text-base font-semibold text-foreground">{tBottom('quick_actions')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{tBottom('quick_actions_sub')}</p>
          </div>
          <div className="px-4 pt-4 pb-28 flex flex-col gap-2">
            {quickActions.map(({ href, labelKey, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                tabIndex={menuOpen ? 0 : -1}
                className="group flex items-center gap-4 rounded-2xl bg-muted/40 px-4 py-3.5 text-left transition-colors hover:bg-muted active:scale-[0.99]"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-[15px] font-semibold text-foreground leading-tight">{tBottom(labelKey)}</span>
                  <span className="text-xs text-muted-foreground mt-0.5">{tBottom(`${labelKey}_sub`)}</span>
                </div>
                <ChevronRight size={18} className="text-muted-foreground/60 rtl:rotate-180 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Bouton + central — toggle de la sheet */}
      {showFab && (
        <div className="lg:hidden fixed bottom-4 left-1/2 z-90 -translate-x-1/2">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-14.5 w-14.5 items-center justify-center rounded-full shadow-xl active:scale-95 transition-transform overflow-hidden"
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
      )}

      {/* Barre de navigation */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 rounded-t-[28px] shadow-[0_-6px_24px_rgba(0,0,0,0.18)]"
        style={{ background: 'var(--primary)' }}
      >
        <div className="flex h-14 items-center justify-around px-2">
          {leftItems.map(({ href, labelKey, icon: Icon }) => (
            <NavItem key={href} href={href} label={tNav(labelKey)} icon={Icon} active={isActive(href)} />
          ))}

          {/* Espace pour le bouton central — uniquement si le FAB est visible */}
          {showFab && <div className="w-14.5 shrink-0" />}

          {rightItems.map(({ href, labelKey, icon: Icon }) => (
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

