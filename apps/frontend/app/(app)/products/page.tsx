'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProducts, useDeactivateProduct } from '@/lib/hooks/useProducts';

export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data, isLoading } = useProducts(debouncedSearch, showAll);
  const deactivate = useDeactivateProduct();

  function handleSearch(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  }

  return (
    <>
      <TopBar
        title="Produits"
        action={
          <Link href="/products/new">
            <Button size="sm">+ Ajouter</Button>
          </Link>
        }
      />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex gap-2">
          <Input
            placeholder="Rechercher un produit…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1"
          />
          <button
            onClick={() => setShowAll((v) => !v)}
            className={`shrink-0 rounded-lg border px-3 text-xs font-medium ${showAll ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 text-zinc-500'}`}
          >
            {showAll ? 'Tous' : 'Actifs'}
          </button>
        </div>

        {isLoading && <p className="text-sm text-zinc-400 text-center py-8">Chargement…</p>}

        {data?.results.length === 0 && (
          <p className="text-sm text-zinc-400 text-center py-8">Aucun produit trouvé.</p>
        )}

        <div className="flex flex-col gap-2">
          {data?.results.map((product) => (
            <Link
              key={product.id}
              href={`/products/${product.id}`}
              className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="font-medium text-base text-zinc-900 truncate capitalize">{product.name}</span>
                {product.reference && (
                  <span className="text-sm text-zinc-400">{product.reference}</span>
                )}
                <div className="flex items-center gap-2 mt-1">
                  {product.is_out_of_stock ? (
                    <span className="text-sm font-medium text-red-500">Rupture</span>
                  ) : product.is_low_stock ? (
                    <span className="text-sm font-medium text-amber-500">Stock faible · {product.stock_quantity}</span>
                  ) : (
                    <span className="text-sm text-zinc-400">Stock · {product.stock_quantity}</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
                <span className="text-base font-semibold text-zinc-900">{product.selling_price} €</span>
                {!product.is_active && (
                  <span className="text-xs text-zinc-400 bg-zinc-100 rounded px-1.5 py-0.5">Inactif</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
