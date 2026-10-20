import { Check } from 'lucide-react';
import { HowProductThumb } from './HowProductThumb';

const PRODUCTS = [
  { name: 'Miel de sidr', price: '24,90 €', kind: 'honey' },
  { name: 'Nigelle en poudre', price: '12,00 €', kind: 'nigella' },
  { name: 'Gelée royale', price: '28,00 €', kind: 'royal' },
] as const;

export function HowCatalogPreview() {
  return (
    <div className="how-preview how-preview--catalog" aria-hidden="true">
      <div className="how-window">
        <div className="how-window-header">
          <span className="how-window-title">Mon catalogue</span>
          <span className="how-status">3 produits</span>
        </div>
        <ul className="how-catalog-list">
          {PRODUCTS.map(({ name, price, kind }) => (
            <li className="how-catalog-product" key={kind}>
              <HowProductThumb kind={kind} />
              <div className="how-product-info">
                <strong>{name}</strong>
                <span>En stock</span>
              </div>
              <span className="how-product-price">{price}</span>
            </li>
          ))}
        </ul>
        <div className="how-window-footer">
          <Check size={14} strokeWidth={2} />
          <span>Produits prêts à vendre</span>
        </div>
      </div>
      <span className="how-proof"><Check size={13} strokeWidth={2.5} /> Catalogue prêt</span>
    </div>
  );
}
