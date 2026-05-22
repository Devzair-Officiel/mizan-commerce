'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LEFT_ITEMS = [
  { href: '/dashboard', label: 'Accueil', icon: HomeIcon },
  { href: '/orders', label: 'Commandes', icon: ShoppingBagIcon },
] as const;

const RIGHT_ITEMS = [
  { href: '/customers', label: 'Clients', icon: UsersIcon },
  { href: '/products', label: 'Produits', icon: PackageIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <>
      {/* Bouton + flottant — au-dessus du nav */}
      <Link
        href="/orders/new"
        className="fixed bottom-4 left-1/2 z-60 -translate-x-1/2 flex h-14.5 w-14.5 items-center justify-center rounded-full shadow-xl active:scale-95 transition-transform overflow-hidden"
        style={{
          background: 'linear-gradient(171deg, color-mix(in oklch, oklch(0.72 0.14 121.33) 65%, white 35%), color-mix(in oklch, var(--primary) 90%, #000000bf 10%))',
        }}
        aria-label="Nouvelle vente"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Link>

      {/* Barre de navigation */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[28px] shadow-[0_-6px_24px_rgba(0,0,0,0.18)]"
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
  icon: (p: { className?: string }) => React.ReactElement;
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

function PackageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
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
