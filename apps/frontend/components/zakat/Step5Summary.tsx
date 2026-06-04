'use client';

import Link from 'next/link';
import { CheckCircle2, Scale, AlertTriangle, ArrowRight } from 'lucide-react';
import { formatMoney, type ZakatCalculation } from '@/lib/hooks/useZakat';
import { useShop } from '@/lib/hooks/useShop';
import { ReligiousNote } from './ReligiousNote';
import { AuditCard } from './AuditCard';

interface Step5Props {
  calc: ZakatCalculation;
}

interface RowProps {
  label: string;
  amount: string | number;
  currency: string;
  tone?: 'add' | 'sub' | 'neutral';
}

function Row({ label, amount, currency, tone = 'neutral' }: RowProps) {
  const color =
    tone === 'add' ? 'text-foreground' : tone === 'sub' ? 'text-destructive' : 'text-foreground';
  const sign = tone === 'sub' ? '−' : tone === 'add' ? '+' : '';
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-border/60 last:border-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium tabular-nums ${color}`}>
        {sign} {formatMoney(amount, currency)}
      </p>
    </div>
  );
}

const NISAB_GRAMS: Record<'silver' | 'gold', number> = { silver: 595, gold: 85 };

export function Step5Summary({ calc }: Step5Props) {
  const { data: shop } = useShop();
  const stockForBase = calc.stock_value_for_base;
  const stockVentilated = calc.stock_breakdown && calc.stock_breakdown.length > 0;
  const stockAdjusted = !stockVentilated && calc.stock_value_adjusted !== null && calc.stock_value_adjusted !== '';
  const stockLabel = stockVentilated
    ? 'Stock (ventilé)'
    : stockAdjusted
      ? 'Stock (ajusté)'
      : 'Stock (estimé)';

  // Projection client-side : sur un brouillon, le serveur n'a pas encore calculé zakat_base
  // (gelé seulement à la finalisation). On reproduit ici la même formule pour donner l'aperçu.
  const cash = parseFloat(calc.cash_amount || '0');
  const receivables = parseFloat(calc.receivables_amount || '0');
  const stock = parseFloat(stockForBase || '0');
  const debts = parseFloat(calc.short_term_debts || '0');
  const projectedBase = Math.max(0, cash + receivables + stock - debts);
  const projectedAmount = projectedBase * parseFloat(calc.zakat_rate);

  // Préview Nisab : on calcule le seuil côté client à partir des paramètres boutique en cours,
  // puisque le serveur ne le snapshote qu'à la finalisation.
  const nisabUnitPrice = shop?.nisab_unit_price ? parseFloat(shop.nisab_unit_price) : null;
  const nisabMethod = shop?.nisab_method ?? 'silver';
  const nisabThreshold =
    nisabUnitPrice && nisabUnitPrice > 0 ? nisabUnitPrice * NISAB_GRAMS[nisabMethod] : null;
  const isAboveNisab = nisabThreshold !== null ? projectedBase >= nisabThreshold : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3">
        <CheckCircle2 className="text-primary shrink-0 mt-0.5" size={18} />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">Récapitulatif avant validation</p>
          <p className="text-xs text-muted-foreground">
            Vérifiez les chiffres. Une fois la zakat finalisée, le calcul est archivé et ne peut
            plus être modifié.
          </p>
        </div>
      </div>

      {/* Patrimoine entrant */}
      <div className="rounded-2xl border border-border bg-card px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Votre patrimoine entrant
        </p>
        <Row
          label="Argent disponible"
          amount={calc.cash_amount}
          currency={calc.currency}
          tone="add"
        />
        <Row
          label="Créances récupérables"
          amount={calc.receivables_amount}
          currency={calc.currency}
          tone="add"
        />
        <Row
          label={stockLabel}
          amount={stockForBase}
          currency={calc.currency}
          tone="add"
        />
      </div>

      {/* Déductions */}
      <div className="rounded-2xl border border-border bg-card px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Déductions
        </p>
        <Row
          label="Dettes exigibles immédiatement"
          amount={calc.short_term_debts}
          currency={calc.currency}
          tone="sub"
        />
      </div>

      {/* Résultat clé — projection client-side (le serveur fige à la finalisation) */}
      <div className="rounded-2xl bg-primary text-primary-foreground px-5 py-5 flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-xs uppercase tracking-wide opacity-80">Base de la zakat (projection)</p>
          <p className="text-xl font-semibold tabular-nums">
            {formatMoney(projectedBase, calc.currency)}
          </p>
        </div>
        <div className="h-px bg-primary-foreground/20" />
        <div className="flex flex-col gap-0.5">
          <p className="text-xs uppercase tracking-wide opacity-80">
            Zakat due ({(parseFloat(calc.zakat_rate) * 100).toFixed(2)}&nbsp;%)
          </p>
          <p className="text-3xl font-bold tabular-nums">
            {formatMoney(projectedAmount, calc.currency)}
          </p>
        </div>
      </div>

      {/* Préview Nisab — verdict d'obligation calculé côté client avant la finalisation. */}
      {nisabThreshold !== null && isAboveNisab !== null ? (
        <div
          className={`rounded-2xl border px-4 py-3 flex flex-col gap-2 ${
            isAboveNisab
              ? 'border-primary/30 bg-primary/5'
              : 'border-emerald-200 bg-emerald-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <Scale className={isAboveNisab ? 'text-primary' : 'text-emerald-700'} size={16} />
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
              Seuil de Nisab
            </p>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Méthode {nisabMethod === 'silver' ? 'argent (595 g)' : 'or (85 g)'}
            </p>
            <p className="text-sm font-semibold tabular-nums text-foreground">
              {formatMoney(nisabThreshold, calc.currency)}
            </p>
          </div>
          <p className={`text-xs ${isAboveNisab ? 'text-muted-foreground' : 'text-emerald-800'}`}>
            {isAboveNisab
              ? 'Votre base dépasse le seuil — la zakat est due.'
              : 'Votre base reste sous le seuil — la zakat n\'est pas obligatoire cette année.'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3">
          <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
          <div className="flex flex-col gap-1.5 flex-1">
            <p className="text-sm font-medium text-amber-900">Seuil de Nisab non configuré</p>
            <p className="text-xs text-amber-800">
              Sans Nisab, impossible de savoir si la zakat est obligatoire pour vous cette année.
            </p>
            <Link
              href="/settings"
              className="self-start mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-900 hover:text-amber-700 transition-colors"
            >
              Configurer dans les paramètres
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      )}

      {/* Audit automatique — visible avant validation pour permettre au commerçant de revenir affiner */}
      <AuditCard calc={calc} />

      <ReligiousNote rubric="nisab" />
      <ReligiousNote rubric="rate" />

      <p className="text-xs text-muted-foreground px-1 text-center">
        Le bouton ci-dessous archive ce calcul et le rend immuable. Vous pourrez revenir y consulter
        le détail à tout moment.
      </p>
    </div>
  );
}
