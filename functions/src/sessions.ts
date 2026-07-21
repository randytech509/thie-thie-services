import { onCall } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { callOpts, requireAuth } from './lib/guards';

/**
 * Journal des sessions d'appareil.
 *
 * POURQUOI CÔTÉ SERVEUR : l'IP et le user-agent doivent être constatés par le serveur, pas
 * déclarés par le client. Un client peut prétendre n'importe quelle IP ; seul le serveur voit
 * l'adresse réelle du frontal. Le client ne fournit qu'un identifiant d'appareil stable
 * (`deviceId`, tiré une fois et gardé en localStorage) — il sert uniquement de clé de document,
 * pas de preuve.
 *
 * Ce journal existe d'abord pour l'ADMIN : voir depuis combien d'appareils, quelles IP et quels
 * navigateurs son compte est ouvert, et repérer une session qu'il ne reconnaît pas.
 */

/**
 * IP de l'appelant. La DERNIÈRE entrée de `X-Forwarded-For` est celle qu'ajoute le frontal
 * Google devant Cloud Run ; les entrées de gauche sont fournies par le client, donc
 * falsifiables. Même raisonnement que le rate-limiter des webhooks.
 */
function clientIp(raw: { headers?: Record<string, unknown>; ip?: string }): string {
  const xff = raw.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    const hops = xff.split(',').map((h) => h.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return raw.ip || 'inconnue';
}

/** Étiquette d'appareil lisible tirée du user-agent — pas d'analyse fine, juste de quoi
 *  reconnaître « mon téléphone » vs « un poste Windows inconnu ». */
function deviceLabel(ua: string): string {
  const u = ua.toLowerCase();
  const os = u.includes('android') ? 'Android'
    : u.includes('iphone') || u.includes('ipad') || u.includes('ios') ? 'iOS'
    : u.includes('windows') ? 'Windows'
    : u.includes('mac os') || u.includes('macintosh') ? 'macOS'
    : u.includes('linux') ? 'Linux' : 'Appareil';
  const nav = u.includes('edg/') ? 'Edge'
    : u.includes('chrome/') && !u.includes('edg/') ? 'Chrome'
    : u.includes('firefox/') ? 'Firefox'
    : u.includes('safari/') && !u.includes('chrome/') ? 'Safari' : 'navigateur';
  return `${os} · ${nav}`;
}

/** Un ID de document ne peut ni contenir « / » ni être encadré de « __ ». */
function safeId(s: string): string {
  return (s || '').replace(/[^A-Za-z0-9_.-]/g, '_').replace(/^_+|_+$/g, '').slice(0, 120) || 'x';
}

/**
 * Enregistre / rafraîchit la session de l'appareil courant. Appelé à la connexion puis, de
 * temps en temps, quand l'app reprend le focus. Idempotent sur `{uid}_{deviceId}` : un même
 * appareil ne crée pas de doublon, il met à jour `lastSeenAt`, l'IP et l'étiquette.
 */
export const recordSession = onCall(callOpts, async (req) => {
  const actor = requireAuth(req);
  const deviceId = safeId(String(req.data?.deviceId ?? ''));
  const raw = (req as unknown as { rawRequest?: { headers?: Record<string, unknown>; ip?: string } }).rawRequest ?? {};
  const ua = String(raw.headers?.['user-agent'] ?? '');

  const db = getFirestore();
  const ref = db.doc(`user_sessions/${actor.uid}_${deviceId}`);
  const snap = await ref.get();

  await ref.set({
    uid: actor.uid,
    deviceId,
    ip: clientIp(raw),
    device: deviceLabel(ua),
    userAgent: ua.slice(0, 300),
    isAdmin: req.auth?.token?.admin === true,
    lastSeenAt: FieldValue.serverTimestamp(),
    ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    ended: false,
  }, { merge: true });

  return { ok: true };
});

/** Marque la session courante terminée (déconnexion volontaire). */
export const endSession = onCall(callOpts, async (req) => {
  const actor = requireAuth(req);
  const deviceId = safeId(String(req.data?.deviceId ?? ''));
  await getFirestore().doc(`user_sessions/${actor.uid}_${deviceId}`).set(
    { ended: true, endedAt: FieldValue.serverTimestamp() }, { merge: true },
  );
  return { ok: true };
});

/**
 * Déconnecte tous les AUTRES appareils.
 *
 * HONNÊTETÉ SUR LA LIMITE : Firebase Auth ne sait pas révoquer le jeton d'UN appareil précis —
 * `revokeRefreshTokens` invalide TOUS les jetons de rafraîchissement du compte. Concrètement :
 * chaque appareil (y compris celui-ci) devra se ré-authentifier au prochain renouvellement de
 * jeton (au plus une heure), et immédiatement si le client vérifie la révocation. Il n'existe
 * pas de vraie « déconnexion d'un seul appareil » côté serveur avec Firebase Auth ; retirer une
 * ligne de la liste sans révoquer serait cosmétique et donnerait un faux sentiment de sécurité.
 *
 * C'est donc l'action à présenter comme réelle : « déconnecter partout ». On garde la session
 * de CET appareil dans le journal (l'utilisateur vient de s'en servir) et on clôt les autres.
 */
export const revokeOtherSessions = onCall(callOpts, async (req) => {
  const actor = requireAuth(req);
  const currentDeviceId = safeId(String(req.data?.deviceId ?? ''));
  const auth = getAuth();
  await auth.revokeRefreshTokens(actor.uid);

  const db = getFirestore();
  const snap = await db.collection('user_sessions').where('uid', '==', actor.uid).get();
  const batch = db.batch();
  let closes = 0;
  for (const d of snap.docs) {
    if (d.id === `${actor.uid}_${currentDeviceId}`) continue; // garder l'appareil courant
    batch.set(d.ref, { ended: true, endedAt: FieldValue.serverTimestamp(), revoked: true }, { merge: true });
    closes++;
  }
  await batch.commit();
  return { ok: true, closes };
});
