import Link from 'next/link';
import { ArrowRight, Coins } from 'lucide-react';

export function ZakatBanner({ daysUntil }: { daysUntil: number }) {
  return (
    <Link
      href="/zakat"
      className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/40 p-4 flex items-center gap-3 active:scale-[0.99] transition-transform"
    >
      <span className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 shrink-0">
        <Coins size={18} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {daysUntil === 0 ? "Zakat aujourd'hui" : `Zakat dans ${daysUntil} jour${daysUntil > 1 ? 's' : ''}`}
        </p>
        <p className="text-xs text-muted-foreground">Préparer le calcul de la zakat annuelle.</p>
      </div>
      <ArrowRight size={16} className="text-muted-foreground shrink-0" />
    </Link>
  );
}
