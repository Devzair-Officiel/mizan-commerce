import Link from 'next/link';
import { SiteIcon } from './SiteIcon';

export function FinalCta() {
  return (
    <section className="section dark final" id="cta">
      <div className="wrap">
        <span className="eyebrow on-dark">Disponible maintenant</span>
        <h2 style={{ marginTop: 16 }}>
          Prêt à mettre de l&apos;ordre dans <em className="serif-i">votre commerce ?</em>
        </h2>
        <p>Créez votre compte gratuitement et rassemblez toute votre activité dès aujourd&apos;hui.</p>
        <Link className="btn btn-gold" href="/register" style={{ fontSize: 19, padding: '18px 34px' }}>
          Créer mon compte — gratuit
          <SiteIcon name="arrow" size={20} color="#2a2208" sw={2.2} />
        </Link>
      </div>
    </section>
  );
}
