import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/sentry';

// Navigateur : Sentry seulement si NEXT_PUBLIC_SENTRY_DSN est défini (lib/sentry.ts).
// Envoi par le tunnel /relais (next.config.ts) : les bloqueurs de publicité ne l'arrêtent pas.
const options = sentryOptions();
if (options) Sentry.init(options);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
