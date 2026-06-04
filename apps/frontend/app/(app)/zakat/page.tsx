'use client';

import Link from 'next/link';
import { ArrowRight, FileText, RefreshCw, Sparkles } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { HistoryChart } from '@/components/zakat/HistoryChart';
import {
  formatMoney,
  useZakatCalculations,
  useZakatCurrentDraft,
  useZakatStockEstimate,
} from '@/lib/hooks/useZakat';

export default function ZakatPage() {
  const { data: estimate } = useZakatStockEstimate();
  const { data: draft } = useZakatCurrentDraft();
  const { data: finalized, isLoading } = useZakatCalculations('finalized');

  const currency = estimate?.currency ?? 'EUR';
  const draftStepLabel = draft ? `Étape ${draft.current_step + 1} sur 6` : null;

  return (
    <>
      <TopBar title="Zakat commerciale" />
      <div className="flex flex-col gap-4 p-4 pb-24">
        {/* Bandeau pédagogique permanent — la zakat reste un avis spirituel */}
        <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
            Estimation indicative
          </p>
          <p className="text-xs text-amber-700">
            Ce calcul est un outil d'aide à la décision. Consultez un érudit ou un spécialiste pour
            validation finale.
          </p>
        </div>

        {/* Reprise de brouillon — toujours en haut quand il existe */}
        {draft && (
          <Link
            href="/zakat/new"
            className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 hover:bg-primary/10 transition-colors"
          >
            <RefreshCw className="text-primary shrink-0" size={20} />
            <div className="flex-1 flex flex-col">
              <p className="text-sm font-medium text-foreground">Reprendre votre calcul en cours</p>
              <p className="text-xs text-muted-foreground">{draftStepLabel}</p>
            </div>
            <ArrowRight className="text-primary shrink-0" size={18} />
          </Link>
        )}

        {/* Carte d'estimation stock */}
        {estimate && (
          <div className="rounded-2xl border border-border bg-card px-4 py-4">
            <p className="text-xs text-muted-foreground mb-1">
              Valeur estimée de votre stock commercial
            </p>
            <p className="text-2xl font-semibold text-foreground tabular-nums">
              {formatMoney(estimate.stock_value_estimated, estimate.currency)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Calculée sur {estimate.product_count} produit{estimate.product_count > 1 ? 's' : ''}{' '}
              de votre catalogue.
            </p>
          </div>
        )}

        {/* CTA principal — masqué quand un brouillon existe pour ne pas dédoubler avec la bannière. */}
        {!draft && (
          <Link href="/zakat/new" className="block">
            <Button className="w-full">
              <Sparkles size={16} className="mr-2" />
              Calculer ma zakat
            </Button>
          </Link>
        )}

        {/* Historique des calculs finalisés */}
        {isLoading && (
          <p className="text-sm text-muted-foreground text-center py-4">Chargement…</p>
        )}

        {!isLoading && (finalized?.results ?? []).length >= 2 && (
          <HistoryChart calculations={finalized!.results} />
        )}

        {!isLoading && (finalized?.results ?? []).length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
              Historique
            </p>
            {finalized!.results.map((c) => (
              <Link
                key={c.id}
                href={`/zakat/${c.id}`}
                className="rounded-2xl border border-border bg-card px-4 py-3 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-foreground">
                    {new Date(c.reference_date).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                  <p className="text-base font-semibold text-foreground tabular-nums">
                    {formatMoney(c.zakat_amount, c.currency)}
                  </p>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Base : <span className="tabular-nums">{formatMoney(c.zakat_base, c.currency)}</span>
                  </span>
                  <span className="flex items-center gap-1 text-primary">
                    <FileText size={12} />
                    PDF disponible
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {!isLoading && (finalized?.results ?? []).length === 0 && !draft && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Aucun calcul finalisé pour l'instant.
          </p>
        )}

        <p className="text-[11px] text-muted-foreground text-center px-4 mt-2">
          Devise utilisée&nbsp;: {currency}
        </p>
      </div>
    </>
  );
}
