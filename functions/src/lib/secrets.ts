import { defineSecret } from 'firebase-functions/params';

/**
 * Secrets fournisseur (Google Secret Manager, invariant 5 / audit §5.4 : aucun secret dans le
 * bundle ni dans un .env committé). La VALEUR se pose hors code :
 *
 *   firebase functions:secrets:set RELOADLY_CLIENT_ID
 *   firebase functions:secrets:set RELOADLY_CLIENT_SECRET
 *
 * (la CLI demande la valeur en interactif — elle n'apparaît jamais dans le dépôt).
 * En émulateur local, les valeurs sont lues depuis `functions/.secret.local` (gitignoré).
 *
 * Toute fonction qui appelle Reloadly au runtime DOIT déclarer `secrets: RELOADLY_SECRETS`
 * dans ses options, sinon le secret n'est pas injecté dans process.env à l'exécution.
 */
export const RELOADLY_CLIENT_ID = defineSecret('RELOADLY_CLIENT_ID');
export const RELOADLY_CLIENT_SECRET = defineSecret('RELOADLY_CLIENT_SECRET');

/** À spread dans les options des fonctions qui appellent Reloadly. */
export const RELOADLY_SECRETS = [RELOADLY_CLIENT_ID, RELOADLY_CLIENT_SECRET];
