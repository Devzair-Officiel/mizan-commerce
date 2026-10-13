'use client';

import { useTranslations } from 'next-intl';
import { buildFollowupMessage, orderDue } from '@/components/customers/detail/followupMessage';
import { PreparedMessageDialog } from '@/components/messages/PreparedMessageDialog';
import { WhatsAppIcon } from '@/components/orders/detail/constants';
import { useFormatDate, useFormatMoney } from '@/lib/hooks/useFormat';
import { useOrders } from '@/lib/hooks/useOrders';
import type { Reminder } from '@/lib/hooks/useReminders';
import { useShop } from '@/lib/hooks/useShop';

/**
 * « Relancer » : message WhatsApp préparé, jamais envoyé sans le geste du commerçant.
 * Rappel lié à une commande : relance de cette commande. Sinon, toutes les commandes
 * non soldées du client (chargées à l'ouverture) ; aucune : simple salutation.
 */
export function ReminderFollowUpDialog({ reminder, onClose }: { reminder: Reminder; onClose: () => void }) {
  const tWa = useTranslations('customers.whatsapp');
  const tGreeting = useTranslations('messages.prepared');
  const { data: shop } = useShop();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const customer = reminder.customer_info;
  const order = reminder.order_info && orderDue(reminder.order_info) > 0 ? reminder.order_info : null;
  const { data: dueOrders } = useOrders({ customer: customer?.id, due: true }, { enabled: !!customer && !order });
  if (!customer?.phone) return null;
  const orders = order ? [order] : dueOrders?.results;
  // Le message est lu à l'ouverture : attendre les commandes avant d'afficher la fenêtre.
  if (!orders) return null;

  const firstName = customer.display_name.trim().split(/\s+/)[0] ?? '';
  const total = orders.reduce((sum, o) => sum + orderDue(o), 0);
  const message = orders.length > 0
    ? buildFollowupMessage(customer.display_name, orders, total.toFixed(2),
      { tWa, formatMoney, formatDate, currency: shop?.currency ?? 'EUR' })
    : firstName ? tGreeting('greeting_named', { name: firstName }) : tGreeting('greeting');

  return (
    <PreparedMessageDialog
      open
      onClose={onClose}
      templateType={orders.length > 0 ? 'unpaid_followup' : 'free'}
      contextType={order ? 'order' : 'customer'}
      contextId={order ? order.id : customer.id}
      customerId={customer.id}
      recipientPhone={customer.phone}
      initialMessage={message}
      WhatsAppIcon={WhatsAppIcon}
    />
  );
}
