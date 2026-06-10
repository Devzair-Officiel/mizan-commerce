import { SiteIcon } from './SiteIcon';

type Feat = {
  ic: 'box' | 'cart' | 'scale' | 'chat' | 'globe' | 'note' | 'hands' | 'scan';
  t: string;
  d: string;
  soon?: boolean;
};

const FEATURES: Feat[] = [
  { ic: 'box', t: 'Produits & stock', d: 'Catalogue clair, prix, et stock à jour en temps réel avec alertes de rupture.' },
  { ic: 'cart', t: 'Commandes & expédition', d: 'Suivez chaque commande et préparez vos colis sans rien oublier.' },
  { ic: 'scale', t: 'Zakat commerciale', d: 'Estimation automatique de votre zakat, à titre indicatif, d\u2019après vos données.' },
  { ic: 'chat', t: 'Messages WhatsApp prêts', d: 'Réponses et fiches produits prêtes à envoyer en un seul tap.' },
  { ic: 'globe', t: 'Page web publique', d: 'Un mini-site de présentation de vos produits, prêt à partager.' },
  { ic: 'note', t: 'Notes & rappels', d: 'Relances, paiements, tâches du jour — rien ne vous échappe.' },
  { ic: 'hands', t: 'Partenariats halal', d: 'Trouvez des partenaires pour financer vos projets sans ribâ.' },
  { ic: 'scan', t: 'OCR & scan visuel', d: 'Ajoutez produits et inventaire par simple photo.', soon: true },
];

export function Features() {
  return (
    <section className="section" id="features">
      <div className="wrap">
        <div className="sec-head center">
          <span className="eyebrow">Fonctionnalités</span>
          <h2>Un assistant complet, <em className="serif-i">simple à utiliser.</em></h2>
          <p>Tout ce dont un commerçant a besoin au quotidien, sans la complexité d&apos;un ERP.</p>
        </div>
        <div className="feat-grid">
          {FEATURES.map((f, i) => (
            <div className="feat" key={i}>
              {f.soon && <span className="soon">Bientôt</span>}
              <div className="ic"><SiteIcon name={f.ic} size={28} color="#1a5544" /></div>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
