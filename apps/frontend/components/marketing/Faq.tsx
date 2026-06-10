'use client';

import { useState } from 'react';

const FAQ: Array<[string, string]> = [
  ['mizan est-il vraiment gratuit ?', 'Le plan Gratuit l\u2019est à vie, sans carte bancaire. Le plan Pro propose un essai gratuit, et Boutique+ est offert pendant 14 jours pour tous les nouveaux comptes. Vous ne payez que si vous décidez de continuer.'],
  ['Comment fonctionne l\u2019essai 14 jours de Boutique+ ?', 'Tous les nouveaux comptes accèdent gratuitement à Boutique+ pendant 14 jours, sans carte bancaire. À la fin de l\u2019essai, votre boutique bascule automatiquement sur le plan Gratuit si vous n\u2019avez pas choisi de formule payante — aucun débit, aucune mauvaise surprise.'],
  ['Puis-je résilier à tout moment ?', 'Oui. Aucun engagement, aucune durée minimale. Vous changez de formule ou résiliez depuis vos réglages, et vous conservez l\u2019accès à vos données jusqu\u2019à la fin de la période réglée.'],
  ['Dois-je installer quelque chose ?', 'Non. mizan fonctionne directement depuis le navigateur de votre téléphone, et bientôt comme application installable.'],
  ['Puis-je importer mes produits depuis Excel ou un autre outil ?', 'L\u2019import depuis un fichier Excel ou CSV est prévu. En attendant, l\u2019ajout de vos produits se fait rapidement depuis l\u2019application, et notre équipe peut vous accompagner sur la mise en route.'],
  ['Comment la zakat est-elle calculée ?', 'mizan additionne la valeur du stock, la trésorerie et les créances, déduit vos dettes, puis applique le taux de 2,5 % une fois le nisab atteint.'],
  ['Mes données sont-elles en sécurité ?', 'Vos données sont chiffrées et vous appartiennent. Vous pouvez les exporter ou les supprimer à tout moment.'],
  ['Qu\u2019est-ce qu\u2019un partenariat halal ?', 'Un espace de mise en relation entre porteurs de projets et partenaires, pour financer des projets sans intérêt (ribâ).'],
  ['L\u2019app fonctionne-t-elle sans connexion ?', 'Les fonctions essentielles restent accessibles hors-ligne et se synchronisent dès le retour du réseau.'],
  ['L\u2019app est-elle disponible en arabe ?', 'Oui — l\u2019interface est conçue pour basculer en arabe (avec lecture droite-à-gauche), en plus du français. D\u2019autres langues arriveront progressivement.'],
];

export function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section className="section" id="faq">
      <div className="wrap">
        <div className="sec-head center">
          <span className="eyebrow">FAQ</span>
          <h2>Questions <em className="serif-i">fréquentes.</em></h2>
        </div>
        <div className="faq-list">
          {FAQ.map(([q, a], i) => (
            <div className={'faq-item' + (open === i ? ' open' : '')} key={i}>
              <button className="faq-q" onClick={() => setOpen(open === i ? -1 : i)}>
                {q}
                <span className="pm">+</span>
              </button>
              <div className="faq-a" style={{ maxHeight: open === i ? 400 : 0 }}>
                <p>{a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
