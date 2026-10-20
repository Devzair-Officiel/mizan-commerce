type Props = { kind: 'honey' | 'nigella' | 'royal' };

/** Petit pot purement décoratif, sans image téléchargée ni texte incorporé. */
export function HowProductThumb({ kind }: Props) {
  return (
    <span className={`how-product-thumb how-product-thumb--${kind}`}>
      <span className="how-product-jar" />
    </span>
  );
}
