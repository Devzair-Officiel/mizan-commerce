'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SiteIcon } from './SiteIcon';

type Plan = {
  tag?: string;
  name: string;
  desc: string;
  m: number;
  y: number;
  feats: string[];
  cta: string;
  kind: 'btn-dark' | 'btn-gold';
  feature?: boolean;
  note: string;
};

const PLANS: Plan[] = [
  {
    name: 'Découverte',
    desc: 'Je démarre',
    m: 0,
    y: 0,
    feats: ['30 articles', '15 ventes par mois', '15 clients', 'Stock, notes et rappels', 'Calcul de la zakat'],
    cta: 'Commencer gratuitement',
    kind: 'btn-dark',
    note: 'Sans carte bancaire',
  },
  {
    name: 'Solo',
    desc: 'Je tiens ma boutique seul',
    m: 9,
    y: 90,
    feats: ['Ventes, articles et clients illimités', 'Factures PDF numérotées', 'Messages WhatsApp prêts à envoyer', 'Relance automatique des impayés'],
    cta: 'Choisir Solo',
    kind: 'btn-dark',
    note: 'Sans engagement',
  },
  {
    tag: 'Recommandé',
    name: 'Boutique',
    desc: 'Je veux attirer et fidéliser',
    m: 19,
    y: 190,
    feature: true,
    feats: [
      'Tout Solo inclus',
      "Vous + 3 membres d'équipe",
      'Factures à vos couleurs, avec votre logo',
      'Page boutique en ligne',
      'Programme de fidélité',
      'Exports et statistiques de ventes',
      'Lecture des factures fournisseurs',
      'Inventaire photo et QR codes',
    ],
    cta: 'Essayer 14 jours gratuit',
    kind: 'btn-gold',
    note: '14 jours offerts pour les nouveaux comptes',
  },
  {
    name: 'Commerce+',
    desc: "J'ai une équipe et du volume",
    m: 39,
    y: 390,
    feats: ['Tout Boutique inclus', 'Équipe illimitée', "Journal d'activité", 'Support prioritaire'],
    cta: 'Choisir Commerce+',
    kind: 'btn-dark',
    note: 'Sans engagement',
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
            <button className={!annual ? 'on' : ''} aria-pressed={!annual} onClick={() => setAnnual(false)}>Mensuel</button>
            <button className={annual ? 'on' : ''} aria-pressed={annual} onClick={() => setAnnual(true)}>
              Annuel <span className="save">−2 mois</span>
            </button>
          </div>
        </div>
        <div className="price-grid">
          {PLANS.map((p, i) => (
            <div className={'plan' + (p.feature ? ' feature' : '')} key={i}>
              {p.tag && <div className="tag">{p.tag}</div>}
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
              <p className="plan-trial">{p.note}</p>
            </div>
          ))}
        </div>
        <p className="price-note">Prix indicatifs en euros, sans engagement, résiliables à tout moment.</p>
      </div>
    </section>
  );
}
