import Image from 'next/image';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="foot-grid">
          <div className="foot-brand">
            <div className="brand" style={{ marginBottom: 4 }}>
              <Image src="/landing/logo.png" alt="mizan" width={40} height={40} />
              <span className="wm">mizan</span>
            </div>
            <p>
              L&apos;assistant quotidien des commerçants. Gérez, présentez et développez votre commerce
              depuis votre téléphone.
            </p>
          </div>
          <div className="foot-col">
            <h5>Produit</h5>
            <a href="#features">Fonctionnalités</a>
            <a href="#how">Comment ça marche</a>
            <a href="#pricing">Tarifs</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="foot-col">
            <h5>Compte</h5>
            <Link href="/register">Créer un compte</Link>
            <Link href="/login">Se connecter</Link>
            <a href="#halal">Zakat & halal</a>
            <a href="#halal">Partenariats</a>
          </div>
          <div className="foot-col">
            <h5>Contact</h5>
            <a href="mailto:contact@mizan.app">contact@mizan.app</a>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© 2026 mizan commerce. Tous droits réservés.</span>
          <span style={{ color: 'rgba(227,201,135,0.6)' }}>mizan — l&apos;équilibre de votre commerce</span>
        </div>
      </div>
    </footer>
  );
}
