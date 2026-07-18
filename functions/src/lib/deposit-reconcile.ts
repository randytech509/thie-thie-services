import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { creditWallet } from './transactions';
import { htgToCents } from './money';
import { ParsedSms } from './sms';

/**
 * Rapproche un SMS de paiement d'une demande de dépôt en attente et auto-crédite (invariant 3).
 *
 * SÉCURITÉ / conservatisme : on ne crédite AUTOMATIQUEMENT que si l'on trouve
 * EXACTEMENT UNE `wallet_request` en attente qui concorde à la fois sur le **txId**
 * ET le **montant**. Tout le reste (aucune correspondance, ambiguë, txId manquant) →
 * NON crédité, rangé dans `sms_inbox` pour rapprochement manuel par l'admin.
 *
 * Idempotence : le crédit utilise `requestId` comme clé (comme `reviewDeposit`) → un même
 * dépôt ne peut être crédité deux fois (SMS rejoué, ou admin qui approuve aussi).
 */
export interface ReconcileResult {
  matched: boolean;
  credited: boolean;
  requestId?: string;
  reason?: string;
  deduped?: boolean;
}

function reqAmountCents(data: FirebaseFirestore.DocumentData): number | null {
  if (typeof data.expectedAmountCentimes === 'number') return data.expectedAmountCentimes;
  if (data.amount != null && Number.isFinite(Number(data.amount))) return htgToCents(Number(data.amount));
  return null;
}

export async function reconcileSms(db: Firestore, parsed: ParsedSms): Promise<ReconcileResult> {
  // SÉCURITÉ : ne créditer QUE les SMS d'argent REÇU. « transferred / retiré » (sortant) et
  // le bruit (promo, OTP) ne doivent jamais créditer un wallet.
  if (parsed.direction !== 'in') {
    return { matched: false, credited: false, reason: `sms non-entrant (${parsed.direction})` };
  }
  if (parsed.amountCents == null || !parsed.txId) {
    return { matched: false, credited: false, reason: 'sms-incomplet (montant ou txId manquant)' };
  }

  const snap = await db
    .collection('wallet_requests')
    .where('paymentMethod', '==', parsed.provider)
    .where('status', '==', 'Pending Verification')
    .get();

  const candidates = snap.docs.filter((d) => {
    const data = d.data();
    const ref = String(data.transactionReference ?? '').toUpperCase().trim();
    const amt = reqAmountCents(data);
    return ref && ref === parsed.txId && amt === parsed.amountCents;
  });

  if (candidates.length === 0) return { matched: false, credited: false, reason: 'aucune demande concordante' };
  if (candidates.length > 1) return { matched: false, credited: false, reason: 'correspondance ambiguë (plusieurs demandes)' };

  const doc = candidates[0];
  const data = doc.data();
  const requestId = doc.id;
  const uid = data.uid as string;

  const res = await creditWallet(db, {
    uid,
    amountCents: parsed.amountCents,
    idempotencyKey: requestId,
    type: 'deposit',
    actorUid: 'sms-hook',
    meta: { provider: parsed.provider, txId: parsed.txId, sender: parsed.sender ?? null, source: 'sms-hook' },
  });

  await doc.ref.update({
    status: 'Completed',
    reviewedBy: 'sms-hook',
    reviewedAt: FieldValue.serverTimestamp(),
    matchedTxId: parsed.txId,
  });

  return { matched: true, credited: true, requestId, deduped: res.deduped };
}
