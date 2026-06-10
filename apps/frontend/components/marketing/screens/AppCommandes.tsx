import { A } from './_theme';
import { AIcon } from './AIcon';
import { AHeader, ANav, Screen, Body, Sub } from './_chrome';

export function AppCommandes() {
  const chips = [
    { l: 'Toutes', on: true, c: undefined as string | undefined },
    { l: 'Brouillons', on: false, c: A.inkFaint },
    { l: 'À préparer', on: false, c: A.blue },
    { l: 'Prêtes', on: false, c: A.orange },
    { l: 'Expédiées', on: false, c: A.green },
  ];
  const orders = [
    {
      sec: 'Cette semaine',
      n: 1,
      items: [
        { name: 'Nono', ref: '2026-003', bar: A.orange, st: 'Préparé', stc: A.orange, meta: '5 juin · 2 articles', amt: '72,00 €', pay: 'Non payé', payc: A.red, clock: true },
      ],
    },
    {
      sec: 'Plus ancien',
      n: 2,
      items: [
        { name: 'Karim', ref: '2026-002', bar: A.green, st: 'Expédié', stc: A.green, meta: '2 juin · 1 article', amt: '30,00 €', pay: 'Payé', payc: A.green, clock: false },
        { name: 'Salima', ref: '2026-001', bar: A.blue, st: 'À préparer', stc: A.blue, meta: '1 juin · 1 article', amt: '30,00 €', pay: 'Non payé', payc: A.red, clock: false },
      ],
    },
  ];
  return (
    <Screen>
      <AHeader title="Commandes" />
      <div style={{ padding: '14px 28px 6px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 19, color: A.inkSoft }}>Accueil</span>
        <AIcon name="arrow" size={18} color={A.inkFaint} sw={2.2} />
        <span style={{ fontWeight: 800, fontSize: 19, color: A.ink }}>Commandes</span>
      </div>
      <div style={{ display: 'flex', gap: 10, padding: '8px 26px 6px', flexShrink: 0, overflow: 'hidden' }}>
        {chips.map((c, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 999, flexShrink: 0,
              background: c.on ? A.ink : '#fff', border: `1px solid ${c.on ? A.ink : A.line}`,
            }}
          >
            {!c.on && <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.c }} />}
            <span style={{ fontWeight: 700, fontSize: 18, color: c.on ? '#fff' : A.inkSoft }}>{c.l}</span>
          </div>
        ))}
      </div>
      <Body>
        <div style={{ background: 'rgba(224,144,28,0.09)', border: `1px solid rgba(224,144,28,0.22)`, borderRadius: 20, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <AIcon name="alert" size={30} color={A.orange} sw={2} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 23, color: '#9a6310' }}>1 commande nécessite ton attention</div>
            <div style={{ fontWeight: 600, fontSize: 18, color: '#b07a26', marginTop: 2 }}>Appuie pour l&apos;afficher.</div>
          </div>
          <AIcon name="arrow" size={24} color={A.orange} sw={2.2} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '18px', borderRadius: 18, background: `linear-gradient(160deg, #3a9568, ${A.greenDeep})`, boxShadow: '0 16px 28px -16px rgba(31,96,67,0.6)' }}>
          <AIcon name="docplus" size={26} color="#fff" sw={2.1} />
          <span style={{ fontWeight: 800, fontSize: 24, color: '#fff' }}>Nouvelle commande</span>
        </div>

        {orders.map((grp, gi) => (
          <div key={gi} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Sub>{grp.sec}</Sub>
              <span style={{ fontWeight: 700, fontSize: 17, color: A.inkFaint }}>({grp.n})</span>
            </div>
            {grp.items.map((o, oi) => (
              <div key={oi} style={{ background: '#fff', border: `1px solid ${A.line}`, borderRadius: 20, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: o.bar }} />
                <div style={{ flex: 1, paddingLeft: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 800, fontSize: 25, color: A.ink }}>{o.name}</span>
                    <span style={{ fontFamily: A.mono, fontWeight: 700, fontSize: 18, color: A.inkFaint }}>#{o.ref}</span>
                    {o.clock && <AIcon name="clock" size={20} color={A.orange} sw={2} />}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 18, color: A.inkSoft, marginTop: 4 }}>
                    <span style={{ color: o.stc, fontWeight: 700 }}>{o.st}</span> · {o.meta}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: 24, color: A.ink, fontVariantNumeric: 'tabular-nums' }}>{o.amt}</div>
                  <div style={{ fontWeight: 700, fontSize: 17, color: o.payc, marginTop: 3 }}>{o.pay}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </Body>
      <ANav active="commandes" />
    </Screen>
  );
}
