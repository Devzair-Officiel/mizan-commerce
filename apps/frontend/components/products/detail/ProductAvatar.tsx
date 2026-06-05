import Image from 'next/image';
import { Camera, Package, Sparkles } from 'lucide-react';
import type { ProductDetail } from '@/lib/hooks/useProducts';

interface ProductAvatarProps {
  product: ProductDetail;
  onUpload: () => void;
  uploading: boolean;
}

export function ProductAvatar({ product, onUpload, uploading }: ProductAvatarProps) {
  const isService = product.type === 'service';

  return (
    <button
      type="button"
      onClick={onUpload}
      disabled={uploading}
      aria-label={product.primary_image ? 'Remplacer la photo' : 'Ajouter une photo'}
      className="relative flex h-20 w-20 items-center justify-center rounded-full overflow-hidden shadow-md ring-2 ring-background active:scale-95 transition-transform disabled:opacity-60"
      style={{ background: 'var(--primary)' }}
    >
      {product.primary_image ? (
        <Image
          src={product.primary_image}
          alt={product.name}
          width={80}
          height={80}
          unoptimized
          className="h-full w-full object-cover"
        />
      ) : isService ? (
        <Sparkles size={28} className="text-primary-foreground" />
      ) : (
        <Package size={28} className="text-primary-foreground" />
      )}
      <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-background border border-border shadow">
        <Camera size={11} className="text-foreground" />
      </span>
    </button>
  );
}
