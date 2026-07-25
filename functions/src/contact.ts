import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { callOpts } from './lib/guards';
import { handleContactSubmission, ContactError } from './lib/contact-core';

/**
 * Réception des messages du formulaire de contact (support).
 *
 * Fonctionne pour les visiteurs anonymes comme connectés : PAS de requireAuth. App Check reste
 * exigé (callOpts) pour freiner les bots. La logique métier (validation, rate-limit, stockage,
 * envoi) vit dans lib/contact-core (testable sur l'émulateur).
 */
export const submitContactMessage = onCall(callOpts, async (req) => {
  try {
    const res = await handleContactSubmission(
      getFirestore(),
      { ...req.data, uid: req.auth?.uid ?? null },
      { supportEmail: process.env.SUPPORT_EMAIL },
    );
    return { ok: res.ok, emailSent: res.emailSent };
  } catch (e) {
    if (e instanceof ContactError) throw new HttpsError(e.code, e.message);
    console.error('[submitContactMessage] erreur interne', e);
    throw new HttpsError('internal', "L'envoi a échoué.");
  }
});
