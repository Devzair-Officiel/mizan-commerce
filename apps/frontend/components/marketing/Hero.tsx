import Link from 'next/link';
import { SiteIcon } from './SiteIcon';
import { PhoneMock } from './PhoneFrame';
import { AppHome } from './screens/AppHome';
import { AppCommandes } from './screens/AppCommandes';

export function Hero() {
  return (
    <header className="hero" id="top">
      <div className="wrap hero-grid">
        <div>
          <span className="eyebrow on-dark">L&apos;équilibre de votre commerce</span>
          <h1 style={{ marginTop: 22 }}>
            Tout votre commerce, <em className="serif-i">dans une seule app.</em>
          </h1>
          <p className="hero-sub">
            Stock, commandes, clients, zakat et messages : mizan rassemble votre activité au même endroit.
            Pensé pour le téléphone, pensé halal.
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
        <div className="hero-phones">
          <div className="hero-back"><PhoneMock Screen={AppCommandes} scale={0.42} /></div>
          <div className="hero-front phone-float"><PhoneMock Screen={AppHome} scale={0.46} /></div>
        </div>
      </div>
    </header>
  );
}
