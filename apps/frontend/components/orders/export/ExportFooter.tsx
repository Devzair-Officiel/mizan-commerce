'use client';

import { useTranslations } from 'next-intl';
import { Download, FileText, Loader2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WhatsAppIcon } from '@/components/orders/detail/constants';
import type { ExportStep, OrdersExportActions } from './useOrdersExportActions';

const ICONS: Record<ExportStep, React.ReactNode> = {
  download_csv: <Download size={17} aria-hidden />,
  download_pdf: <Download size={17} aria-hidden />,
  prepare_pdf: <FileText size={17} aria-hidden />,
  share_pdf: <Share2 size={17} aria-hidden />,
  prepare_message: <WhatsAppIcon size={16} />,
  open_whatsapp: <WhatsAppIcon size={16} />,
};

interface ExportFooterProps {
  formId: string;
  actions: OrdersExportActions;
  disabled: boolean;
  onClose: () => void;
}

/**
 * Un seul bouton plein, selon l'étape ; le secondaire en texte (« Annuler », ou « Copier le texte »
 * une fois le message prêt). Les étapes qui appellent le serveur valident le formulaire (submit) ;
 * partager et ouvrir WhatsApp restent dans le geste (clic direct).
 */
export function ExportFooter({ formId, actions, disabled, onClose }: ExportFooterProps) {
  const t = useTranslations('orders.export');
  const { step, pending } = actions;
  const direct = step === 'share_pdf' ? () => void actions.share() : step === 'open_whatsapp' ? actions.openWhatsApp : undefined;
  const ready = step === 'open_whatsapp';
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button type="button" variant="ghost" onClick={ready ? () => void actions.copy() : onClose} className="h-11 rounded-full px-4 lg:h-10">
        {t(ready ? 'copy' : 'cancel')}
      </Button>
      <Button type={direct ? 'button' : 'submit'} form={direct ? undefined : formId} onClick={direct}
        disabled={disabled || pending} aria-busy={pending || undefined}
        className="h-11 flex-1 gap-1.5 rounded-full px-4 font-semibold lg:h-10 lg:flex-none">
        {pending ? <Loader2 size={17} aria-hidden className="animate-spin motion-reduce:animate-none" /> : ICONS[step]}
        {t(pending ? 'preparing' : `step.${step}`)}
      </Button>
    </div>
  );
}
