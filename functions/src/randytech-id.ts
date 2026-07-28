import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
import { requireAuth, callOpts } from './lib/guards';

/**
 * Intégration RandyTech ID (portail KYC centralisé, id.randytech-agency.com).
 * - `startIdVerification` : construit l'URL de redirection SIGNÉE (HMAC) vers le portail hébergé.
 * - `refreshKycStatus`    : interroge le portail (polling) et met à jour `users/{uid}.kycStatus`.
 *
 * Secrets partagés (env functions) : RTID_URL, RTID_SECRET (signe la redirection), RTID_APIKEY
 * (lit le statut). Doivent correspondre au client `thiethie` déclaré côté portail.
 */
const CLIENT = 'thiethie';
const RETURN_URL = 'https://thie-thie-services.web.app';

/** Génère l'URL signée pour rediriger l'utilisateur vers le portail RandyTech ID. */
export const startIdVerification = onCall(callOpts, async (req) => {
  const uid = requireAuth(req).uid;
  const base = (process.env.RTID_URL || '').replace(/\/$/, '');
  const secret = process.env.RTID_SECRET || '';
  if (!base || !secret) throw new HttpsError('failed-precondition', 'RandyTech ID non configuré (RTID_URL / RTID_SECRET).');

  const ts = Math.floor(Date.now() / 1000);
  const msg = `${CLIENT}.${uid}.${RETURN_URL}.${ts}`;
  const sig = crypto.createHmac('sha256', secret).update(msg).digest('hex');
  const url = `${base}/verify?client=${CLIENT}&subject=${encodeURIComponent(uid)}&return=${encodeURIComponent(RETURN_URL)}&ts=${ts}&sig=${sig}`;
  return { url };
});

/**
 * Poll du verdict côté portail → met à jour kycStatus (autorité serveur, contourne les règles
 * comme reviewKyc). N'écrase jamais un statut par un statut « inférieur » incohérent.
 */
export const refreshKycStatus = onCall(callOpts, async (req) => {
  const uid = requireAuth(req).uid;
  const base = (process.env.RTID_URL || '').replace(/\/$/, '');
  const apiKey = process.env.RTID_APIKEY || '';
  if (!base || !apiKey) throw new HttpsError('failed-precondition', 'RandyTech ID non configuré (RTID_URL / RTID_APIKEY).');

  let status = 'none';
  try {
    const resp = await fetch(`${base}/api/status?client=${CLIENT}&subject=${encodeURIComponent(uid)}`, {
      headers: { 'X-Api-Key': apiKey },
    });
    const j = (await resp.json()) as { status?: string };
    status = j.status || 'none';
  } catch {
    throw new HttpsError('unavailable', 'Portail de vérification injoignable.');
  }

  // none = pas encore de dossier → on ne touche pas au statut existant.
  if (status === 'approved' || status === 'rejected' || status === 'pending') {
    await getFirestore().doc(`users/${uid}`).set({ kycStatus: status }, { merge: true });
  }
  return { status };
});
