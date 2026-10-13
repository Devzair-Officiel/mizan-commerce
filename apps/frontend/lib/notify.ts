import { toast } from 'sonner';

/**
 * Notifications (design_principles §4) : confirmer une action terminée ou signaler une erreur,
 * jamais pour une information qui doit rester visible. Affichées par `AppToaster`.
 */
export const notify = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
};
