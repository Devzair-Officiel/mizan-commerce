'use client';

import { useState } from 'react';
import { Sparkles, TrendingUp, TrendingDown } from 'lucide-react';
import { formatMoney, type ZakatCalculation } from '@/lib/hooks/useZakat';

interface SimulationSliderProps {
  calc: ZakatCalculation;
}

/** Recalcul pur côté client — on rejoue la formule du backend pour montrer un "what if". */
function simulate(calc: ZakatCalculation, stockPct: number) {
  const cash = parseFloat(calc.cash_amount || '0');
  const receivables = parseFloat(calc.receivables_amount || '0');
  const baseStock = parseFloat(calc.stock_value_for_base || '0');
  const debts = parseFloat(calc.short_term_debts || '0');
  const rate = parseFloat(calc.zakat_rate || '0');

  const adjustedStock = baseStock * (1 + stockPct / 100);
  const base = Math.max(cash + receivables + adjustedStock - debts, 0);
  const zakat = base * rate;
  return { adjustedStock, base, zakat };
}

const PRESETS = [-20, -10, 0, 10, 20];

export function SimulationSlider({ calc }: SimulationSliderProps) {
  const [pct, setPct] = useState(0);
  const sim = simulate(calc, pct);
  const baselineZakat = parseFloat(calc.zakat_amount || '0');
  const delta = sim.zakat - baselineZakat;
  const deltaSign = delta > 0.005 ? 'up' : delta < -0.005 ? 'down' : 'flat';

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-4 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Sparkles className="text-primary" size={16} />
        <div className="flex-1 flex flex-col">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
            Simulation
          </p>
          <p className="text-xs text-muted-foreground">
            Et si votre stock évoluait l&apos;année prochaine&nbsp;?
          </p>
        </div>
      </div>

      {/* Slider — range natif stylisé via accent-color */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <p className="text-xs text-muted-foreground">Variation du stock</p>
          <p
            className={`text-sm font-semibold tabular-nums ${
              pct > 0 ? 'text-primary' : pct < 0 ? 'text-destructive' : 'text-foreground'
            }`}
          >
            {pct > 0 ? '+' : ''}
            {pct}&nbsp;%
          </p>
        </div>
        <input
          type="range"
          min={-50}
          max={100}
          step={1}
          value={pct}
          onChange={(e) => setPct(parseInt(e.target.value, 10))}
          className="w-full accent-primary cursor-pointer"
          aria-label="Variation du stock en pourcentage"
        />
        {/* Presets rapides — touche tactile facile sur mobile */}
        <div className="flex gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setPct(preset)}
              className={`flex-1 rounded-lg px-2 py-1 text-xs font-medium tabular-nums transition-colors ${
                pct === preset
                  ? 'bg-primary/15 text-primary'
                  : 'bg-muted/40 text-muted-foreground hover:text-foreground'
              }`}
            >
              {preset > 0 ? '+' : ''}
              {preset}%
            </button>
          ))}
        </div>
      </div>

      {/* Résultat simulé — on garde la même hiérarchie que le bloc principal pour la lisibilité */}
      <div className="rounded-xl bg-muted/30 px-3 py-3 flex flex-col gap-2">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">Nouveau stock</span>
          <span className="text-foreground tabular-nums">
            {formatMoney(sim.adjustedStock, calc.currency)}
          </span>
        </div>
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">Nouvelle base</span>
          <span className="text-foreground tabular-nums">
            {formatMoney(sim.base, calc.currency)}
          </span>
        </div>
        <div className="h-px bg-border/60" />
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">Zakat simulée</span>
          <span className="text-base font-semibold text-primary tabular-nums">
            {formatMoney(sim.zakat, calc.currency)}
          </span>
        </div>
        {deltaSign !== 'flat' && (
          <div className="flex items-center justify-end gap-1 text-xs">
            {deltaSign === 'up' ? (
              <TrendingUp size={12} className="text-primary" />
            ) : (
              <TrendingDown size={12} className="text-destructive" />
            )}
            <span
              className={`tabular-nums ${
                deltaSign === 'up' ? 'text-primary' : 'text-destructive'
              }`}
            >
              {delta > 0 ? '+' : ''}
              {formatMoney(delta, calc.currency)} vs réel
            </span>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Cette projection ne modifie pas votre calcul archivé — elle vous aide à anticiper l&apos;an
        prochain.
      </p>
    </div>
  );
}
