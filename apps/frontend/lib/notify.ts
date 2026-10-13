import { toast } from 'sonner';

/**
 * Notifications (design_principles §4) : confirmer une action terminée ou signaler une erreur,
 * jamais pour une information qui doit rester visible. Affichées par `AppToaster`.
 */
export const notify = {
  /** `action` : geste immédiat sur ce qui vient d'être fait (« Annuler »). */
  success: (message: string, action?: { label: string; onClick: () => void }) =>
    toast.success(message, action ? { action } : undefined),
  error: (message: string) => toast.error(message),
};
