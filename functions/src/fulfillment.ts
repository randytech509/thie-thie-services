import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { requireAdmin, callOpts } from './lib/guards';
import { requireStepUp } from './lib/stepup';
import { audit } from './lib/audit';
import { sendEmail, orderDeliveryHtml } from './lib/email';

/**
 * Livraison MANUELLE d'une commande par l'admin : enregistre le code/PIN sur la commande,
 * la marque livrée, et envoie l'e-mail au client (code + instructions d'application) via Resend.
 * Dégradation gracieuse : si l'e-mail échoue (clé/domaine absent), la commande est quand même
 * marquée livrée et `emailSent:false` est renvoyé pour que l'admin le voie.
 */
export const fulfillOrder = onCall(callOpts, async (req) => {
  const admin = requireAdmin(req);
  const orderId = String(req.data?.orderId ?? '').trim();
  const code = String(req.data?.code ?? '').trim();
  const instructions = String(req.data?.instructions ?? '').trim();
  if (!orderId) throw new HttpsError('invalid-argument', 'orderId requis');
  if (!code) throw new HttpsError('invalid-argument', 'code requis');

  const db = getFirestore();
  await requireStepUp(db, admin.uid);
  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) throw new HttpsError('not-found', 'commande introuvable');
  const order = orderSnap.data() as Record<string, unknown>;
  const uid = String(order.uid ?? order.userId ?? '');

  // E-mail du client depuis users/{uid} (fallback : champ email sur la commande).
  let email = String(order.email ?? '');
  if (!email && uid) {
    const u = await db.doc(`users/${uid}`).get();
    email = String((u.data()?.email as string) ?? '');
  }

  const html = orderDeliveryHtml({
    productName: String(order.productName ?? 'votre commande'),
    optionLabel: (order.optionLabel as string) ?? null,
    code,
    instructions,
  });
  const mail = await sendEmail(email, 'Votre commande Thie Thie Services est livrée', html);

  await orderRef.update({
    deliveryCode: code,
    deliveryInstructions: instructions || null,
    fulfilledAt: FieldValue.serverTimestamp(),
    fulfilledBy: admin.uid,
    emailSent: mail.sent,
    emailError: mail.sent ? null : (mail.error ?? null),
  });

  await audit(db, {
    action: 'fulfillOrder',
    actorUid: admin.uid,
    meta: { orderId, emailSent: mail.sent, to: email || '(inconnu)' },
  });

  return { ok: true, emailSent: mail.sent, error: mail.sent ? null : mail.error };
});
