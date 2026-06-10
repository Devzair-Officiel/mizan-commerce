import { PhoneMock } from './PhoneFrame';
import { AppZakat } from './screens/AppZakat';

const STEPS = [
  { t: 'Créez votre boutique', d: 'Ajoutez vos produits et vos prix en quelques minutes.' },
  { t: 'Gérez au quotidien', d: 'Stock, commandes, colis, clients et rappels — depuis votre téléphone.' },
  { t: 'Développez votre activité', d: 'Mini-site public, messages prêts à envoyer et partenariats halal.' },
];

export function How() {
  return (
    <section className="section dark" id="how">
      <div className="wrap">
        <div className="sec-head center">
          <span className="eyebrow on-dark">Comment ça marche</span>
          <h2>Prêt en <em className="serif-i">trois étapes.</em></h2>
        </div>
        <div className="steps">
          {STEPS.map((s, i) => (
            <div className="step" key={i}>
              <div className="n">{String(i + 1).padStart(2, '0')}</div>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </div>
          ))}
        </div>
        <div className="steps-visual">
          <div className="phone-float"><PhoneMock Screen={AppZakat} scale={0.5} /></div>
        </div>
      </div>
    </section>
  );
}
