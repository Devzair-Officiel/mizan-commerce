'use client';

import { orderDue } from '@/components/customers/detail/followupMessage';
import { PreparedMessageDialog } from '@/components/messages/PreparedMessageDialog';
import { WhatsAppIcon } from '@/components/orders/detail/constants';
import type { Reminder } from '@/lib/hooks/useReminders';

/**
 * « Relancer » : message WhatsApp préparé, jamais envoyé sans le geste du commerçant.
 * Rappel lié à une commande due : relance de cette commande. Sinon, le serveur relance toutes
 * les commandes non soldées du client ; aucune : simple salutation.
 */
export function ReminderFollowUpDialog({ reminder, onClose }: { reminder: Reminder; onClose: () => void }) {
  const customer = reminder.customer_info;
  const order = reminder.order_info && orderDue(reminder.order_info) > 0 ? reminder.order_info : null;
  if (!customer?.phone) return null;

  return (
    <PreparedMessageDialog
      onClose={onClose}
      compose={order ? { template: 'unpaid_followup', orderId: order.id } : { customerId: customer.id }}
      contextType={order ? 'order' : 'customer'}
      contextId={order ? order.id : customer.id}
      customerId={customer.id}
      recipientPhone={customer.phone}
      WhatsAppIcon={WhatsAppIcon}
    />
  );
}
