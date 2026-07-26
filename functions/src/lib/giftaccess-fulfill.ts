import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { sendEmail, orderDeliveryHtml } from './email';

/**
 * Finalisation d'une commande livrée par GIFT ACCESS — PARTAGÉE entre le déclencheur
 * `autoFulfillOrder` (livraison immédiate) et le futur poller planifié (commandes asynchrones
 * passées en `delivered` après coup). Deux modes de livraison :
 *   - code/PIN (cartes, Free Fire Pin) → comme Reloadly ;
 *   - top-up DIRECT (Free Fire diamonds par player ID) → pas de code, une CONFIRMATION.
 *
 * ⚠️ TODO(sonde) : les noms de champs de la réponse /orders sont SUPPOSÉS (interpretOrderResponse
 * teste plusieurs variantes). À figer après `scripts/giftaccess-probe.mjs` + une vraie commande.
 */

export interface GiftAccessInterpretation {
  providerOrderId: string | null;
  providerStatus: string;
  terminal: boolean; // état final (livré OU échoué)
  delivered: boolean;
  failed: boolean;
  code: string | null;
  pin: string | null;
  note: string | null; // message de confirmation pour les top-up directs
}

const pick = (o: any, ...keys: string[]): any => {
  for (const k of keys) {
    const v = k.split('.').reduce((a: any, p) => (a == null ? a : a[p]), o);
    if (v != null && v !== '') return v;
  }
  return null;
};

export function interpretOrderResponse(resp: any): GiftAccessInterpretation {
  // Structure VALIDÉE (commande test sandbox) : { order_id, status, billing, delivery:{ items:[
  //   { type:'pin', pin_code, amount, face_value } ] }, sandbox_balance }.
  const data = resp?.data ?? resp ?? {};
  const providerOrderId = pick(data, 'order_id', 'id', 'orderId', 'reference');
  const rawStatus = String(pick(data, 'status', 'state', 'order_status') ?? 'pending').toLowerCase();
  const delivered = ['completed', 'delivered', 'success', 'succeeded', 'fulfilled', 'done'].includes(rawStatus);
  const failed = ['failed', 'rejected', 'cancelled', 'canceled', 'error', 'refunded'].includes(rawStatus);
  // La livraison réelle vit dans delivery.items[] (code/PIN) ; repli sur le top-level.
  const items = Array.isArray(data?.delivery?.items) ? data.delivery.items : [];
  const item0 = items[0] ?? {};
  const code = pick(item0, 'pin_code', 'code', 'card_code', 'cardCode', 'voucher') ?? pick(data, 'code', 'pin_code');
  const pin = pick(item0, 'pin_code', 'pinCode') ?? pick(data, 'pin');
  const note = pick(data, 'message', 'note', 'receipt') ?? pick(item0, 'note');
  return {
    providerOrderId: providerOrderId ? String(providerOrderId) : null,
    providerStatus: rawStatus,
    terminal: delivered || failed,
    delivered,
    failed,
    code: code ? String(code) : null,
    pin: pin ? String(pin) : null,
    note: note ? String(note) : null,
  };
}

/**
 * Applique le résultat interprété à la commande thie-thie.
 *  - failed   → marque l'échec (repli manuel côté back-office) ;
 *  - delivered→ écrit la livraison (code/PIN ou confirmation) + e-mail ;
 *  - pending  → ne touche à rien (le poller repassera).
 */
export async function finalizeDelivery(
  db: Firestore,
  orderRef: FirebaseFirestore.DocumentReference,
  order: Record<string, any>,
  interp: GiftAccessInterpretation,
  email: string,
): Promise<void> {
  void db; // signature homogène avec les autres helpers (db dispo si besoin futur)

  if (interp.failed) {
    await orderRef.update({
      giftAccessStatus: interp.providerStatus,
      giftAccessPending: false, // terminal (échec) → le poller ne le reprend plus
      autoFulfillError: `GIFT ACCESS: commande ${interp.providerStatus}`,
      autoFulfillFailedAt: FieldValue.serverTimestamp(),
    });
    return;
  }
  if (!interp.delivered) return; // encore en attente → le poller finalisera

  const code = interp.code ?? '';
  // Top-up direct : pas de code → message de confirmation par défaut.
  const note = interp.note ?? (code ? null : 'Recharge effectuée directement sur ton compte de jeu.');

  const html = orderDeliveryHtml({
    productName: order.productName || 'votre commande',
    optionLabel: order.optionLabel,
    code: code || '—',
    instructions: note ?? undefined,
  });
  const mail = email
    ? await sendEmail(email, 'Votre commande Thie Thie Services est livrée', html)
    : { sent: false, error: 'e-mail client absent' };

  await orderRef.update({
    deliveryCode: code || null,
    deliveryPin: interp.pin ?? null,
    deliveryInstructions: note ?? null,
    fulfilledAt: FieldValue.serverTimestamp(),
    autoFulfilled: true,
    autoFulfillProvider: 'giftaccess',
    giftAccessStatus: interp.providerStatus,
    giftAccessPending: false, // terminal (livré) → sort de la file du poller
    emailSent: mail.sent,
    emailError: mail.sent ? null : (mail.error ?? null),
  });
}
