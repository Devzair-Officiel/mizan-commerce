import { createHash } from 'node:crypto';

/**
 * Rafraîchissements de session en mémoire (un processus Next.js) : « vol unique » et fenêtre de grâce.
 *
 * - Vol unique : les requêtes parties en même temps avec le même jeton attendent la même demande au
 *   backend (la deuxième demande, refusée par la liste noire, déconnecterait l'utilisateur).
 * - Fenêtre de grâce : GRACE_MS après un rafraîchissement réussi, une requête qui porte encore
 *   l'ANCIEN jeton (partie avant que le navigateur ne reçoive les nouveaux cookies, ou réponse perdue)
 *   reçoit la paire déjà obtenue au lieu de relancer un rafraîchissement.
 *
 * Seul le détenteur du jeton exact en profite : la clé est son empreinte SHA-256 (jamais le jeton en
 * clair). Un échec n'est pas gardé, un jeton inconnu ou falsifié n'a donc rien à réutiliser.
 * Sans import de Next.js : testé par `node --test` (lib/session-security.test.mjs).
 */

export const GRACE_MS = 30_000;
/** Plafond de la table : au-delà, l'entrée la plus ancienne est oubliée. */
export const MAX_FLIGHTS = 1_000;

export interface SessionTokens {
  access: string;
  refresh: string;
}

/** Cause d'un échec, pour le journal (jamais de valeur de jeton). */
export type RefreshCause =
  | 'no_refresh_cookie' // aucun cookie de rafraîchissement
  | 'rejected' // jeton refusé par le backend : expiré, révoqué, invalide
  | 'retry_rejected' // nouveau jeton d'accès refusé lui aussi
  | 'backend_error' // réponse inattendue du backend
  | 'unreachable'; // backend injoignable ou trop lent

/** expired : session terminée ; unavailable : panne passagère, réessayer plus tard. */
export interface RefreshFailure {
  status: 'expired' | 'unavailable';
  cause: RefreshCause;
  backendStatus?: number;
  backendCode?: string;
}

export type RefreshResult = ({ status: 'ok' } & SessionTokens) | RefreshFailure;

interface Flight {
  promise: Promise<RefreshResult>;
  settledAt?: number;
  /** Empreinte du jeton issu de ce vol (pour `forget`). */
  rotatedKey?: string;
}

export function tokenKey(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

export class RefreshFlights {
  readonly #flights = new Map<string, Flight>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  get size(): number {
    return this.#flights.size;
  }

  /**
   * Résultat du rafraîchissement de `token` : vol en cours, paire encore dans sa fenêtre de grâce
   * (`graced`), ou nouvelle demande `request()`.
   */
  run(token: string, request: () => Promise<RefreshResult>): { promise: Promise<RefreshResult>; graced: boolean } {
    this.#prune();
    const key = tokenKey(token);
    const existing = this.#flights.get(key);
    if (existing) return { promise: existing.promise, graced: existing.settledAt !== undefined };

    if (this.#flights.size >= MAX_FLIGHTS) {
      const oldest = this.#flights.keys().next().value;
      if (oldest !== undefined) this.#flights.delete(oldest);
    }
    const flight: Flight = { promise: request() };
    this.#flights.set(key, flight);
    void flight.promise.then((result) => {
      if (this.#flights.get(key) !== flight) return; // oublié entre-temps (déconnexion, mot de passe)
      if (result.status !== 'ok') {
        this.#flights.delete(key); // rien à réutiliser : la requête suivante redemande au backend
        return;
      }
      flight.settledAt = this.#now();
      flight.rotatedKey = tokenKey(result.refresh);
    });
    return { promise: flight.promise, graced: false };
  }

  /** Oublie les vols liés à ce jeton (comme clé ou comme résultat) : après une révocation, rien n'est réutilisé. */
  forget(token: string): void {
    const key = tokenKey(token);
    for (const [k, flight] of this.#flights) {
      if (k === key || flight.rotatedKey === key) this.#flights.delete(k);
    }
  }

  #prune(): void {
    const now = this.#now();
    for (const [key, flight] of this.#flights) {
      if (flight.settledAt !== undefined && now - flight.settledAt >= GRACE_MS) this.#flights.delete(key);
    }
  }
}
