'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Wallet,
  Users,
  Package,
  Receipt,
  FileText,
  Calendar,
  ChevronLeft,
  ShieldCheck,
  Pencil,
  Trash2,
  Check,
  X,
} from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { PatrimoineTable } from '@/components/zakat/PatrimoineTable';
import { SimulationSlider } from '@/components/zakat/SimulationSlider';
import { NisabCard } from '@/components/zakat/NisabCard';
import { ReligiousNote } from '@/components/zakat/ReligiousNote';
import { WealthDonut } from '@/components/zakat/WealthDonut';
import { AuditCard } from '@/components/zakat/AuditCard';
import { ApiError } from '@/lib/api-client';
import {
  DEBT_CATEGORY_LABELS,
  EXCLUDED_ITEM_LABELS,
  RECEIVABLE_CATEGORY_LABELS,
  STOCK_CATEGORY_LABELS,
  formatMoney,
  useZakatCalculation,
  useReopenZakat,
  useDeleteZakatCalculation,
  type ExcludedItem,
} from '@/lib/hooks/useZakat';

const ALL_EXCLUDED_ITEMS: ExcludedItem[] = [
  'vehicle',
  'computer',
  'machine',
  'premises',
  'furniture',
  'other',
];

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
  const stockVentilated = calc.stock_breakdown && calc.stock_breakdown.length > 0;
  const stockAdjusted = !stockVentilated && calc.stock_value_adjusted !== null && calc.stock_value_adjusted !== '';
  const receivablesVentilated = calc.receivables_breakdown && calc.receivables_breakdown.length > 0;

  // Patrimoine entrant — on déploie les créances en sous-lignes si ventilation présente
  const receivablesRows = receivablesVentilated
    ? calc.receivables_breakdown.map((r) => ({
        label: RECEIVABLE_CATEGORY_LABELS[r.category],
        amount: r.amount,
        hint:
          r.category === 'doubtful'
            ? 'Archivée pour mémoire — non incluse dans la base'
            : undefined,
        tone: (r.category === 'doubtful' ? undefined : 'add') as 'add' | undefined,
        icon: <Users size={14} />,
      }))
    : [
        {
          label: 'Créances récupérables',
          amount: calc.receivables_amount,
          hint:
            calc.has_receivables && parseFloat(calc.receivables_nominal || '0') > 0
              ? `Sur un nominal de ${formatMoney(calc.receivables_nominal, calc.currency)}`
              : undefined,
          tone: 'add' as const,
          icon: <Users size={14} />,
        },
      ];

  const stockRows = stockVentilated
    ? calc.stock_breakdown.map((s) => ({
        label: STOCK_CATEGORY_LABELS[s.category],
        amount: s.amount,
        tone: 'add' as const,
        icon: <Package size={14} />,
      }))
    : [
        {
          label: stockAdjusted ? 'Stock commercial (ajusté)' : 'Stock commercial (estimé)',
          amount: calc.stock_value_for_base,
          hint: stockAdjusted
            ? `Estimation initiale : ${formatMoney(calc.stock_value_estimated, calc.currency)}`
            : undefined,
          tone: 'add' as const,
          icon: <Package size={14} />,
        },
      ];

  const patrimoineRows = [
    {
      label: 'Argent disponible',
      amount: calc.cash_amount,
      tone: 'add' as const,
      icon: <Wallet size={14} />,
    },
    ...receivablesRows,
    ...stockRows,
  ];

  // Note: receivables_amount = somme certaines+probables côté serveur (douteuses exclues).
  const patrimoineTotal =
    parseFloat(calc.cash_amount || '0') +
    parseFloat(calc.receivables_amount || '0') +
    parseFloat(calc.stock_value_for_base || '0');

  // Dettes — on garde toutes les lignes mais on signale celles qui ne sont pas déductibles
  const debtsRows = calc.debts_breakdown.map((d) => ({
    label: d.label || DEBT_CATEGORY_LABELS[d.category],
    amount: d.amount,
    hint: d.is_immediately_due
      ? `${DEBT_CATEGORY_LABELS[d.category]} · exigible immédiatement`
      : `${DEBT_CATEGORY_LABELS[d.category]} · non exigible — non déduit`,
    tone: (d.is_immediately_due ? 'sub' : undefined) as 'sub' | undefined,
    icon: <Receipt size={14} />,
  }));

  return (
    <>
      <TopBar title="Détail du calcul" />
      <div className="flex flex-col gap-4 p-4 pb-24">
        {/* Lien retour explicite — la TopBar n'est pas contextualisée sur cette page */}
        <Link
          href="/zakat"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors -mt-1"
        >
          <ChevronLeft size={16} />
          Retour
        </Link>

        {/* Méta : date de référence + finalisation */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar size={14} />
          <span>
            Référence&nbsp;:{' '}
            <span className="text-foreground font-medium">
              {new Date(calc.reference_date).toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </span>
          {calc.finalized_at && (
            <>
              <span>·</span>
              <span>
                Finalisé le{' '}
                {new Date(calc.finalized_at).toLocaleDateString('fr-FR', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </>
          )}
        </div>

        {/* Bloc résultat — le chiffre que le commerçant vient chercher */}
        <div className="rounded-3xl bg-primary text-primary-foreground px-5 py-6 flex flex-col gap-3">
          <p className="text-xs uppercase tracking-wide opacity-80">Zakat due</p>
          <p className="text-4xl font-bold tabular-nums leading-none">
            {formatMoney(calc.zakat_amount, calc.currency)}
          </p>
          <div className="h-px bg-primary-foreground/20" />
          {/* Formule de calcul visible — le but est que l'utilisateur comprenne d'où sort le chiffre */}
          <div className="flex flex-col gap-1 text-xs opacity-90">
            <p>
              Base zakatable&nbsp;:{' '}
              <span className="font-semibold tabular-nums">
                {formatMoney(calc.zakat_base, calc.currency)}
              </span>
            </p>
            <p>
              Taux appliqué&nbsp;: <span className="font-semibold tabular-nums">{ratePercent}&nbsp;%</span>
            </p>
            <p className="opacity-70 mt-1">
              {formatMoney(calc.zakat_base, calc.currency)} × {ratePercent}&nbsp;% ={' '}
              {formatMoney(calc.zakat_amount, calc.currency)}
            </p>
          </div>
        </div>

        {/* Patrimoine entrant — ce qui gonfle la base */}
        <PatrimoineTable
          title="Patrimoine zakatable"
          rows={patrimoineRows}
          total={patrimoineTotal}
          totalLabel="Sous-total positif"
          currency={calc.currency}
        />

        {/* Répartition visuelle du patrimoine — donut */}
        <WealthDonut calc={calc} />

        {/* Dettes — ce qui réduit la base */}
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

        {/* Formule détaillée — récapitulatif visuel arithmétique */}
        <div className="rounded-2xl border border-border bg-card px-4 py-3 flex flex-col gap-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Calcul détaillé
          </p>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground tabular-nums">
            <p>
              <span className="text-foreground">{formatMoney(patrimoineTotal, calc.currency)}</span>{' '}
              <span>(patrimoine)</span>
            </p>
            <p>
              <span className="text-destructive">
                − {formatMoney(calc.short_term_debts, calc.currency)}
              </span>{' '}
              <span>(dettes exigibles)</span>
            </p>
            <p className="border-t border-border/60 pt-1 mt-1">
              =&nbsp;
              <span className="text-foreground font-semibold">
                {formatMoney(calc.zakat_base, calc.currency)}
              </span>{' '}
              <span>(base)</span>
            </p>
            <p>
              × <span className="text-foreground">{ratePercent}&nbsp;%</span> ={' '}
              <span className="text-primary font-semibold">
                {formatMoney(calc.zakat_amount, calc.currency)}
              </span>
            </p>
          </div>
        </div>

        {/* Encart Nisab — verdict d'obligation ou message pédagogique si non configuré */}
        <NisabCard calc={calc} />

        {/* Audit automatique — score de fiabilité figé au moment de la finalisation */}
        <AuditCard calc={calc} />

        {/* Fondements religieux — section repliable rubrique par rubrique */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Fondements religieux
          </p>
          <ReligiousNote rubric="cash" />
          <ReligiousNote rubric="receivables" />
          <ReligiousNote rubric="stock" />
          <ReligiousNote rubric="excluded" />
          <ReligiousNote rubric="debts" />
          <ReligiousNote rubric="nisab" />
          <ReligiousNote rubric="rate" />
        </div>

        {/* Simulation interactive — "et si mon stock évoluait l'an prochain ?" */}
        <SimulationSlider calc={calc} />

        {/* Exclus de la base — on liste tous les items possibles avec check ou croix selon ce
            que l'utilisateur a explicitement reconnu. Permet de visualiser ce qu'il a oublié. */}
        <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-primary" size={16} />
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
              Exclus de la base
            </p>
          </div>
          <ul className="flex flex-col gap-1 text-xs">
            {ALL_EXCLUDED_ITEMS.map((item) => {
              const acknowledged = calc.excluded_items_acknowledged.includes(item);
              return (
                <li key={item} className="flex items-center gap-2">
                  {acknowledged ? (
                    <Check size={12} className="text-primary shrink-0" />
                  ) : (
                    <X size={12} className="text-muted-foreground/50 shrink-0" />
                  )}
                  <span className={acknowledged ? 'text-foreground' : 'text-muted-foreground/60'}>
                    {EXCLUDED_ITEM_LABELS[item]}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-muted-foreground mt-1">
            Les éléments cochés ont été explicitement reconnus comme outils de travail (hors base).
          </p>
        </div>

        {/* Téléchargement PDF — généré à la volée côté serveur, ouvert en onglet pour aperçu/impression. */}
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

        {/* Actions : modifier (rouvre en brouillon) ou supprimer définitivement */}
        <div className="grid grid-cols-2 gap-2">
          {calc.status === 'finalized' && (
            <button
              type="button"
              onClick={handleEdit}
              disabled={reopen.isPending}
              className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
            >
              <Pencil size={14} />
              {reopen.isPending ? 'Réouverture…' : 'Modifier'}
            </button>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={remove.isPending}
            className={`flex items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 ${
              calc.status === 'finalized' ? '' : 'col-span-2'
            }`}
          >
            <Trash2 size={14} />
            {remove.isPending ? 'Suppression…' : 'Supprimer'}
          </button>
        </div>

        {/* Rappel spirituel */}
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
