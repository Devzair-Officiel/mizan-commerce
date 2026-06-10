import { A } from './_theme';
import { AIcon } from './AIcon';
import { AHeader, ANav, Screen, Body, Sub } from './_chrome';

export function AppHome() {
  const bars = [140, 96, 188, 72, 210, 165, 184];
  const days = ['03', '04', '05', '06', '07', '08', '09'];
  const max = Math.max(...bars);
  const total = bars.reduce((a, b) => a + b, 0);
  const stats = [
    { ic: 'trend' as const, l: 'CA jour', v: '184 €', s: "aujourd'hui" },
    { ic: 'receipt' as const, l: 'Ventes', v: '9', s: "aujourd'hui" },
    { ic: 'ticket' as const, l: 'Ticket moyen', v: '20 €', s: "aujourd'hui" },
  ];
  return (
    <Screen>
      <AHeader title="Accueil" />
      <Body>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 32, color: A.ink, letterSpacing: '-0.02em' }}>Salam aleykoum, Houd</div>
            <div style={{ fontWeight: 600, fontSize: 21, color: A.inkSoft, marginTop: 3 }}>Mercredi 10 Juin</div>
          </div>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: '#fff', border: `1px solid ${A.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AIcon name="refresh" size={24} color={A.green} sw={2} />
          </div>
        </div>

        <div style={{ background: 'rgba(47,129,89,0.08)', border: `1px solid rgba(47,129,89,0.18)`, borderRadius: 22, padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(47,129,89,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AIcon name="scale" size={28} color={A.green} sw={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 25, color: A.greenInk }}>Zakat dans 5 jours</div>
            <div style={{ fontWeight: 600, fontSize: 19, color: A.inkSoft, marginTop: 2 }}>Préparer le calcul de la zakat annuelle.</div>
          </div>
          <AIcon name="arrow" size={26} color={A.green} sw={2.2} />
        </div>

        <div style={{ display: 'flex', gap: 14 }}>
          {stats.map((s, i) => (
            <div key={i} style={{ flex: 1, background: '#fff', border: `1px solid ${A.line}`, borderRadius: 20, padding: '16px 16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <AIcon name={s.ic} size={18} color={A.inkFaint} sw={2} />
                <span style={{ fontWeight: 800, fontSize: 14.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: A.inkFaint }}>{s.l}</span>
              </div>
              <div style={{ fontWeight: 800, fontSize: 32, color: A.ink, marginTop: 12, letterSpacing: '-0.02em' }}>{s.v}</div>
              <div style={{ fontWeight: 600, fontSize: 16, color: A.inkFaint, marginTop: 2 }}>{s.s}</div>
            </div>
          ))}
        </div>

        <div style={{ background: '#fff', border: `1px solid ${A.line}`, borderRadius: 22, padding: '22px 24px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Sub>CA — 7 derniers jours</Sub>
            <span style={{ fontWeight: 800, fontSize: 24, color: A.ink }}>{total.toLocaleString('fr-FR')} €</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, height: 130, marginTop: 18 }}>
            {bars.map((b, i) => {
              const on = i === bars.length - 1;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: A.inkFaint }}>{b}</div>
                  <div style={{ width: '100%', maxWidth: 30, height: `${(b / max) * 100}%`, borderRadius: 8, background: on ? `linear-gradient(180deg, #3a9568, ${A.green})` : 'rgba(20,38,29,0.10)' }} />
                  <div style={{ fontWeight: 700, fontSize: 15, color: on ? A.green : A.inkFaint }}>{days[i]}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ background: '#fff', border: `1px solid ${A.line}`, borderRadius: 22, padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: 13, background: 'rgba(59,125,216,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AIcon name="cart" size={24} color={A.blue} sw={2} />
            </div>
            <div style={{ fontWeight: 800, fontSize: 24, color: A.ink, flex: 1 }}>À préparer</div>
            <div style={{ minWidth: 34, height: 34, borderRadius: 999, background: 'rgba(59,125,216,0.12)', color: A.blue, fontWeight: 800, fontSize: 19, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px' }}>3</div>
            <AIcon name="chevron" size={24} color={A.inkFaint} sw={2.2} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTop: `1px solid ${A.line}` }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 23, color: A.ink }}>#2026-014 · Fatima B.</div>
              <div style={{ fontWeight: 600, fontSize: 18, color: A.inkSoft, marginTop: 2 }}>3 articles</div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 25, color: A.ink, fontVariantNumeric: 'tabular-nums' }}>38,50 €</div>
          </div>
        </div>
      </Body>
      <ANav active="home" />
    </Screen>
  );
}
