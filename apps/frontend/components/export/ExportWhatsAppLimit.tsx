'use client';

import { useTranslations } from 'next-intl';
import { TriangleAlert } from 'lucide-react';
import type { ExportKind, ExportSummary } from '@/lib/hooks/useExports';
import type { ExportActions } from './useExportActions';

interface ExportWhatsAppLimitProps {
  kind: ExportKind;
  summary: ExportSummary;
  actions: ExportActions;
  /** Prépare le PDF et le résumé, partagés ensemble par le bouton du pied. */
  onShareBundle: () => void;
  onUseFormat: (format: 'pdf' | 'csv') => void;
}

/**
 * Message tronqué : combien de lignes il détaille, et comment tout envoyer. Mobile avec partage
 * de fichiers : PDF et résumé ensemble ; sinon, passage au PDF, ou au CSV au-delà du plafond du PDF.
 * Affiché à la place de la description du format ; action en texte : le seul bouton plein reste
 * celui du pied.
 */
export function ExportWhatsAppLimit({ kind, summary, actions, onShareBundle, onUseFormat }: ExportWhatsAppLimitProps) {
  const t = useTranslations('export');
  const target = summary.rows > summary.pdf_max_rows ? 'csv' : 'pdf';
  const action = actions.step === 'share_bundle' ? null
    : target === 'pdf' && actions.canShareBundle ? { label: t('share_bundle'), onClick: onShareBundle }
      : { label: t(target === 'csv' ? 'use_csv' : 'use_pdf'), onClick: () => onUseFormat(target) };
  return (
    <div role="status" className="flex items-start gap-2 rounded-xl bg-amber-400/15 px-3 py-2 text-[0.8125rem] text-amber-700 dark:text-amber-300">
      <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
      <p>
        {t('whatsapp_limit', { kind, max: summary.whatsapp_max_rows, count: summary.rows, target })}
        {action && (
          <>
            {' '}
            {/* En ligne pour tenir à 360×640 ; zone de clic agrandie (après) sans changer la hauteur de ligne. */}
            <button type="button" onClick={action.onClick} disabled={actions.pending}
              className="relative font-semibold text-primary underline-offset-4 outline-none after:absolute after:inset-x-0 after:-inset-y-2 hover:underline focus-visible:ring-3 focus-visible:ring-primary/30 disabled:opacity-50">
              {action.label}
            </button>
          </>
        )}
      </p>
    </div>
  );
}
