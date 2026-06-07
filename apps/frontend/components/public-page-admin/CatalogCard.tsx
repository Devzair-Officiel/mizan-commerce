'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, ShoppingBag, Sparkles, Tag, Trash2 } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import {
  type PublicCatalogItem,
  type PublicPage,
  useAddCatalogItem,
  useRemoveCatalogItem,
  useReorderCatalog,
  useUpdateCatalogItem,
} from '@/lib/hooks/usePublicPageAdmin';
import { useProducts, type Product } from '@/lib/hooks/useProducts';

interface Props {
  page: PublicPage;
}

export function CatalogCard({ page }: Props) {
  const products = page.catalog_items.filter((i) => i.product_type === 'product');
  const services = page.catalog_items.filter((i) => i.product_type === 'service');

  return (
    <SettingsCard
      icon={ShoppingBag}
      title="Catalogue"
      description="Choisissez ce qui apparaît sur la vitrine."
    >
      <CatalogSection
        title="Produits"
        kind="product"
        items={products}
        allItems={page.catalog_items}
      />
      <div className="h-px bg-border my-2" />
      <CatalogSection
        title="Services"
        kind="service"
        items={services}
        allItems={page.catalog_items}
      />
    </SettingsCard>
  );
}

interface SectionProps {
  title: string;
  kind: 'product' | 'service';
  items: PublicCatalogItem[];
  allItems: PublicCatalogItem[];
}

function CatalogSection({ title, kind, items, allItems }: SectionProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const sorted = [...items].sort((a, b) => a.position - b.position);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSheetOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Ajouter
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">
          Aucun {kind === 'product' ? 'produit' : 'service'} sélectionné.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((item, index) => (
            <CatalogItemRow
              key={item.id}
              item={item}
              index={index}
              total={sorted.length}
              kindItems={sorted}
            />
          ))}
        </ul>
      )}

      <AddPickerSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        kind={kind}
        excludedProductIds={allItems.map((i) => i.product_id)}
      />
    </div>
  );
}

interface RowProps {
  item: PublicCatalogItem;
  index: number;
  total: number;
  kindItems: PublicCatalogItem[];
}

function CatalogItemRow({ item, index, total, kindItems }: RowProps) {
  const update = useUpdateCatalogItem();
  const remove = useRemoveCatalogItem();
  const reorder = useReorderCatalog();

  function move(delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= total) return;
    const reordered = [...kindItems];
    const moved = reordered[index];
    if (!moved) return;
    reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    reorder.mutate(reordered.map((s, i) => ({ id: s.id, position: i })));
  }

  return (
    <li className="rounded-2xl border border-border bg-card p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex flex-col">
          <button
            type="button"
            aria-label="Monter"
            disabled={index === 0 || reorder.isPending}
            onClick={() => move(-1)}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Descendre"
            disabled={index === total - 1 || reorder.isPending}
            onClick={() => move(1)}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>

        <p className="flex-1 text-sm font-medium text-foreground truncate">
          {item.product_name}
        </p>

        <button
          type="button"
          aria-label="Retirer"
          onClick={() => remove.mutate(item.id)}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 pl-6">
        <ToggleChip
          active={item.show_price}
          onClick={() => update.mutate({ id: item.id, data: { show_price: !item.show_price } })}
          icon={<Tag className="h-3 w-3" />}
          label="Afficher le prix"
        />
        <ToggleChip
          active={item.badge_promo}
          onClick={() => update.mutate({ id: item.id, data: { badge_promo: !item.badge_promo } })}
          label="Promo"
          tone="rose"
        />
        <ToggleChip
          active={item.badge_new}
          onClick={() => update.mutate({ id: item.id, data: { badge_new: !item.badge_new } })}
          icon={<Sparkles className="h-3 w-3" />}
          label="Nouveau"
          tone="emerald"
        />
      </div>
    </li>
  );
}

function ToggleChip({
  active,
  onClick,
  icon,
  label,
  tone = 'neutral',
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
  tone?: 'neutral' | 'rose' | 'emerald';
}) {
  const activeStyles = {
    neutral: 'bg-primary text-primary-foreground border-primary',
    rose: 'bg-rose-500 text-white border-rose-500',
    emerald: 'bg-emerald-500 text-white border-emerald-500',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
        active
          ? activeStyles[tone]
          : 'bg-card border-border text-muted-foreground hover:bg-muted'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

interface SheetProps {
  open: boolean;
  onClose: () => void;
  kind: 'product' | 'service';
  excludedProductIds: string[];
}

function AddPickerSheet({ open, onClose, kind, excludedProductIds }: SheetProps) {
  const [search, setSearch] = useState('');
  const add = useAddCatalogItem();

  const { data, isLoading } = useProducts({
    type: kind,
    search: search || undefined,
    all: true,
  });

  const excluded = useMemo(() => new Set(excludedProductIds), [excludedProductIds]);
  const candidates: Product[] = (data?.results ?? []).filter((p) => !excluded.has(p.id));

  function handleAdd(p: Product) {
    add.mutate({ product: p.id });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={`Ajouter un ${kind === 'product' ? 'produit' : 'service'}`}>
      <div className="flex flex-col gap-3 p-4 overflow-y-auto">
        <input
          type="search"
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
        />

        {isLoading && (
          <p className="text-xs text-muted-foreground text-center py-4">Chargement…</p>
        )}

        {!isLoading && candidates.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4 italic">
            {search ? 'Aucun résultat.' : `Aucun ${kind === 'product' ? 'produit' : 'service'} disponible.`}
          </p>
        )}

        <ul className="flex flex-col gap-1.5">
          {candidates.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => handleAdd(p)}
                disabled={add.isPending}
                className="w-full flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-left hover:bg-muted transition-colors disabled:opacity-50"
              >
                <span className="flex-1 text-sm font-medium text-foreground truncate">
                  {p.name}
                </span>
                <Plus className="h-4 w-4 text-primary shrink-0" />
              </button>
            </li>
          ))}
        </ul>

        <Button type="button" variant="outline" onClick={onClose} className="mt-2">
          Fermer
        </Button>
      </div>
    </BottomSheet>
  );
}
