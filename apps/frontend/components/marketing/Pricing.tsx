'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SiteIcon } from './SiteIcon';

type Plan = {
  tag: string;
  name: string;
  desc: string;
  m: number;
  y: number;
  feats: string[];
  cta: string;
  kind: 'btn-dark' | 'btn-gold';
  feature?: boolean;
  trialNote?: string;
};

const PLANS: Plan[] = [
  {
    tag: 'Pour démarrer',
    name: 'Gratuit',
    desc: 'L\u2019essentiel pour bien commencer.',
    m: 0,
    y: 0,
    feats: ['Produits & stock', 'Notes & rappels', '1 boutique'],
    cta: 'Créer un compte',
    kind: 'btn-dark',
  },
  {
    tag: 'Le plus choisi',
    name: 'Pro',
    desc: 'Pour gérer tout votre commerce.',
    m: 9,
    y: 90,
    feature: true,
    feats: ['Tout le plan Gratuit', 'Commandes & expédition', 'Facture', 'Zakat commerciale', 'Messages WhatsApp prêts'],
    cta: 'Essayer gratuitement',
    kind: 'btn-gold',
  },
  {
    tag: 'Pour aller plus loin',
    name: 'Boutique+',
    desc: 'Outils avancés et partenariats.',
    m: 19,
    y: 190,
    feats: ['Tout le plan Pro', 'Mini-site complet', 'Partenariats halal', 'Multi-utilisateurs', 'Exports comptables', 'OCR & scan (à venir)'],
    cta: 'Essayer 14 jours gratuit',
    kind: 'btn-dark',
    trialNote: '14 jours offerts pour les nouveaux comptes.',
  },
];

export function Pricing() {
  const [annual, setAnnual] = useState(false);
  return (
    <section className="section alt" id="pricing">
      <div className="wrap">
        <div className="sec-head center">
          <span className="eyebrow">Tarifs</span>
          <h2>Un prix juste, <em className="serif-i">sans surprise.</em></h2>
          <p>Commencez gratuitement. Changez de formule quand vous le souhaitez.</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div className="toggle">
            <button className={!annual ? 'on' : ''} onClick={() => setAnnual(false)}>Mensuel</button>
            <button className={annual ? 'on' : ''} onClick={() => setAnnual(true)}>
              Annuel <span className="save">−2 mois</span>
            </button>
          </div>
        </div>
        <div className="price-grid">
          {PLANS.map((p, i) => (
            <div className={'plan' + (p.feature ? ' feature' : '')} key={i}>
              <div className="tag">{p.tag}</div>
              <div className="pname">{p.name}</div>
              <div className="pdesc">{p.desc}</div>
              <div className="amt">
                <span className="v">{annual ? p.y : p.m} €</span>
                <span className="per">{p.m === 0 ? 'pour toujours' : annual ? '/ an' : '/ mois'}</span>
              </div>
              <ul>
                {p.feats.map((f, j) => (
                  <li key={j}>
                    <span className="mk">
                      <SiteIcon name="check" size={19} color={p.feature ? '#e3c987' : '#2a6c57'} sw={2.4} />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link className={'btn ' + p.kind} href="/register">{p.cta}</Link>
              {p.trialNote && <p className="plan-trial">{p.trialNote}</p>}
            </div>
          ))}
        </div>
        <p className="price-note">Prix indicatifs en euros, sans engagement, résiliables à tout moment.</p>
      </div>
    </section>
  );
}
