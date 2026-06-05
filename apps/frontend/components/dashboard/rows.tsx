import Link from 'next/link';
import { formatStock, type ProductUnit } from '@/lib/hooks/useProducts';

export function OrderRow({
  id, label, sub, value,
}: {
  id: string;
  label: string;
  sub?: string | null;
  value: string;
}) {
  return (
    <Link
      href={`/orders/${id}`}
      className="flex items-center justify-between px-4 py-3 active:bg-muted/60 transition-colors"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-base font-medium text-foreground">{label}</span>
        {sub && <span className="text-sm text-muted-foreground">{sub}</span>}
      </div>
      <span className="text-base font-semibold text-foreground tabular-nums">{value}</span>
    </Link>
  );
}

export function StockRow({
  id, name, variantName, qty, unit, baseQuantity,
}: {
  id: string;
  name: string;
  variantName: string;
  qty: string;
  unit: ProductUnit;
  baseQuantity: string;
}) {
  const num = parseFloat(qty);
  const isOut = num <= 0;
  return (
    <Link
      href={`/products/${id}`}
      className="flex items-center justify-between px-4 py-3 active:bg-muted/60 transition-colors gap-3"
    >
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-base font-medium text-foreground truncate">{name}</span>
        <span className="text-xs text-muted-foreground truncate">{variantName}</span>
      </div>
      <span className={`text-sm font-semibold tabular-nums shrink-0 ${isOut ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`}>
        {isOut ? 'Rupture' : `${formatStock(qty, unit, { baseQuantity, packagingName: variantName })} restants`}
      </span>
    </Link>
  );
}

export function ReminderRow({ title, due_at }: { title: string; due_at: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-base font-medium text-foreground flex-1 truncate pr-3">{title}</span>
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        {new Date(due_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
}

export function SeeAllRow({ href, count }: { href: string; count: number }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-center px-4 py-2.5 text-sm font-medium text-muted-foreground active:bg-muted/60 transition-colors"
    >
      Voir tout ({count}) →
    </Link>
  );
}
