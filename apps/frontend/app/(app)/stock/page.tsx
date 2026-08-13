'use client';

import Link from 'next/link';
import {
  PackagePlus, PackageMinus, AlertTriangle, AlertCircle,
  History, RefreshCcw, ShoppingBag, Boxes, ScanLine,
} from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { useProductsSummary } from '@/lib/hooks/useProducts';
import {
  useStockMovements,
  type StockMovement,
  type StockMovementType,
} from '@/lib/hooks/useStock';

const MOVEMENT_VISUAL: Record<
  StockMovementType,
  { icon: typeof PackagePlus; classes: string; sign: '+' | '−' | '±' }
> = {
  in:          { icon: PackagePlus,  classes: 'bg-green-500/10 text-green-600 dark:text-green-400', sign: '+' },
  release:     { icon: RefreshCcw,   classes: 'bg-green-500/10 text-green-600 dark:text-green-400', sign: '+' },
  out:         { icon: PackageMinus, classes: 'bg-red-500/10 text-red-600 dark:text-red-400',       sign: '−' },
  loss:        { icon: AlertCircle,  classes: 'bg-red-500/10 text-red-600 dark:text-red-400',       sign: '−' },
  reservation: { icon: ShoppingBag,  classes: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',    sign: '−' },
  adjustment:  { icon: RefreshCcw,   classes: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', sign: '±' },
};

const DATE_FMT = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function formatMovementDate(iso: string): string {
  return DATE_FMT.format(new Date(iso));
}

export default function StockPage() {
  const { data: summary } = useProductsSummary();
  const { data: movements, isLoading } = useStockMovements({ pageSize: 20 });

  const outOfStock = summary?.out_of_stock ?? 0;
  const lowStock = summary?.low_stock ?? 0;

  return (
    <>
      <TopBar title="Stock" />

      <div className="flex flex-col gap-5 p-4 pb-8">
        {/* CTAs principaux */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/stock/add"
            className="rounded-2xl bg-primary p-4 flex flex-col items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-transform"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground/15 text-primary-foreground">
              <PackagePlus size={20} />
            </div>
            <p className="text-sm font-semibold text-primary-foreground">Entrée stock</p>
          </Link>
          <Link
            href="/stock/out"
            className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 flex flex-col items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300">
              <PackageMinus size={20} />
            </div>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Sortie stock</p>
          </Link>
        </div>

        {/* Action secondaire — import facture (revue seulement à ce stade) */}
        <Link
          href="/stock/import-invoice"
          className="rounded-2xl border border-border bg-card px-4 py-3 flex items-center gap-3 active:scale-[0.98] transition-transform"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <ScanLine size={17} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Importer une facture</p>
            <p className="text-xs text-muted-foreground">Photo → analyse OCR → revue</p>
          </div>
        </Link>

        {/* Alertes */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/products"
            className={`rounded-2xl border p-4 flex flex-col gap-2 transition-all active:scale-[0.98] ${
              outOfStock > 0
                ? 'border-red-400/30 bg-red-500/5'
                : 'border-border bg-card'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">En rupture</p>
              <div className={`flex h-6 w-6 items-center justify-center rounded-lg ${
                outOfStock > 0
                  ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                  : 'bg-muted text-muted-foreground'
              }`}>
                <AlertCircle size={12} />
              </div>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${
              outOfStock > 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'
            }`}>
              {outOfStock}
            </p>
            <p className="text-[11px] text-muted-foreground/80">
              {outOfStock > 1 ? 'produits' : 'produit'} à réassortir
            </p>
          </Link>
          <Link
            href="/products"
            className={`rounded-2xl border p-4 flex flex-col gap-2 transition-all active:scale-[0.98] ${
              lowStock > 0
                ? 'border-amber-400/30 bg-amber-500/5'
                : 'border-border bg-card'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Stock faible</p>
              <div className={`flex h-6 w-6 items-center justify-center rounded-lg ${
                lowStock > 0
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'bg-muted text-muted-foreground'
              }`}>
                <AlertTriangle size={12} />
              </div>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${
              lowStock > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
            }`}>
              {lowStock}
            </p>
            <p className="text-[11px] text-muted-foreground/80">
              sous le seuil d&apos;alerte
            </p>
          </Link>
        </div>

        {/* Historique des mouvements */}
        <div className="rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <div className="flex items-center gap-2">
              <History size={15} className="text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Derniers mouvements</h2>
              {movements && movements.count > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                  {movements.count}
                </span>
              )}
            </div>
          </div>

          <div className="border-t border-border overflow-hidden rounded-b-2xl">
            {isLoading ? (
              <MovementsSkeleton />
            ) : !movements?.results.length ? (
              <EmptyMovements />
            ) : (
              <ul className="divide-y divide-border">
                {movements.results.map((m) => (
                  <MovementRow key={m.id} movement={m} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function MovementRow({ movement }: { movement: StockMovement }) {
  const visual = MOVEMENT_VISUAL[movement.movement_type];
  const Icon = visual.icon;
  // La quantité est un nombre de FORMATS — pas d'unité (mL/kg/pièce dépend du conditionnement,
  // déjà indiqué dans variant_name juste en dessous).
  const num = parseFloat(movement.quantity);
  const qty = Number.isInteger(num) ? num.toString() : num.toString().replace(/\.?0+$/, '');
  const showVariant = movement.variant_name && movement.variant_name !== 'Par défaut';

  return (
    <li>
      <Link
        href={`/products/${movement.product_id}`}
        className="flex items-start gap-3 px-4 py-3 active:bg-muted transition-colors"
      >
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl mt-0.5 ${visual.classes}`}>
          <Icon size={16} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {movement.product_name}
            </span>
            <span className={`text-sm font-semibold tabular-nums shrink-0 ${
              visual.sign === '+'
                ? 'text-green-600 dark:text-green-400'
                : visual.sign === '−'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-amber-600 dark:text-amber-400'
            }`}>
              {visual.sign} {qty}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate">
              {movement.movement_type_display}
              {showVariant && <> · {movement.variant_name}</>}
              {movement.reason && <> · {movement.reason}</>}
            </span>
            <span className="shrink-0 tabular-nums text-foreground/60">
              {formatMovementDate(movement.created_at)}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}

function MovementsSkeleton() {
  return (
    <div className="flex flex-col divide-y divide-border" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3">
          <div className="h-9 w-9 shrink-0 rounded-xl bg-muted animate-pulse" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="h-3.5 w-2/3 rounded bg-muted animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-3 w-14 rounded bg-muted animate-pulse mt-1" />
        </div>
      ))}
    </div>
  );
}

function EmptyMovements() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Boxes size={20} />
      </div>
      <p className="text-sm font-medium text-foreground">Aucun mouvement</p>
      <p className="text-xs text-muted-foreground max-w-xs">
        L&apos;historique des entrées et sorties de stock apparaîtra ici.
      </p>
    </div>
  );
}
