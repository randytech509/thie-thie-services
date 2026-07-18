import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { creditWallet } from './transactions';
import { OxapayCallback } from './oxapay';

/**
 * Rapproche un callback OxaPay signé d'une `wallet_request` en attente et crédite (invariant 3).
 * Contrairement au SMS hook (matching ambigu txId+montant), ici le matching est direct :
 * `order_id` OxaPay == l'ID du document `wallet_requests` (fixé à la création de la facture,
 * voir crypto-deposits.ts). Ne crédite QUE sur status 'Paid' — tout statut intermédiaire
 * (ex. 'Paying') est journalisé sans effet financier.
 */
export interface ReconcileResult {
  matched: boolean;
  credited: boolean;
  requestId?: string;
  reason?: string;
  deduped?: boolean;
}

export async function reconcileOxapayCallback(db: Firestore, cb: OxapayCallback): Promise<ReconcileResult> {
  if (!cb.orderId) return { matched: false, credited: false, reason: 'order_id manquant' };

  const reqRef = db.doc(`wallet_requests/${cb.orderId}`);
  const snap = await reqRef.get();
  if (!snap.exists) return { matched: false, credited: false, reason: 'demande introuvable' };
  const data = snap.data()!;

  if (data.paymentMethod !== 'Crypto') {
    return { matched: false, credited: false, reason: 'demande non-crypto (order_id réutilisé ?)' };
  }
  if (data.status === 'Completed' || data.status === 'Rejected') {
    return { matched: true, credited: false, requestId: cb.orderId, reason: `déjà ${data.status}` };
  }

  if (cb.status !== 'Paid') {
    await reqRef.set(
      { oxapayLastStatus: cb.status, oxapayLastCallbackAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return { matched: true, credited: false, requestId: cb.orderId, reason: `statut intermédiaire (${cb.status})` };
  }

  const amountCents = data.expectedAmountCentimes as number;
  const res = await creditWallet(db, {
    uid: data.uid as string,
    amountCents,
    idempotencyKey: cb.orderId,
    type: 'deposit',
    actorUid: 'oxapay-webhook',
    meta: { provider: 'OxaPay', trackId: cb.trackId, amountUsd: data.amountUsd ?? null },
  });

  await reqRef.update({
    status: 'Completed',
    reviewedBy: 'oxapay-webhook',
    reviewedAt: FieldValue.serverTimestamp(),
    oxapayLastStatus: cb.status,
  });

  return { matched: true, credited: true, requestId: cb.orderId, deduped: res.deduped };
}
