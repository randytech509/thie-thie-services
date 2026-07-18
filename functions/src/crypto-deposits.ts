import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { generateInvoice, OxapayError } from './lib/oxapay';
import { usdCentsToHtgCents, assertCents } from './lib/money';
import { audit } from './lib/audit';
import { requireAuth, callOpts } from './lib/guards';

const MIN_USD = 5;
const MAX_USD = 1000;

/**
 * Génère une facture de paiement crypto (OxaPay) pour recharger le wallet — invariant KYC :
 * réservé aux comptes kycStatus == 'approved' (vérifié SERVEUR, jamais fait confiance au client).
 * Ne crédite RIEN ici : la facture est en attente ; le crédit se fait uniquement via
 * ingestOxapayCallback() (webhook signé) quand OxaPay confirme le paiement (invariant 3).
 */
export const createCryptoInvoice = onCall(callOpts, async (req) => {
  const actor = requireAuth(req);
  const amountUsd = Number(req.data?.amountUsd);
  if (!Number.isFinite(amountUsd) || amountUsd < MIN_USD || amountUsd > MAX_USD) {
    throw new HttpsError('invalid-argument', `montant USD invalide (${MIN_USD}-${MAX_USD})`);
  }

  const apiKey = process.env.OXAPAY_MERCHANT_API_KEY;
  const callbackUrl = process.env.OXAPAY_CALLBACK_URL;
  if (!apiKey || !callbackUrl) {
    throw new HttpsError('failed-precondition', 'passerelle crypto non configurée');
  }

  const db = getFirestore();
  const userRef = db.doc(`users/${actor.uid}`);
  const [userSnap, fxSnap] = await Promise.all([userRef.get(), db.doc('config/fx').get()]);
  if (!userSnap.exists) throw new HttpsError('not-found', 'utilisateur introuvable');

  // Gating KYC — SEULE source de vérité : users/{uid}.kycStatus, champ serveur-only
  // (firestore.rules noKycChange()). Le client ne peut jamais l'auto-approuver.
  if (userSnap.get('kycStatus') !== 'approved') {
    throw new HttpsError('permission-denied', 'vérification d\'identité (KYC) requise pour la recharge crypto');
  }

  const htgCentsPerUsd = fxSnap.exists ? (fxSnap.get('htgCentsPerUsd') as number) : null;
  if (htgCentsPerUsd == null) throw new HttpsError('failed-precondition', 'taux FX indisponible');
  const amountHtgCents = usdCentsToHtgCents(Math.round(amountUsd * 100), htgCentsPerUsd);
  assertCents(amountHtgCents, 'amountHtgCents');

  const requestId = `CRYPTO-${db.collection('wallet_requests').doc().id}`;

  let invoice;
  try {
    invoice = await generateInvoice(apiKey, {
      amount: amountUsd,
      currency: 'USD',
      orderId: requestId,
      callbackUrl,
      description: 'Recharge wallet Thie Thie Services',
    });
  } catch (e) {
    throw new HttpsError('unavailable', e instanceof OxapayError ? e.message : 'passerelle crypto indisponible');
  }

  await db.doc(`wallet_requests/${requestId}`).set({
    requestId,
    uid: actor.uid,
    amount: amountHtgCents / 100, // HTG, cohérence d'affichage avec les autres dépôts
    expectedAmountCentimes: amountHtgCents,
    paymentMethod: 'Crypto',
    transactionReference: invoice.trackId,
    screenshotURL: 'N/A',
    status: 'Pending Verification',
    amountUsd,
    oxapayTrackId: invoice.trackId,
    oxapayPaymentUrl: invoice.paymentUrl,
    expiresAt: invoice.expiredAt,
    createdAt: FieldValue.serverTimestamp(),
  });

  await audit(db, {
    action: 'createCryptoInvoice',
    actorUid: actor.uid,
    targetUid: actor.uid,
    amountCents: amountHtgCents,
    meta: { requestId, trackId: invoice.trackId, amountUsd },
  });

  return {
    requestId,
    paymentUrl: invoice.paymentUrl,
    trackId: invoice.trackId,
    expiresAt: invoice.expiredAt,
    amountUsd,
    amountHtgCents,
  };
});
