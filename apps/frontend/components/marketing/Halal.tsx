import Link from 'next/link';
import { ArrowDownRight, ArrowRight, BookOpen, Scale, Store } from 'lucide-react';
import { HalalTransition } from './HalalTransition';
import { ZakatEstimateExample } from './ZakatEstimateExample';

const POINTS = [
  {
    title: 'Une estimation claire',
    description: 'Stock, trésorerie, créances et dettes réunis au même endroit.',
    Icon: Scale,
  },
  {
    title: 'Des règles transparentes',
    description: 'Comprenez les méthodes appliquées et consultez leurs sources.',
    Icon: BookOpen,
  },
  {
    title: 'Un outil adapté à votre activité',
    description: "Retrouvez les informations utiles à l'estimation de votre zakat.",
    Icon: Store,
  },
];

export function Halal() {
  return (
    <section className="section zakat-section" id="halal" aria-labelledby="zakat-title" lang="fr" dir="ltr">
      <HalalTransition />
      <div className="wrap zakat-grid">
        <div className="zakat-copy">
          <span className="eyebrow">
            <span className="ar" lang="ar">حلال</span>
            <span className="dot" />
            Vos valeurs, respectées
          </span>
          <h2 id="zakat-title">
            Une zakat simple, claire
            <em className="serif-i">et en toute confiance.</em>
          </h2>
          <p className="zakat-intro">
            Préparez votre zakat à partir des données de votre activité. Une estimation indicative et
            transparente, avec des règles explicitées et des sources consultables.
          </p>
          <ul className="zakat-points" role="list">
            {POINTS.map(({ title, description, Icon }) => (
              <li key={title}>
                <span className="zakat-point-icon"><Icon size={23} strokeWidth={1.6} aria-hidden="true" /></span>
                <div><h3>{title}</h3><p>{description}</p></div>
              </li>
            ))}
          </ul>
          <div className="zakat-actions">
            <Link className="btn btn-gold" href="/zakat" prefetch={false}>
              Estimer ma zakat <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
            </Link>
            <a className="zakat-more" href="#faq">
              En savoir plus <ArrowDownRight size={17} strokeWidth={1.8} aria-hidden="true" />
            </a>
          </div>
        </div>
        <ZakatEstimateExample />
      </div>
    </section>
  );
}
