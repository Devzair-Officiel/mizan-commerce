'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserPlus, ClipboardPlus, Package, PackagePlus } from 'lucide-react';

const LEFT_ITEMS = [
  { href: '/dashboard', label: 'Accueil', icon: HomeIcon },
  { href: '/customers', label: 'Clients', icon: UsersIcon },
] as const;

const RIGHT_ITEMS = [
  { href: '/orders', label: 'Commandes', icon: ShoppingBagIcon },
  { href: '/products', label: 'Catalogue', icon: Package },
] as const;

/* Positions en arc — icônes "+" intégrées naturellement dans le trait */
const QUICK_ACTIONS = [
  { href: '/customers/new', label: 'Ajouter un client',  icon: UserPlus,      x: -90, y: -60 },
  { href: '/orders/new',    label: 'Nouvelle commande',  icon: ClipboardPlus, x: 0,   y: -100 },
  { href: '/products/new',  label: 'Ajouter au catalogue', icon: PackagePlus, x: 90,  y: -60 },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  /* Fermeture sur Escape */
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
          {/* Actions en éventail autour du + — icônes seules, aria-label pour l'accessibilité */}
          {QUICK_ACTIONS.map(({ href, label, icon: Icon, x, y }, i) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              aria-label={label}
              aria-hidden={!menuOpen}
              tabIndex={menuOpen ? 0 : -1}
              className={`absolute top-1/2 left-1/2 flex items-center justify-center h-12 w-12 rounded-full bg-card border border-border/70 active:scale-95 transition-transform ${
                menuOpen ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
              style={{
                transform: menuOpen
                  ? `translate(-50%, -50%) translate(${x}px, ${y}px) scale(1)`
                  : 'translate(-50%, -50%) scale(0.4)',
                opacity: menuOpen ? 1 : 0,
                boxShadow: '0 8px 20px -4px rgba(0,0,0,0.28), 0 2px 4px -1px rgba(0,0,0,0.12)',
                transition: `transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1) ${
                  menuOpen ? i * 50 : (QUICK_ACTIONS.length - 1 - i) * 30
                }ms, opacity 220ms ease-out ${menuOpen ? i * 50 : 0}ms`,
              }}
            >
              <Icon className="h-6 w-6 text-primary" />
            </Link>
          ))}

          {/* Bouton + central — toggle des actions rapides */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="absolute inset-0 flex items-center justify-center rounded-full shadow-xl active:scale-95 transition-transform overflow-hidden"
            style={{
              background: 'linear-gradient(171deg, color-mix(in oklch, oklch(0.72 0.14 121.33) 65%, white 35%), color-mix(in oklch, var(--primary) 90%, #000000bf 10%))',
            }}
            aria-label={menuOpen ? 'Fermer le menu' : 'Actions rapides'}
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
          {LEFT_ITEMS.map(({ href, label, icon: Icon }) => (
            <NavItem key={href} href={href} label={label} icon={Icon} active={isActive(href)} />
          ))}

          {/* Espace pour le bouton central */}
          <div className="w-14.5 shrink-0" />

          {RIGHT_ITEMS.map(({ href, label, icon: Icon }) => (
            <NavItem key={href} href={href} label={label} icon={Icon} active={isActive(href)} />
          ))}
        </div>
      </nav>
    </>
  );
}

function NavItem({ href, label, icon: Icon, active }: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-1 flex-col items-center gap-0.5 py-1 text-xs font-medium transition-opacity ${
        active ? 'opacity-100' : 'opacity-55'
      }`}
      style={{ color: 'var(--primary-foreground)' }}
    >
      <Icon className="h-5 w-5" />
      {label}
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

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-5-5M9 20H4v-2a4 4 0 015-5m6 0a4 4 0 11-8 0 4 4 0 018 0zm6-8a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
