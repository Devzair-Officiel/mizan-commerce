import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCreateOrder, type OrderItemPayload } from '@/lib/hooks/useOrders';
import { useCustomer } from '@/lib/hooks/useCustomers';
import { useNewSaleLines, type NewSaleLines } from '@/lib/hooks/useNewSaleLines';

function validatePayment(
  paymentStatus: 'unpaid' | 'partial' | 'paid',
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
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  setPaymentStatus: (v: 'unpaid' | 'partial' | 'paid') => void;
  amountPaid: string;
  setAmountPaid: (v: string) => void;
  paymentError: string;
  setPaymentError: (v: string) => void;
  // order status
  orderStatus: 'draft' | 'to_prepare' | 'shipped';
  setOrderStatus: (v: 'draft' | 'to_prepare' | 'shipped') => void;
  // dialogs
  createCustomerOpen: boolean;
  setCreateCustomerOpen: (v: boolean) => void;
  createProductOpen: boolean;
  setCreateProductOpen: (v: boolean) => void;
  // computed
  total: number;
  toPrepareLabel: string;
  isPending: boolean;
  handleSubmit: () => Promise<void>;
}

export function useNewSaleForm(): NewSaleForm {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('orders.new');
  const { mutateAsync, isPending } = useCreateOrder();

  const defaultPayment: 'unpaid' | 'paid' = searchParams.get('customer') ? 'unpaid' : 'paid';

  const [customerId, setCustomerId] = useState(searchParams.get('customer') ?? '');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('');
  const [shipping, setShipping] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'unpaid' | 'partial' | 'paid'>(defaultPayment);
  const [amountPaid, setAmountPaid] = useState('');
  const [orderStatus, setOrderStatus] = useState<'draft' | 'to_prepare' | 'shipped'>('to_prepare');
  const [paymentError, setPaymentError] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showShipping, setShowShipping] = useState(false);
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
  const [createProductOpen, setCreateProductOpen] = useState(false);

  const { data: selectedCustomer } = useCustomer(customerId);
  const lines = useNewSaleLines();

  const discountN = parseFloat(discount) || 0;
  const shippingN = parseFloat(shipping) || 0;
  const total = lines.subtotal - discountN + shippingN;

  const toPrepareLabel = lines.hasProducts && lines.hasNonProducts ? t('status_to_process')
    : lines.hasNonProducts && !lines.hasProducts ? t('status_confirmed')
    : t('status_to_prepare');

  async function handleSubmit() {
    setPaymentError('');
    if (lines.items.length === 0) return;
    const payErr = validatePayment(paymentStatus, amountPaid, total, t);
    if (payErr) { setPaymentError(payErr); return; }
    const payloadItems: OrderItemPayload[] = lines.items.map((i) =>
      i.variant
        ? { variant: i.variant, quantity: i.quantity, unit_price: i.unit_price }
        : { product_name: i.product_name, unit_price: i.unit_price, quantity: i.quantity },
    );
    const order = await mutateAsync({
      customer: customerId || null,
      notes,
      discount_amount: discount || '0',
      shipping_amount: shipping || '0',
      items: payloadItems,
      status: orderStatus,
      payment_status: paymentStatus,
      amount_paid: paymentStatus === 'partial' ? amountPaid : '0',
    });
    router.push(`/orders/${order.id}`);
  }

  return {
    ...lines,
    customerId, setCustomerId,
    selectedCustomer,
    notes, setNotes,
    showNotes, setShowNotes,
    discount, setDiscount,
    shipping, setShipping,
    showDiscount, setShowDiscount,
    showShipping, setShowShipping,
    paymentStatus, setPaymentStatus,
    amountPaid, setAmountPaid,
    paymentError, setPaymentError,
    orderStatus, setOrderStatus,
    createCustomerOpen, setCreateCustomerOpen,
    createProductOpen, setCreateProductOpen,
    total,
    toPrepareLabel,
    isPending,
    handleSubmit,
  };
}
