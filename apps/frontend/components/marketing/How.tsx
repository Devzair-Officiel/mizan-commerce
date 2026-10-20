import Link from 'next/link';
import { ArrowRight, SquareCheck, Store, TrendingUp } from 'lucide-react';
import { HowCatalogPreview } from './HowCatalogPreview';
import { HowDashboardPreview } from './HowDashboardPreview';
import { HowStorePreview } from './HowStorePreview';

const STEPS = [
  {
    number: '01',
    title: 'Créez votre boutique',
    description: 'Ajoutez vos produits, fixez vos prix et organisez votre catalogue en quelques minutes.',
    Icon: Store,
    Preview: HowCatalogPreview,
  },
  {
    number: '02',
    title: 'Gérez au quotidien',
    description: 'Retrouvez vos commandes, vos stocks et vos rappels au même endroit.',
    Icon: SquareCheck,
    Preview: HowDashboardPreview,
  },
  {
    number: '03',
    title: 'Développez votre activité',
    description: 'Présentez vos produits avec votre mini-site et partagez votre boutique facilement.',
    Icon: TrendingUp,
    Preview: HowStorePreview,
  },
];

export function How() {
  return (
    <section className="section dark how" id="how" aria-labelledby="how-title">
      <div className="wrap">
        <div className="sec-head center">
          <span className="eyebrow on-dark">Comment ça marche ?</span>
          <h2 id="how-title">Prêt en <em className="serif-i">trois étapes.</em></h2>
          <p>De vos premiers produits à la gestion de votre activité, tout devient plus simple.</p>
        </div>
        <ol className="how-steps" role="list">
          {STEPS.map(({ number, title, description, Icon, Preview }) => (
            <li className="how-card" key={number}>
              <div className="how-card-copy">
                <div className="how-card-top">
                  <span className="how-number" aria-hidden="true">{number}</span>
                  <span className="how-icon"><Icon size={24} strokeWidth={1.7} aria-hidden="true" /></span>
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
              {/* Illustrations statiques : données fictives, aucun contrôle interactif. */}
              <Preview />
            </li>
          ))}
        </ol>
        <div className="how-cta">
          <p>Une boutique à votre image, une gestion à votre rythme.</p>
          <Link className="btn btn-gold" href="/register">
            Créer un compte — gratuit
            <ArrowRight size={19} strokeWidth={2.2} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
