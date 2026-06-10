import { SiteIcon } from './SiteIcon';

const BEFORE = [
  'Infos perdues dans WhatsApp, les notes et le papier',
  'Stock flou, ruptures découvertes trop tard',
  'Commandes oubliées et colis mal suivis',
  'Zakat calculée à l\u2019approximation',
];

const AFTER = [
  'Tout votre commerce centralisé au même endroit',
  'Stock à jour en temps réel, alertes de rupture',
  'Chaque commande et chaque colis suivis',
  'Zakat calculée automatiquement, au juste montant',
];

export function Problem() {
  return (
    <section className="section alt" id="problem">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Le problème</span>
          <h2>La fin du commerce <em className="serif-i">éparpillé.</em></h2>
          <p>Vous jonglez entre messages, carnets et mémoire. mizan remet de l&apos;ordre, en douceur.</p>
        </div>
        <div className="compare">
          <div className="col col-before">
            <h3>Aujourd&apos;hui</h3>
            <ul className="plist">
              {BEFORE.map((t, i) => (
                <li key={i}>
                  <span className="mk">✕</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="col col-after">
            <h3>Avec mizan</h3>
            <ul className="plist">
              {AFTER.map((t, i) => (
                <li key={i}>
                  <span className="mk"><SiteIcon name="check" size={20} color="#e3c987" sw={2.4} /></span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
