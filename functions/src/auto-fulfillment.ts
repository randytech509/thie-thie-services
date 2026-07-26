import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as reloadly from './lib/reloadly';
import * as giftaccess from './lib/giftaccess';
import { interpretOrderResponse, finalizeDelivery } from './lib/giftaccess-fulfill';
import { sendEmail, orderDeliveryHtml } from './lib/email';

/**
 * Auto-fulfilment via un fournisseur API. Déclenché à la CRÉATION d'une commande (donc déjà
 * payée — placeOrder est le seul créateur, cf. orders create:if false).
 *
 * Dispatch par fournisseur du produit (`prod.supplier`, avec repli historique : reloadlyProductId
 * présent = reloadly) :
 *   - 'giftaccess' → remplace la livraison manuelle (Free Fire top-up direct, PUBG, CoD…).
 *                    Peut être ASYNCHRONE : create → pending → le poller planifié finalise.
 *   - 'reloadly'   → cartes cadeaux (code renvoyé immédiatement).
 *   - sinon        → on ne touche pas la commande = FALLBACK MANUEL (bouton du back-office).
 * En cas d'ÉCHEC d'un fournisseur, on ne casse rien : la commande reste « à livrer » (manuel).
 */
export const autoFulfillOrder = onDocumentCreated('orders/{orderId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const order = snap.data() as Record<string, any>;
  const orderId = event.params.orderId;
  const db = getFirestore();

  if (order.deliveryCode || order.fulfilledAt) return; // déjà livré (retry) → skip
  if (order.giftAccessOrderId) return;                 // commande GIFT ACCESS déjà créée → le poller la finalise

  const prod = (await db.doc(`products/${order.productId}`).get()).data() as Record<string, any> | undefined;
  if (!prod?.autoFulfill) return; // non configuré pour l'auto → manuel

  // Fournisseur : champ explicite si présent, sinon déduit de l'historique (reloadlyProductId).
  const supplier = String(prod.supplier ?? (prod.reloadlyProductId ? 'reloadly' : 'manual'));

  // E-mail du client (commun aux deux branches).
  let email = String(order.email ?? '');
  const uid = String(order.uid ?? order.userId ?? '');
  if (!email && uid) email = String((await db.doc(`users/${uid}`).get()).data()?.email ?? '');

  // --- Branche GIFT ACCESS (remplace le manuel) --------------------------------------------
  if (supplier === 'giftaccess') {
    if (!giftaccess.isConfigured() || !prod.giftAccessProductId) return; // non prêt → manuel
    try {
      // Top-up direct : identifiant du joueur (Free Fire etc.). Absent pour les cartes/PIN.
      const playerId = String(order.freeFirePlayerId ?? order.playerId ?? order.playerUID ?? '').trim();
      const resp = await giftaccess.createOrder({
        productId: String(prod.giftAccessProductId),
        variationId: prod.giftAccessVariationId != null ? String(prod.giftAccessVariationId) : undefined,
        amount: prod.giftAccessAmountUsd != null ? Number(prod.giftAccessAmountUsd) : undefined, // produits 'range'
        userId: playerId || undefined,
        idempotencyKey: orderId, // pas de double-débit sur retry
      });
      const interp = interpretOrderResponse(resp);

      // On enregistre TOUJOURS l'id fournisseur + le statut → le poller sait quoi finaliser.
      // giftAccessPending=true tant que non terminal → cible du poller planifié.
      await snap.ref.update({
        supplier: 'giftaccess',
        giftAccessOrderId: interp.providerOrderId,
        giftAccessStatus: interp.providerStatus,
        giftAccessPending: !interp.terminal,
        giftAccessCreatedAt: FieldValue.serverTimestamp(),
      });

      // Si le fournisseur a livré immédiatement (ou déjà échoué) → on finalise tout de suite ;
      // sinon la commande reste « pending » et le poller planifié la reprendra.
      if (interp.terminal) {
        await finalizeDelivery(db, snap.ref, order, interp, email);
      }
    } catch (e) {
      await snap.ref.update({
        autoFulfillError: (e as Error).message,
        autoFulfillFailedAt: FieldValue.serverTimestamp(),
      });
    }
    return;
  }

  // --- Branche RELOADLY (inchangée) --------------------------------------------------------
  if (supplier !== 'reloadly') return; // 'manual' ou inconnu → manuel
  if (!reloadly.isConfigured()) return;
  if (!prod.reloadlyProductId) return;

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
