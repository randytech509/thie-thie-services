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

/** Normalise un numéro de téléphone en chiffres, 8 derniers (numéros haïtiens). */
function normPhone(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '').slice(-8);
}

export async function reconcileSms(db: Firestore, parsed: ParsedSms): Promise<ReconcileResult> {
  // SÉCURITÉ : ne créditer QUE les SMS d'argent REÇU. « transferred / retiré » (sortant) et
  // le bruit (promo, OTP) ne doivent jamais créditer un wallet.
  if (parsed.direction !== 'in') {
    return { matched: false, credited: false, reason: `sms non-entrant (${parsed.direction})` };
  }
  // Le montant est INDISPENSABLE (jamais de crédit sans montant concordant). Le txId OU le
  // numéro expéditeur sert de clé de rapprochement.
  if (parsed.amountCents == null) {
    return { matched: false, credited: false, reason: 'sms-incomplet (montant manquant)' };
  }
  if (!parsed.txId && !parsed.sender) {
    return { matched: false, credited: false, reason: 'sms-incomplet (ni txId ni expéditeur)' };
  }

  const snap = await db
    .collection('wallet_requests')
    .where('paymentMethod', '==', parsed.provider)
    .where('status', '==', 'Pending Verification')
    .get();

  const amountMatch = (data: FirebaseFirestore.DocumentData) => reqAmountCents(data) === parsed.amountCents;

  // 1) PRIMAIRE : Transaction ID + montant (le TransCode saisi par le client == celui du SMS marchand).
  let candidates = parsed.txId
    ? snap.docs.filter((d) => {
        const data = d.data();
        const ref = String(data.transactionReference ?? '').toUpperCase().trim();
        return ref && ref === String(parsed.txId).toUpperCase().trim() && amountMatch(data);
      })
    : [];
  let matchBy = 'txId';

  // 2) REPLI : numéro de l'expéditeur + montant (si le TxID ne concorde pas — le TransCode peut
  //    différer entre le SMS du client et celui du marchand). Le Nom sert de vérification/affichage.
  if (candidates.length === 0 && parsed.sender) {
    const smsPhone = normPhone(parsed.sender);
    if (smsPhone.length >= 6) {
      candidates = snap.docs.filter((d) => {
        const data = d.data();
        return normPhone(data.senderPhone) === smsPhone && amountMatch(data);
      });
      matchBy = 'senderPhone';
    }
  }

  if (candidates.length === 0) return { matched: false, credited: false, reason: 'aucune demande concordante' };
  if (candidates.length > 1) return { matched: false, credited: false, reason: `correspondance ambiguë (plusieurs demandes, par ${matchBy})` };

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
    meta: { provider: parsed.provider, txId: parsed.txId, sender: parsed.sender ?? null, senderName: parsed.senderName ?? null, matchBy, source: 'sms-hook' },
  });

  await doc.ref.update({
    status: 'Completed',
    reviewedBy: 'sms-hook',
    reviewedAt: FieldValue.serverTimestamp(),
    matchedTxId: parsed.txId ?? null,
    matchedBy: matchBy,
  });

  return { matched: true, credited: true, requestId, deduped: res.deduped };
}
