import { Banknote, BookOpen, Calculator, Package, ReceiptText, Sprout, Wallet } from 'lucide-react';

// Démonstration éditoriale : montants fixes, indépendants du calculateur métier.
const EXAMPLE_ROWS = [
  { label: 'Stock de marchandises', amount: '24 500,00 €', Icon: Package },
  { label: 'Trésorerie', amount: '8 200,00 €', Icon: Wallet },
  { label: 'Créances clients', amount: '4 300,00 €', Icon: Banknote },
  { label: 'Dettes à déduire', amount: '−6 100,00 €', Icon: ReceiptText },
];

function ZakatArch() {
  return (
    <svg className="zakat-arch" viewBox="0 0 640 600" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M42 578V268C42 151 218 112 320 24C422 112 598 151 598 268V578Z" />
      <path d="M62 578V270C62 166 225 132 320 48C415 132 578 166 578 270V578Z" />
      <path d="M83 578V274C83 182 238 150 320 74C402 150 557 182 557 274V578" />
      <g className="zakat-arch-star">
        <rect x="528" y="82" width="32" height="32" />
        <rect x="528" y="82" width="32" height="32" transform="rotate(45 544 98)" />
        <rect x="63" y="418" width="26" height="26" />
        <rect x="63" y="418" width="26" height="26" transform="rotate(45 76 431)" />
      </g>
    </svg>
  );
}

export function ZakatEstimateExample() {
  return (
    <div className="zakat-visual">
      <ZakatArch />
      <figure className="zakat-estimate" aria-labelledby="zakat-example-title" aria-describedby="zakat-example-note">
        <div className="zakat-estimate-head">
          <h3 id="zakat-example-title"><Calculator size={25} strokeWidth={1.8} aria-hidden="true" /><span>Estimation de votre zakat</span></h3>
          <span className="zakat-example-badge">Exemple illustratif</span>
        </div>
        <dl className="zakat-breakdown">
          {EXAMPLE_ROWS.map(({ label, amount, Icon }) => (
            <div key={label}>
              <dt><Icon size={18} strokeWidth={1.6} aria-hidden="true" /><span>{label}</span></dt>
              <dd>{amount}</dd>
            </div>
          ))}
        </dl>
        <dl className="zakat-total">
          <div>
            <dt><Sprout size={25} strokeWidth={1.8} aria-hidden="true" /><span>Zakat estimée</span></dt>
            <dd>772,50 €</dd>
          </div>
        </dl>
        <div className="zakat-method-note">
          <BookOpen size={22} strokeWidth={1.6} aria-hidden="true" />
          <p>Méthode de calcul et sources<span>Consultables dans votre espace Zakat.</span></p>
        </div>
        <figcaption id="zakat-example-note">
          Exemple arithmétique : 30 900,00 € × 2,5 %. Les choix d&apos;avis sont les vôtres.
        </figcaption>
      </figure>
    </div>
  );
}
