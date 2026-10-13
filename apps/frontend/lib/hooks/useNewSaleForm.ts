import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useShop } from '@/lib/hooks/useShop';
import { useCreateOrder, type Order } from '@/lib/hooks/useOrders';
import { useCustomer } from '@/lib/hooks/useCustomers';
import { useNewSaleLines, toItemPayload, type NewSaleLines } from '@/lib/hooks/useNewSaleLines';
import { draftFromOrder, hasOrderChanges, useOrderEditSave, type OrderEditDraft } from '@/lib/hooks/useOrderEditSave';

type PaymentChoice = 'unpaid' | 'partial' | 'paid';
type StatusChoice = 'to_prepare' | 'shipped';

/** Création d'une commande, ou modification d'une commande existante sur le même écran. */
export type SaleFormOptions = { mode: 'create' } | { mode: 'edit'; order: Order };

function validatePayment(
  paymentStatus: PaymentChoice,
  amountPaid: string,
  total: number,
  t: ReturnType<typeof useTranslations<'orders.new'>>,
): string | null {
  if (paymentStatus !== 'partial') return null;
  const n = parseFloat(amountPaid);
  if (!n || n <= 0) return t('payment_amount_required');
  if (n > total) return t('payment_amount_exceeds');
  return null;
}

export interface NewSaleForm extends NewSaleLines {
  mode: 'create' | 'edit';
  /** Quelque chose a changé depuis l'ouverture : active la garde « quitter sans enregistrer ». */
  isDirty: boolean;
  // customer
  customerId: string;
  setCustomerId: (id: string) => void;
  selectedCustomer: ReturnType<typeof useCustomer>['data'];
  // notes
  notes: string;
  setNotes: (v: string) => void;
  showNotes: boolean;
  setShowNotes: (v: boolean) => void;
  // summary adjustments
  discount: string;
  setDiscount: (v: string) => void;
  shipping: string;
  setShipping: (v: string) => void;
  showDiscount: boolean;
  setShowDiscount: (v: boolean) => void;
  showShipping: boolean;
  setShowShipping: (v: boolean) => void;
  // payment
  paymentStatus: PaymentChoice;
  setPaymentStatus: (v: PaymentChoice) => void;
  amountPaid: string;
  setAmountPaid: (v: string) => void;
  paymentError: string;
  setPaymentError: (v: string) => void;
  // order status
  orderStatus: StatusChoice;
  setOrderStatus: (v: StatusChoice) => void;
  // dialogs
  createCustomerOpen: boolean;
  setCreateCustomerOpen: (v: boolean) => void;
  createProductOpen: boolean;
  setCreateProductOpen: (v: boolean) => void;
  // computed
  total: number;
  isPending: boolean;
  handleSubmit: () => Promise<void>;
}

interface SubmitInput {
  draft: OrderEditDraft;
  notes: string;
  orderStatus: StatusChoice;
  paymentStatus: PaymentChoice;
  amountPaid: string;
  total: number;
  setPaymentError: (v: string) => void;
}

/** Enregistrement : création (avec paiement et statut) ou différences sur la commande modifiée. */
function useSaleSubmit(order: Order | null) {
  const router = useRouter();
  const t = useTranslations('orders.new');
  const create = useCreateOrder();
  const edit = useOrderEditSave(order?.id ?? '');

  async function handleSubmit(input: SubmitInput) {
    const { draft, paymentStatus, amountPaid, total } = input;
    input.setPaymentError('');
    if (draft.items.length === 0) return;
    if (order) {
      await edit.save(order, draft);
      router.push(`/orders/${order.id}`);
      return;
    }
    const payErr = validatePayment(paymentStatus, amountPaid, total, t);
    if (payErr) { input.setPaymentError(payErr); return; }
    const created = await create.mutateAsync({
      customer: draft.customerId || null,
      notes: input.notes,
      discount_amount: draft.discount || '0',
      shipping_amount: draft.shipping || '0',
      items: draft.items.map(toItemPayload),
      status: input.orderStatus,
      payment_status: paymentStatus,
      amount_paid: paymentStatus === 'partial' ? amountPaid : '0',
    });
    router.push(`/orders/${created.id}`);
  }

  return { handleSubmit, isPending: create.isPending || edit.isPending };
}

export function useNewSaleForm(options: SaleFormOptions = { mode: 'create' }): NewSaleForm {
  const searchParams = useSearchParams();
  const { data: shop } = useShop();
  const order = options.mode === 'edit' ? options.order : null;
  // Figé à l'ouverture : les rechargements de la commande ne réécrivent pas la saisie.
  const [initial] = useState(() => (order ? draftFromOrder(order) : null));
  const customerParam = searchParams.get('customer');
  const defaultPayment: PaymentChoice = order ? (order.payment_status as PaymentChoice) : customerParam ? 'unpaid' : 'paid';

  const [customerId, setCustomerId] = useState(initial?.customerId ?? customerParam ?? '');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState(initial?.discount ?? '');
  const [shipping, setShipping] = useState(initial?.shipping ?? '');
  const [paymentStatus, setPaymentStatus] = useState<PaymentChoice>(defaultPayment);
  const [amountPaid, setAmountPaid] = useState('');
  const [orderStatusChoice, setOrderStatus] = useState<StatusChoice | null>(null);
  const orderStatus: StatusChoice = orderStatusChoice ?? (shop?.fulfillment_mode === 'on_site' ? 'shipped' : 'to_prepare');
  const [paymentError, setPaymentError] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showShipping, setShowShipping] = useState(false);
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
  const [createProductOpen, setCreateProductOpen] = useState(false);

  const { data: selectedCustomer } = useCustomer(customerId);
  const lines = useNewSaleLines(initial?.items);
  const submit = useSaleSubmit(order);

  const total = lines.subtotal - (parseFloat(discount) || 0) + (parseFloat(shipping) || 0);
  const draft: OrderEditDraft = { customerId, discount, shipping, items: lines.items };
  const isDirty = order ? hasOrderChanges(order, draft) : lines.items.length > 0 || !!customerId;

  return {
    ...lines,
    mode: options.mode, isDirty,
    customerId, setCustomerId, selectedCustomer,
    notes, setNotes, showNotes, setShowNotes,
    discount, setDiscount, shipping, setShipping,
    showDiscount, setShowDiscount, showShipping, setShowShipping,
    paymentStatus, setPaymentStatus, amountPaid, setAmountPaid, paymentError, setPaymentError,
    orderStatus, setOrderStatus,
    createCustomerOpen, setCreateCustomerOpen, createProductOpen, setCreateProductOpen,
    total,
    isPending: submit.isPending,
    handleSubmit: () => submit.handleSubmit({
      draft, notes, orderStatus, paymentStatus, amountPaid, total, setPaymentError,
    }),
  };
}
