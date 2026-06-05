'use client';

import { useTranslations } from 'next-intl';
import { Bell, FileText, Mail, MapPin, PowerOff, UserPen } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { Customer } from '@/lib/hooks/useCustomers';
import { ActionRow } from './ActionRow';

interface CustomerActionsSheetProps {
  open: boolean;
  onClose: () => void;
  customer: Customer;
  relanceCreated: boolean;
  createReminderPending: boolean;
  deactivatePending: boolean;
  reactivatePending: boolean;
  onShowNotes: () => void;
  onShowAddress: () => void;
  onSchedule: () => void | Promise<void>;
  onEdit: () => void;
  onDeactivate: () => void | Promise<void>;
  onReactivate: () => void | Promise<void>;
}

export function CustomerActionsSheet({
  open, onClose, customer, relanceCreated,
  createReminderPending, deactivatePending, reactivatePending,
  onShowNotes, onShowAddress, onSchedule, onEdit, onDeactivate, onReactivate,
}: CustomerActionsSheetProps) {
  const t = useTranslations('customers.actionsSheet');
  return (
    <BottomSheet open={open} onClose={onClose} title={t('title')}>
      <div className="flex flex-col gap-1.5">
        {customer.email && (
          <ActionRow
            icon={<Mail size={18} />}
            label={t('email_label')}
            description={customer.email}
            onClick={() => { onClose(); window.location.href = `mailto:${customer.email}`; }}
          />
        )}
        {customer.city && (
          <ActionRow
            icon={<MapPin size={18} />}
            label={t('address_label')}
            description={[customer.address_line, customer.city].filter(Boolean).join(', ')}
            onClick={() => { onClose(); onShowAddress(); }}
          />
        )}
        {customer.notes && (
          <ActionRow
            icon={<FileText size={18} />}
            label={t('notes_label')}
            onClick={() => { onClose(); onShowNotes(); }}
          />
        )}
        <ActionRow
          icon={<Bell size={18} />}
          label={relanceCreated ? t('reminder_created_today') : t('reminder_schedule')}
          description={relanceCreated ? undefined : t('reminder_tomorrow_9')}
          onClick={async () => { await onSchedule(); onClose(); }}
          disabled={createReminderPending || relanceCreated}
          tone={relanceCreated ? 'success' : 'default'}
        />
        <ActionRow
          icon={<UserPen size={18} />}
          label={t('edit_record')}
          onClick={() => { onClose(); onEdit(); }}
        />
      </div>

      <div className="mt-3 pt-3 border-t border-border">
        {customer.is_active ? (
          <ActionRow
            icon={<PowerOff size={18} />}
            label={t('deactivate_label')}
            description={t('deactivate_desc')}
            onClick={async () => { onClose(); await onDeactivate(); }}
            disabled={deactivatePending}
            tone="danger"
          />
        ) : (
          <ActionRow
            icon={<PowerOff size={18} />}
            label={t('reactivate_label')}
            onClick={async () => { onClose(); await onReactivate(); }}
            disabled={reactivatePending}
            tone="success"
          />
        )}
      </div>
    </BottomSheet>
  );
}
