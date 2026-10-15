import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/sentry';

// Serveur (Node.js et edge) : Sentry seulement si NEXT_PUBLIC_SENTRY_DSN est défini (lib/sentry.ts).
export function register(): void {
  const options = sentryOptions();
  if (options) Sentry.init(options);
}

export const onRequestError = Sentry.captureRequestError;
