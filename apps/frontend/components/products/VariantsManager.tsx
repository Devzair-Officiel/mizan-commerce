'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { ProductDetail } from '@/lib/hooks/useProducts';
import { VariantEditor } from './variants/VariantEditor';
import { VariantRow } from './variants/VariantRow';

export function VariantsManager({ product }: { product: ProductDetail }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const variants = [...product.variants].sort(
    (a, b) => a.position - b.position || a.packaging_name.localeCompare(b.packaging_name),
  );

  const isProduct = product.type === 'product';

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Conditionnements
        </h2>
        {!showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Plus size={13} />
            Ajouter
          </button>
        )}
      </div>

      {showAdd && (
        <div className="border-b border-border bg-muted/30">
          <VariantEditor
            productId={product.id}
            isProduct={isProduct}
            onDone={() => setShowAdd(false)}
          />
        </div>
      )}

      {variants.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Aucun conditionnement.</p>
      ) : (
        <ul className="divide-y divide-border">
          {variants.map((v) => (
            <li key={v.id}>
              {editingId === v.id ? (
                <VariantEditor
                  productId={product.id}
                  variant={v}
                  isProduct={isProduct}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <VariantRow
                  variant={v}
                  isProduct={isProduct}
                  canDelete={variants.length > 1}
                  productId={product.id}
                  onEdit={() => setEditingId(v.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
