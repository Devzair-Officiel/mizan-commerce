import { SiteIcon } from './SiteIcon';

export function Halal() {
  return (
    <section className="section deep" id="halal">
      <div className="wrap halal-grid">
        <div>
          <span className="eyebrow on-dark">
            <span className="ar">حلال</span>
            <span className="dot" />
            Vos valeurs, respectées
          </span>
          <h2 style={{ marginTop: 18 }}>
            Un commerce <em className="serif-i">juste et serein.</em>
          </h2>
          <div className="halal-points">
            <div className="hp">
              <div className="ic"><SiteIcon name="scale" size={26} color="#e3c987" /></div>
              <div>
                <h4>Une zakat estimée pour vous</h4>
                <p>
                  Une estimation transparente — stock, trésorerie, créances et dettes — fournie à titre
                  indicatif d&apos;après vos données, pour préparer votre zakat l&apos;esprit tranquille.
                </p>
              </div>
            </div>
            <div className="hp">
              <div className="ic"><SiteIcon name="hands" size={26} color="#e3c987" /></div>
              <div>
                <h4>Des partenariats sans ribâ</h4>
                <p>
                  Un espace de mise en relation entre porteurs de projets et partenaires, pour financer vos
                  ambitions sans intérêt.
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="halal-motif">
          <div className="halal-seal"><span className="ar">ميزان</span></div>
        </div>
      </div>
    </section>
  );
}
