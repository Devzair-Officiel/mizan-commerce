import { A } from './_theme';
import { AIcon } from './AIcon';

export function AStatus() {
  return (
    <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 38px 0 40px', flexShrink: 0, color: A.ink }}>
      <span style={{ fontFamily: A.sans, fontWeight: 700, fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>9:41</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="26" height="16" viewBox="0 0 26 16" fill={A.ink}>
          <rect x="0" y="9" width="4" height="7" rx="1" />
          <rect x="6" y="6" width="4" height="10" rx="1" />
          <rect x="12" y="3" width="4" height="13" rx="1" />
          <rect x="18" y="0" width="4" height="16" rx="1" />
        </svg>
        <svg width="34" height="16" viewBox="0 0 34 16" fill="none">
          <rect x="1" y="2" width="27" height="12" rx="3" stroke={A.ink} strokeWidth="1.6" opacity="0.4" />
          <rect x="3" y="4" width="20" height="8" rx="1.5" fill={A.ink} />
          <rect x="30" y="5" width="2.5" height="6" rx="1.25" fill={A.ink} opacity="0.4" />
        </svg>
      </div>
    </div>
  );
}

export function AHeader({ title }: { title: string }) {
  return (
    <div style={{ flexShrink: 0, background: '#fff', borderBottom: `1px solid ${A.line}` }}>
      <AStatus />
      <div style={{ height: 76, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px' }}>
        <AIcon name="menu" size={32} color={A.ink} sw={2.1} />
        <div style={{ fontFamily: A.sans, fontWeight: 800, fontSize: 36, color: A.ink, letterSpacing: '-0.02em' }}>{title}</div>
        <AIcon name="search" size={30} color={A.ink} sw={2} />
      </div>
    </div>
  );
}

type Tab = { id: string; icon?: 'home' | 'users' | 'cart' | 'box'; label?: string };

export function ANav({ active = 'home' }: { active?: string }) {
  const tabs: Tab[] = [
    { id: 'home', icon: 'home', label: 'Accueil' },
    { id: 'clients', icon: 'users', label: 'Clients' },
    { id: 'fab' },
    { id: 'commandes', icon: 'cart', label: 'Commandes' },
    { id: 'produits', icon: 'box', label: 'Produits' },
  ];
  return (
    <div style={{ position: 'relative', flexShrink: 0, height: 116 }}>
      <div
        style={{
          position: 'absolute', left: '50%', top: -6, transform: 'translateX(-50%)', zIndex: 5,
          width: 84, height: 84, borderRadius: '50%',
          background: `linear-gradient(160deg, #3a9568, ${A.greenDeep})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 16px 30px -10px rgba(31,96,67,0.7), inset 0 2px 0 rgba(255,255,255,0.25)',
          border: '4px solid #f4faf4',
        }}
      >
        <AIcon name="plus" size={40} color="#fff" sw={2.6} />
      </div>
      <div
        style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-around',
          padding: '20px 18px 0', background: `linear-gradient(180deg, #2c7d54, ${A.greenDeep})`,
        }}
      >
        {tabs.map((t) => {
          if (t.id === 'fab') return <div key="fab" style={{ width: 84 }} />;
          const on = t.id === active;
          return (
            <div key={t.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 110, paddingTop: 4 }}>
              <AIcon name={t.icon!} size={28} color={on ? '#fff' : 'rgba(255,255,255,0.6)'} sw={on ? 2.2 : 1.9} />
              {on && <span style={{ fontFamily: A.sans, fontWeight: 700, fontSize: 17, color: '#fff' }}>{t.label}</span>}
              {on && <div style={{ width: 22, height: 3, borderRadius: 2, background: '#fff', marginTop: 1 }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Screen({ children, bg = true }: { children: React.ReactNode; bg?: boolean }) {
  return (
    <div
      style={{
        position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0,
        background: bg ? `linear-gradient(180deg, ${A.bg1}, ${A.bg2})` : '#fff',
        fontFamily: A.sans,
      }}
    >
      {children}
    </div>
  );
}

export function Body({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, padding: '20px 26px 8px', display: 'flex', flexDirection: 'column', gap: 18, overflow: 'hidden' }}>
      {children}
    </div>
  );
}

export function Sub({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: A.sans, fontWeight: 800, fontSize: 17, letterSpacing: '0.08em', textTransform: 'uppercase', color: A.inkFaint }}>
      {children}
    </div>
  );
}
