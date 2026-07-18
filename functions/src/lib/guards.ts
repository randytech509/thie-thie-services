import { CallableRequest, HttpsError, CallableOptions } from 'firebase-functions/v2/https';
import { DomainError } from './transactions';

/**
 * Options communes aux callables.
 * App Check enforced (invariant 5) — désactivable en dev via FUNCTIONS_ENFORCE_APPCHECK=false
 * (ex: tests d'intégration locaux). En prod, laisser enforced + jeton debug pour le dev.
 */
export const callOpts: CallableOptions = {
  enforceAppCheck: process.env.FUNCTIONS_ENFORCE_APPCHECK !== 'false',
};

export interface Actor {
  uid: string;
}

/** Exige un utilisateur authentifié ; renvoie son uid. */
export function requireAuth(req: CallableRequest): Actor {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'authentification requise');
  return { uid: req.auth.uid };
}

/** Exige le custom claim `admin` (invariant 6) — aucune autre source d'autorité admin. */
export function requireAdmin(req: CallableRequest): Actor {
  const a = requireAuth(req);
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'réservé aux administrateurs');
  return a;
}

/** Traduit une DomainError métier en HttpsError pour le client. */
export function mapDomainError(e: unknown): HttpsError {
  if (e instanceof HttpsError) return e;
  if (e instanceof DomainError) {
    const map: Record<string, 'failed-precondition' | 'invalid-argument' | 'not-found' | 'resource-exhausted'> = {
      'insufficient-funds': 'failed-precondition',
      'out-of-stock': 'resource-exhausted',
      'unavailable': 'failed-precondition',
      'fx-missing': 'failed-precondition',
      'invalid-amount': 'invalid-argument',
      'invalid-arg': 'invalid-argument',
      'invalid-qty': 'invalid-argument',
      'user-not-found': 'not-found',
      'product-not-found': 'not-found',
      'reward-not-found': 'not-found',
      'insufficient-points': 'failed-precondition',
    };
    return new HttpsError(map[e.code] ?? 'internal', e.message);
  }
  return new HttpsError('internal', 'erreur interne');
}
