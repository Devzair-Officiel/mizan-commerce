import { ArrowUpRight, Link2 } from 'lucide-react';
import { HowProductThumb } from './HowProductThumb';

const PRODUCTS = [
  { name: 'Miel de sidr', price: '24,90 €', kind: 'honey' },
  { name: 'Nigelle', price: '12,00 €', kind: 'nigella' },
] as const;

export function HowStorePreview() {
  return (
    <div className="how-preview how-preview--store" aria-hidden="true">
      <div className="how-window how-store-window">
        <div className="how-browser-bar"><span /><span /><span /></div>
        <div className="how-store-header">
          <strong>Ma boutique</strong>
          <span>Découvrez notre sélection</span>
        </div>
        <div className="how-store-products">
          {PRODUCTS.map(({ name, price, kind }) => (
            <div className="how-store-product" key={kind}>
              <HowProductThumb kind={kind} />
              <strong>{name}</strong>
              <span>{price}</span>
            </div>
          ))}
        </div>
        <div className="how-window-footer">
          <span>Votre mini-site</span>
          <span className="how-share"><Link2 size={13} /> Lien de partage</span>
        </div>
      </div>
      <span className="how-proof"><ArrowUpRight size={13} strokeWidth={2.5} /> Boutique en ligne</span>
    </div>
  );
}
