import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as reloadly from './lib/reloadly';
import { sendEmail, orderDeliveryHtml } from './lib/email';

/**
 * Auto-fulfilment via le fournisseur API (Reloadly). Déclenché à la CRÉATION d'une commande
 * (donc déjà payée — placeOrder est le seul créateur, cf. orders create:if false).
 * Si le produit est mappé à un produit Reloadly ET `autoFulfill` → commande le code + livre par
 * e-mail automatiquement. SINON (non mappé, non configuré, ou ÉCHEC) → on ne touche pas à la
 * commande : elle reste « à livrer » dans le back-office = FALLBACK MANUEL (bouton existant).
 */
export const autoFulfillOrder = onDocumentCreated('orders/{orderId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const order = snap.data() as Record<string, any>;
  const orderId = event.params.orderId;
  const db = getFirestore();

  if (order.deliveryCode || order.fulfilledAt) return; // déjà livré (retry) → skip
  if (!reloadly.isConfigured()) return;                 // pas de fournisseur → manuel

  const prod = (await db.doc(`products/${order.productId}`).get()).data() as Record<string, any> | undefined;
  if (!prod?.autoFulfill || !prod?.reloadlyProductId) return; // non mappé → manuel

  // e-mail du client
  let email = String(order.email ?? '');
  const uid = String(order.uid ?? order.userId ?? '');
  if (!email && uid) email = String((await db.doc(`users/${uid}`).get()).data()?.email ?? '');

  try {
    const tx = await reloadly.placeOrder({
      productId: Number(prod.reloadlyProductId),
      countryCode: String(prod.reloadlyCountryCode ?? ''),
      quantity: 1,
      unitPrice: Number(prod.reloadlyUnitPrice),
      customIdentifier: orderId, // idempotence côté Reloadly (pas de double débit sur retry)
      senderName: 'Thie Thie Services',
      recipientEmail: email || undefined,
    });
    const cards = await reloadly.getOrderCards(tx.transactionId);
    const first = Array.isArray(cards) ? cards[0] : cards;
    // Une carte cadeau se rachète souvent avec DEUX éléments : un numéro de carte ET un PIN.
    // Les écraser dans un seul champ perdait l'un des deux et rendait la carte inutilisable
    // — on conserve donc chacun séparément. `deliveryCode` reste renseigné pour les commandes
    // et les écrans antérieurs à ce changement.
    const pin = first?.pinCode ? String(first.pinCode) : null;
    const cardNumber = first?.cardNumber ? String(first.cardNumber) : null;
    const code = String(first?.pinCode || first?.cardNumber || '');
    const instructions = first?.cardNumber && first?.pinCode ? `Référence : ${first.cardNumber}` : undefined;
    const html = orderDeliveryHtml({ productName: order.productName || 'votre commande', optionLabel: order.optionLabel, code, instructions });
    const mail = email ? await sendEmail(email, 'Votre commande Thie Thie Services est livrée', html) : { sent: false, error: 'e-mail client absent' };

    await snap.ref.update({
      deliveryCode: code,
      deliveryPin: pin,
      deliveryCardNumber: cardNumber,
      deliveryInstructions: instructions ?? null,
      fulfilledAt: FieldValue.serverTimestamp(),
      autoFulfilled: true,
      reloadlyTxId: tx.transactionId,
      emailSent: mail.sent,
      emailError: mail.sent ? null : (mail.error ?? null),
    });
  } catch (e) {
    // FALLBACK MANUEL : on signale l'échec, la commande reste non livrée pour l'admin.
    await snap.ref.update({ autoFulfillError: (e as Error).message, autoFulfillFailedAt: FieldValue.serverTimestamp() });
  }
});
