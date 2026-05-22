'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/ui/floating-fields';

interface StockEstimate {
  stock_value_estimated: string;
  currency: string;
  disclaimer: string;
  product_count: number;
}

interface ZakatCalculation {
  id: string;
  reference_date: string;
  stock_value_estimated: string;
  stock_value_adjusted: string | null;
  stock_value_display: string;
  cash_amount: string;
  receivables_amount: string;
  short_term_debts: string;
  zakat_base: string;
  zakat_rate: string;
  zakat_amount: string;
  currency: string;
  notes: string;
  created_at: string;
}

interface ZakatCalculationPayload {
  reference_date: string;
  cash_amount: string;
  receivables_amount: string;
  short_term_debts: string;
  notes: string;
}

export default function ZakatPage() {
  const qc = useQueryClient();
  const [showForm,    setShowForm]    = useState(false);
  const [cashAmount,  setCashAmount]  = useState('');
  const [receivables, setReceivables] = useState('');
  const [debts,       setDebts]       = useState('');
  const [notes,       setNotes]       = useState('');
  const [refDate,     setRefDate]     = useState(new Date().toISOString().split('T')[0]);

  const { data: estimate } = useQuery({
    queryKey: ['zakat-estimate'],
    queryFn: () => apiFetch<StockEstimate>('/zakat/stock-estimate/'),
  });

  const { data: calculations, isLoading } = useQuery({
    queryKey: ['zakat-calculations'],
    queryFn: () => apiFetch<{ results: ZakatCalculation[] }>('/zakat/calculations/'),
  });

  const create = useMutation({
    mutationFn: (payload: ZakatCalculationPayload) =>
      apiFetch<ZakatCalculation>('/zakat/calculations/', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['zakat-calculations'] });
      setShowForm(false);
      setCashAmount(''); setReceivables(''); setDebts(''); setNotes('');
    },
  });

  return (
    <>
      <TopBar title="Zakat commerciale" />
      <div className="flex flex-col gap-4 p-4">

        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Estimation indicative</p>
          <p className="text-xs text-amber-700">
            Ce calcul est fourni à titre indicatif uniquement. Consultez un érudit ou un spécialiste pour votre calcul de zakat.
          </p>
        </div>

        {estimate && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Valeur du stock zakatable (estimation)</p>
            <p className="text-2xl font-bold text-foreground">
              {estimate.stock_value_estimated} {estimate.currency}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{estimate.product_count} produit(s) actif(s)</p>
          </div>
        )}

        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Annuler' : '+ Nouveau calcul'}
        </Button>

        {showForm && (
          <div className="flex flex-col gap-3">
            <FloatingInput
              id="ref-date"
              label="Date de référence"
              type="date"
              value={refDate}
              onChange={(e) => setRefDate(e.target.value)}
            />
            <FloatingInput
              id="cash"
              label="Liquidités (trésorerie)"
              type="number" step="0.01" min="0"
              value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)}
            />
            <FloatingInput
              id="receivables"
              label="Créances (argent dû)"
              type="number" step="0.01" min="0"
              value={receivables}
              onChange={(e) => setReceivables(e.target.value)}
            />
            <FloatingInput
              id="debts"
              label="Dettes court terme"
              type="number" step="0.01" min="0"
              value={debts}
              onChange={(e) => setDebts(e.target.value)}
            />
            <FloatingInput
              id="notes"
              label="Notes (optionnel)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <Button
              disabled={!refDate || create.isPending}
              onClick={() => create.mutate({
                reference_date: refDate,
                cash_amount: cashAmount || '0',
                receivables_amount: receivables || '0',
                short_term_debts: debts || '0',
                notes,
              })}
            >
              {create.isPending ? 'Calcul…' : 'Calculer et enregistrer'}
            </Button>
          </div>
        )}

        {isLoading && <p className="text-sm text-muted-foreground text-center">Chargement…</p>}

        {!isLoading && (calculations?.results ?? []).length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground px-1">Historique des calculs</p>
            {calculations!.results.map((c) => (
              <div key={c.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-foreground">
                    {new Date(c.reference_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>
                  <p className="text-lg font-bold text-foreground">{c.zakat_amount} {c.currency}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>Stock : {c.stock_value_display.split(' ')[0]} {c.currency}</span>
                  <span>Trésorerie : {c.cash_amount} {c.currency}</span>
                  <span>Créances : {c.receivables_amount} {c.currency}</span>
                  <span>Dettes : {c.short_term_debts} {c.currency}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Base zakatable : {c.zakat_base} {c.currency} · Taux : {(parseFloat(c.zakat_rate) * 100).toFixed(1)}%</p>
                <p className="text-[10px] text-amber-600 mt-1">Estimation indicative</p>
              </div>
            ))}
          </div>
        )}

        {!isLoading && (calculations?.results ?? []).length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground text-center py-4">Aucun calcul enregistré.</p>
        )}
      </div>
    </>
  );
}
