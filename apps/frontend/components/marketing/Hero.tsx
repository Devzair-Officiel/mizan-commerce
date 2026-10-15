import Image from 'next/image';
import Link from 'next/link';
import { SiteIcon } from './SiteIcon';

export function Hero() {
  return (
    <header className="hero" id="top">
      <div className="wrap hero-grid">
        <div>
          <span className="eyebrow on-dark">L&apos;équilibre de votre commerce</span>
          <h1 style={{ marginTop: 22 }}>
            Tout votre commerce, <em className="serif-i">au même endroit.</em>
          </h1>
          <p className="hero-sub">
            Stocks, commandes, clients, factures et zakat : Mizan réunit l&apos;essentiel de votre activité dans
            une seule application. Gardez une vision claire de votre commerce, simplifiez votre quotidien et
            concentrez-vous sur ce qui compte vraiment.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-gold" href="/register">
              Créer un compte — gratuit
              <SiteIcon name="arrow" size={20} color="#2a2208" sw={2.2} />
            </Link>
            <a className="btn btn-ghost" href="#features">Voir les fonctionnalités</a>
          </div>
          <div className="hero-trust">
            <span>
              <span className="chk"><SiteIcon name="check" size={13} color="#e3c987" sw={2.6} /></span>
              Disponible maintenant
            </span>
            <span>
              <span className="chk"><SiteIcon name="check" size={13} color="#e3c987" sw={2.6} /></span>
              Sans engagement
            </span>
          </div>
        </div>
        <div className="hero-scene">
          {/* LCP de la landing : `priority` est déprécié en Next 16, eager + fetchPriority le remplace. */}
          <Image
            className="hero-scene-img phone-float"
            src="/landing/hero-scene-1100.webp"
            width={1100}
            height={825}
            sizes="(max-width: 960px) 90vw, 720px"
            loading="eager"
            fetchPriority="high"
            alt="L'application Mizan sur téléphone : tableau de bord du jour et suivi des ventes"
          />
        </div>
      </div>
    </header>
  );
}
