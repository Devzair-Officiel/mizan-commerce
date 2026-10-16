'use client';

import { useState } from 'react';

const FAQ: Array<[string, string]> = [
  ['mizan est-il vraiment gratuit ?', 'Oui. Découverte est gratuite sans limite de durée, sans carte bancaire : 30 articles, 15 ventes par mois et 15 clients, avec le stock, les notes, les rappels et le calcul de la zakat.'],
  ['Comment fonctionne l\u2019essai de 14 jours de Boutique ?', 'Les nouveaux comptes bénéficient de Boutique pendant 14 jours, sans carte bancaire. À la fin de l\u2019essai, votre boutique revient automatiquement sur Découverte. Vos données sont conservées ; la création de nouveaux articles, ventes ou clients est bloquée si le plafond correspondant est atteint ou dépassé.'],
  ['Puis-je résilier à tout moment ?', 'Oui, depuis vos réglages d\u2019abonnement. La résiliation est immédiate : votre boutique passe sur Découverte et vos données restent intactes. Les plafonds de Découverte s\u2019appliquent alors aux nouvelles créations.'],
  ['Quelle formule choisir ?', 'Découverte pour démarrer dans les limites de 30 articles, 15 ventes par mois et 15 clients. Solo si vous gérez seul votre boutique et souhaitez un catalogue, des ventes et des clients illimités, les factures PDF et WhatsApp. Boutique si vous travaillez avec une petite équipe. Commerce+ si vous avez besoin d\u2019une équipe illimitée.'],
  ['Puis-je ajouter mon équipe ?', 'Oui. Boutique comprend vous + 3 membres d\u2019équipe. Commerce+ permet une équipe illimitée. Découverte et Solo sont réservées à une seule personne.'],
  ['Que se passe-t-il si je dépasse les limites de Découverte ?', 'Vos données existantes sont conservées. À partir de 30 articles actifs, 15 ventes dans le mois ou 15 clients actifs, la création correspondante est bloquée. Vous pouvez désactiver un article ou un client pour libérer une place ; le compteur de ventes repart chaque mois. Solo, Boutique et Commerce+ n\u2019ont pas ces plafonds.'],
  ['Dois-je installer quelque chose ?', 'Non. mizan fonctionne directement depuis le navigateur de votre téléphone ou de votre ordinateur.'],
  ['Comment la zakat est-elle calculée ?', 'mizan estime la valeur du stock, ajoute la trésorerie et les créances recouvrables saisies, puis déduit les dettes immédiatement exigibles. Le taux par défaut est de 2,5 %. Vous pouvez corriger les montants et renseigner le cours utilisé pour le nisab. Le résultat reste une estimation indicative.'],
  ['À qui appartiennent mes données ?', 'Vos données vous appartiennent et sont séparées par boutique.'],
  ['L\u2019app est-elle disponible en arabe ?', 'Oui. L\u2019interface est disponible en français, en anglais et en arabe, avec une lecture de droite à gauche pour l\u2019arabe.'],
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
              <button className="faq-q" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
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
