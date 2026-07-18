import { HttpsError } from 'firebase-functions/v2/https';
import { Firestore } from 'firebase-admin/firestore';

/**
 * Exige une vérification passkey (WebAuthn) récente pour les actions admin sensibles.
 * BOOTSTRAP SÛR : si l'admin n'a AUCUN passkey enregistré, l'exigence est désactivée
 * (sinon un admin sans passkey serait verrouillé dehors, et ne pourrait jamais en enregistrer un).
 * Dès qu'un passkey existe, le step-up devient obligatoire (`admin_stepup/{uid}.until` valide).
 */
export async function requireStepUp(db: Firestore, uid: string): Promise<void> {
  const creds = await db.collection('users').doc(uid).collection('passkeys').limit(1).get();
  if (creds.empty) return; // pas encore enrôlé → pas d'enforcement
  const su = await db.doc(`admin_stepup/${uid}`).get();
  const until = su.exists ? (su.get('until') as number) : 0;
  if (!until || until < Date.now()) {
    throw new HttpsError('permission-denied', 'step-up-required');
  }
}
