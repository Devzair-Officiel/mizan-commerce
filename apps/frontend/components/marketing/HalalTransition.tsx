const DESKTOP_CURVE = 'M0 2C160 80 450 90 650 90Q708 90 720 116Q732 90 790 90C990 90 1280 80 1440 2';
const MOBILE_CURVE = 'M0 8C360 138 1080 138 1440 8';

function Curve({ path, className }: { path: string; className: string }) {
  return (
    <g className={className}>
      <path className="zakat-transition-fill" d={`${path}V120H0Z`} />
      <path className="zakat-transition-line" d={path} vectorEffect="non-scaling-stroke" />
      <path className="zakat-transition-line zakat-transition-line--inner" d={path} transform="translate(0 5)" vectorEffect="non-scaling-stroke" />
    </g>
  );
}

/** Se superpose uniquement à la marge basse de How, sans changer son contenu. */
export function HalalTransition() {
  return (
    <div className="zakat-transition" aria-hidden="true">
      <svg viewBox="0 0 1440 120" preserveAspectRatio="none" focusable="false">
        <Curve path={DESKTOP_CURVE} className="zakat-transition-desktop" />
        <Curve path={MOBILE_CURVE} className="zakat-transition-mobile" />
      </svg>
    </div>
  );
}
