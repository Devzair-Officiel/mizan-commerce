'use client';

import { useCallback, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useDraftCompliance, type ComplianceIssue, type DraftDocuments, type DraftKind } from '@/lib/hooks/useDocumentDrafts';
import { useInvoiceSettings } from '@/lib/hooks/useInvoiceSettings';
import type { Shop } from '@/lib/hooks/useShop';
import { editorDefaults, editorSchema, estimateTotals, type EditorValues } from './editorSchema';
import { useDraftAutosave } from './useDraftAutosave';
import { useIssueFlow } from './useIssueFlow';

/**
 * État de l'éditeur (facture ou devis) : formulaire, enregistrement automatique, totaux estimés (taux du brouillon,
 * sinon celui qu'appliquera le serveur), vérification avant émission ou envoi et « Compléter ».
 */
export function useInvoiceEditor<K extends DraftKind>(kind: K, draft: DraftDocuments[K] | undefined, shop: Shop) {
  const t = useTranslations('invoices.editor');
  const router = useRouter();
  const { data: settings } = useInvoiceSettings();
  const schema = useMemo(() => editorSchema(t, kind), [t, kind]);
  const form = useForm<EditorValues>({ resolver: zodResolver(schema), mode: 'onChange', defaultValues: editorDefaults(draft, shop) });
  const { reset } = form;
  const onReload = useCallback((saved: DraftDocuments[K]) => reset(editorDefaults(saved, shop)), [reset, shop]);
  const autosave = useDraftAutosave(kind, form, draft, onReload);
  const validate = useCallback(() => form.trigger(undefined, { shouldFocus: true }), [form]);
  const flow = useIssueFlow(kind, { flush: autosave.flush, validate });
  const { data: compliance } = useDraftCompliance(kind, autosave.id);

  const [lines, discount, shipping, operation, days, customer, validity] = useWatch({
    control: form.control, name: ['lines', 'discount_amount', 'shipping_amount', 'operation_category', 'payment_terms_days', 'customer', 'validity_days'],
  });
  const taxRate = draft?.tax_rate ?? (settings?.invoice_vat_regime === 'exempt' ? '0' : shop.default_tax_rate);
  const totals = estimateTotals({ lines, discount_amount: discount, shipping_amount: shipping }, taxRate);
  const recommended = compliance?.issues.filter((i) => i.level === 'recommended').length ?? 0;

  const setCustomer = (id: string) => {
    form.setValue('customer', id, { shouldDirty: true });
    autosave.schedule();
  };

  /**
   * « Compléter » : ferme la vérification et mène au champ, ou (saisie enregistrée avant) à la fiche
   * du client pour son SIREN, à l'identité de la boutique pour son nom et aux paramètres de facture
   * pour les autres mentions du vendeur.
   */
  const complete = (issue: ComplianceIssue) => {
    flow.close();
    const page = issue.code === 'customer_siren' && customer ? `/customers/${customer}/edit`
      : issue.code === 'seller_name' ? '/settings' : issue.target === 'invoice_settings' ? '/settings/invoices' : null;
    if (page) void autosave.flush().then((id) => { if (id) router.push(page); });
    else if (issue.target === 'lines') form.setFocus('lines.0.description');
    else document.getElementById('invoice-customer')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  return { form, autosave, flow, totals, taxRate, operation, days, validity, customer, recommended, setCustomer, complete };
}
