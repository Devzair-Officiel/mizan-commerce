'use client';

import { useTranslations } from 'next-intl';
import { SectionChips } from '@/components/orders/new/SectionChips';
import { NotesSection } from '@/components/orders/new/NotesSection';
import { PaymentPartialInput } from '@/components/orders/new/PaymentPartialInput';
import { StatusSwitch } from '@/components/orders/new/StatusSwitch';
import { useShop } from '@/lib/hooks/useShop';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import type { NewSaleForm } from '@/lib/hooks/useNewSaleForm';

/** Paiement, statut et note de la nouvelle commande (absents en modification : gérés depuis le détail). */
export function MobilePaymentCard({ form }: { form: NewSaleForm }) {
  const t = useTranslations('orders.new');
  const tPayment = useTranslations('orders.payment');
  const { data: shop } = useShop();
  const catalogKind = useCatalogKind();

  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-4">
      <SectionChips title={t('payment_title')}
        titleClassName="text-[0.8125rem] font-medium text-muted-foreground"
        options={[
          { value: 'unpaid', label: tPayment('unpaid') },
          { value: 'partial', label: tPayment('partial') },
          { value: 'paid', label: tPayment('paid') },
        ]}
        value={form.paymentStatus}
        onChange={(v) => { form.setPaymentStatus(v as 'unpaid' | 'partial' | 'paid'); form.setPaymentError(''); }}
      >
        {form.paymentStatus === 'partial' && (
          <PaymentPartialInput amountPaid={form.amountPaid} paymentError={form.paymentError}
            onAmountPaidChange={(v) => { form.setAmountPaid(v); form.setPaymentError(''); }} />
        )}
      </SectionChips>
      <StatusSwitch value={form.orderStatus} onChange={form.setOrderStatus}
        fm={shop?.fulfillment_mode ?? null} catalogKind={catalogKind} />
      <NotesSection notes={form.notes} showNotes={form.showNotes} onNotesChange={form.setNotes}
        onShow={() => form.setShowNotes(true)} onHide={() => form.setShowNotes(false)} />
    </div>
  );
}
