'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, FileText } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { PatrimoineTable } from '@/components/zakat/PatrimoineTable';
import { SimulationSlider } from '@/components/zakat/SimulationSlider';
import { NisabCard } from '@/components/zakat/NisabCard';
import { WealthDonut } from '@/components/zakat/WealthDonut';
import { AuditCard } from '@/components/zakat/AuditCard';
import { ResultHero } from '@/components/zakat/detail/ResultHero';
import { CalcDetailCard } from '@/components/zakat/detail/CalcDetailCard';
import { ExcludedItemsList } from '@/components/zakat/detail/ExcludedItemsList';
import { ReligiousNotesGroup } from '@/components/zakat/detail/ReligiousNotesGroup';
import { DetailActions } from '@/components/zakat/detail/DetailActions';
import { buildDebtsRows, buildPatrimoineRows, computePatrimoineTotal } from '@/components/zakat/detail/rows';
import { ApiError } from '@/lib/api-client';
import {
  useZakatCalculation,
  useReopenZakat,
  useDeleteZakatCalculation,
} from '@/lib/hooks/useZakat';

export default function ZakatDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: calc, isLoading } = useZakatCalculation(id);
  const reopen = useReopenZakat();
  const remove = useDeleteZakatCalculation();

  const handleEdit = async () => {
    if (!calc) return;
    try {
      await reopen.mutateAsync(calc.id);
      router.push('/zakat/new');
    } catch (err) {
      const message = err instanceof ApiError && err.data && typeof err.data === 'object'
        ? ((err.data as { detail?: string }).detail ?? 'Impossible de rouvrir ce calcul.')
        : 'Impossible de rouvrir ce calcul.';
      window.alert(message);
    }
  };

  const handleDelete = async () => {
    if (!calc) return;
    if (!window.confirm(
      'Supprimer définitivement ce calcul de l\'historique ? Cette action est irréversible.',
    )) return;
    await remove.mutateAsync(calc.id);
    router.push('/zakat');
  };

  if (isLoading) {
    return (
      <>
        <TopBar title="Détail du calcul" />
        <p className="text-sm text-muted-foreground text-center py-12">Chargement…</p>
      </>
    );
  }

  if (!calc) {
    return (
      <>
        <TopBar title="Détail du calcul" />
        <div className="flex flex-col gap-3 px-4 py-8 items-center">
          <p className="text-sm text-muted-foreground">Calcul introuvable.</p>
          <Link href="/zakat" className="text-sm text-primary underline">
            Retour à la zakat
          </Link>
        </div>
      </>
    );
  }

  const ratePercent = (parseFloat(calc.zakat_rate) * 100).toFixed(2);
  const patrimoineRows = buildPatrimoineRows(calc);
  const patrimoineTotal = computePatrimoineTotal(calc);
  const debtsRows = buildDebtsRows(calc);

  return (
    <>
      <TopBar title="Détail du calcul" />
      <div className="flex flex-col gap-4 p-4 pb-24">
        <Link
          href="/zakat"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors -mt-1"
        >
          <ChevronLeft size={16} />
          Retour
        </Link>

        <ResultHero calc={calc} ratePercent={ratePercent} />

        <PatrimoineTable
          title="Patrimoine zakatable"
          rows={patrimoineRows}
          total={patrimoineTotal}
          totalLabel="Sous-total positif"
          currency={calc.currency}
        />

        <WealthDonut calc={calc} />

        {calc.debts_breakdown.length > 0 && (
          <PatrimoineTable
            title="Dettes déclarées"
            rows={debtsRows}
            total={calc.short_term_debts}
            totalLabel="Total déductible"
            currency={calc.currency}
            tone="negative"
          />
        )}

        <CalcDetailCard calc={calc} patrimoineTotal={patrimoineTotal} ratePercent={ratePercent} />

        <NisabCard calc={calc} />
        <AuditCard calc={calc} />
        <ReligiousNotesGroup />
        <SimulationSlider calc={calc} />
        <ExcludedItemsList acknowledged={calc.excluded_items_acknowledged} />

        {calc.status === 'finalized' && (
          <a
            href={`/api/proxy/zakat/calculations/${calc.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <FileText size={16} />
            Télécharger le justificatif PDF
          </a>
        )}

        <DetailActions
          isFinalized={calc.status === 'finalized'}
          onEdit={handleEdit}
          onDelete={handleDelete}
          isEditing={reopen.isPending}
          isDeleting={remove.isPending}
        />

        <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-xs text-amber-700">
            Ce calcul est fourni à titre indicatif. Pour valider votre obligation, consultez un
            érudit ou un spécialiste de la zakat commerciale.
          </p>
        </div>
      </div>
    </>
  );
}
