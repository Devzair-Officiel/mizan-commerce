import type { ZakatCalculation } from '@/lib/hooks/useZakat';
import type { ZakatFormat } from '../useZakatFormat';
import type { ZakatAutosave } from '../wizard/useZakatAutosave';

/** Ce que reçoit chaque étape : la fiche (avec les saisies déjà appliquées), l'envoi et la mise en forme. */
export interface StepProps {
  calc: ZakatCalculation;
  save: ZakatAutosave['save'];
  format: ZakatFormat;
}
