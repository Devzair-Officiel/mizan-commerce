import { A } from './_theme';
import { AIcon } from './AIcon';
import { AHeader, ANav, Screen, Body } from './_chrome';

export function AppZakat() {
  const stock = 18420;
  const cash = 9650;
  const recv = 3200;
  const debt = 2100;
  const base = stock + cash + recv - debt;
  const zakat = base * 0.025;
  const rows: Array<[string, number, boolean]> = [
    ['Valeur du stock', stock, false],
    ['Trésorerie', cash, false],
    ['Créances clients', recv, false],
    ['Dettes', debt, true],
  ];
  const f = (n: number) => n.toLocaleString('fr-FR') + ' €';
  return (
    <Screen>
      <AHeader title="Zakat" />
      <Body>
        <div style={{ paddingTop: 2 }}>
          <div style={{ fontWeight: 800, fontSize: 28, color: A.ink, letterSpacing: '-0.02em' }}>Estimation de la zakat</div>
          <div style={{ fontWeight: 600, fontSize: 20, color: A.inkSoft, marginTop: 3 }}>Exercice 2026 · taux 2,5 %</div>
        </div>

        <div style={{ background: '#fff', border: `1px solid ${A.line}`, borderRadius: 22, padding: '6px 24px' }}>
          {rows.map(([l, v, neg], i) => (
            <div
              key={i}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '17px 0',
                borderBottom: i < rows.length - 1 ? `1px solid ${A.line}` : 'none',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 23, color: A.inkSoft }}>{l}</span>
              <span style={{ fontWeight: 700, fontSize: 24, color: neg ? A.red : A.ink, fontVariantNumeric: 'tabular-nums' }}>
                {neg ? '− ' : ''}{f(v)}
              </span>
            </div>
          ))}
        </div>

        <div style={{ background: `linear-gradient(155deg, ${A.green}, ${A.greenDeep})`, borderRadius: 26, padding: '28px 28px 30px', position: 'relative', overflow: 'hidden', boxShadow: '0 24px 40px -24px rgba(31,96,67,0.55)' }}>
          <div style={{ position: 'absolute', right: -36, top: -36, width: 170, height: 170, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.14)' }} />
          <div style={{ fontWeight: 700, fontSize: 19, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Zakat estimée</div>
          <div style={{ fontWeight: 800, fontSize: 64, color: '#fff', letterSpacing: '-0.02em', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{f(zakat)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <AIcon name="check" size={15} color="#fff" sw={2.6} />
            </span>
            <span style={{ fontWeight: 600, fontSize: 20, color: 'rgba(255,255,255,0.9)' }}>Nisab atteint</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', background: '#fff', border: `1px solid ${A.line}`, borderRadius: 18, padding: '16px 18px' }}>
          <AIcon name="info" size={26} color={A.inkSoft} sw={2} />
          <div style={{ fontWeight: 600, fontSize: 18.5, color: A.inkSoft, lineHeight: 1.4 }}>
            Montant fourni <strong style={{ color: A.ink, fontWeight: 800 }}>à titre indicatif</strong>, calculé d&apos;après les données que vous saisissez. Vérifiez auprès d&apos;une référence qualifiée.
          </div>
        </div>
      </Body>
      <ANav active="home" />
    </Screen>
  );
}
