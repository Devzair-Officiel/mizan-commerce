import type { ErrorEvent, init } from '@sentry/nextjs';

// TransactionEvent n'est pas réexporté par @sentry/nextjs : dérivé des options de init().
type TransactionEvent = Parameters<
  NonNullable<NonNullable<Parameters<typeof init>[0]>['beforeSendTransaction']>
>[0];

// Suivi des erreurs (Sentry), désactivé tant que NEXT_PUBLIC_SENTRY_DSN n'est pas défini.
// Partagé par instrumentation-client.ts (navigateur) et instrumentation.ts (serveur) :
// pas de PII, pas de session replay, et chaque événement est nettoyé avant l'envoi
// (en-têtes d'authentification, corps, jetons dans les URL, clés sensibles, e-mails
// et téléphones), comme apps/backend/apps/core/sentry.py.

export const FILTERED = '[Filtered]';

const DROPPED_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-csrftoken',
]);

// Clé (objet, en-tête, paramètre d'URL) qui évoque un secret ou une coordonnée de client.
const SENSITIVE_KEY =
  /pass|pwd|secret|token|key|auth|cookie|session|csrf|credential|signature|dsn|uid|e-?mail|phone|t[eé]l[eé]phone|mobile|whatsapp|ip_address/i;

// Paramètre d'URL sensible, où qu'il apparaisse (URL de la requête, fil d'Ariane, message).
const SENSITIVE_PARAM = /([?&#]([^=&#\s]+)=)([^&#\s]*)/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// Format international (E.164, espaces tolérés) et national à 10 chiffres.
const PHONE = /\+\d(?:[ .-]?\d){7,14}|\b0\d(?:[ .-]?\d{2}){4}\b/g;

function mask(text: string): string {
  return text
    .replace(SENSITIVE_PARAM, (match, prefix: string, name: string) =>
      SENSITIVE_KEY.test(name) ? `${prefix}${FILTERED}` : match,
    )
    .replace(EMAIL, '[email]')
    .replace(PHONE, '[phone]');
}

function scrub(value: unknown): unknown {
  if (typeof value === 'string') return mask(value);
  if (Array.isArray(value)) return value.map(scrub);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        // Métadonnées internes du SDK (portées), jamais envoyées : laissées intactes.
        key === 'sdkProcessingMetadata' ? item : SENSITIVE_KEY.test(key) ? FILTERED : scrub(item),
      ]),
    );
  }
  return value;
}

/** `beforeSend` : retire ou masque tout ce qui ne doit pas quitter l'application. */
export function scrubEvent<T extends ErrorEvent | TransactionEvent>(event: T): T {
  const request = event.request;
  if (request) {
    delete request.data;
    delete request.cookies;
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(([name]) => !DROPPED_HEADERS.has(name.toLowerCase())),
      );
    }
  }
  return scrub(event) as T;
}

// L'image publiée par le CI sert à staging et à la production : sans valeur fixée à la
// construction, le serveur lit SENTRY_ENVIRONMENT et le navigateur se fie à son domaine.
function environment(): string {
  const built = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim();
  if (built) return built;
  if (typeof window === 'undefined') return process.env.SENTRY_ENVIRONMENT?.trim() || 'local';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'local';
  return host.startsWith('staging.') ? 'staging' : 'production';
}

/** Options communes, ou `null` sans DSN : Sentry n'est alors pas initialisé. */
export function sentryOptions() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) return null;
  return {
    dsn,
    environment: environment(),
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE?.trim() || undefined,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE) || 0,
    sendDefaultPii: false,
    beforeSend: scrubEvent<ErrorEvent>,
    beforeSendTransaction: scrubEvent<TransactionEvent>,
  };
}
