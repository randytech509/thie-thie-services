import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { creditWallet, DomainError } from './lib/transactions';
import { audit } from './lib/audit';
import { htgToCents } from './lib/money';
import { requireAdmin, mapDomainError, callOpts } from './lib/guards';
import { requireStepUp } from './lib/stepup';

/**
 * Validation manuelle des dépôts (flux baseline, invariant 3).
 * L'admin approuve/rejette une `wallet_request` ; l'approbation crédite via creditWallet()
 * (idempotent sur requestId → pas de double-crédit même en cas de re-clic/retry).
 */
export const reviewDeposit = onCall(callOpts, async (req) => {
  const admin = requireAdmin(req);
  const requestId = String(req.data?.requestId ?? '');
  const decision = String(req.data?.decision ?? '');
  if (!requestId) throw new HttpsError('invalid-argument', 'requestId requis');
  if (decision !== 'approve' && decision !== 'reject') {
    throw new HttpsError('invalid-argument', "decision doit être 'approve' ou 'reject'");
  }

  const db = getFirestore();
  await requireStepUp(db, admin.uid);
  const reqRef = db.doc(`wallet_requests/${requestId}`);
  const snap = await reqRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'demande introuvable');
  const data = snap.data()!;
  const status = data.status as string;
  if (status === 'Completed' || status === 'Rejected') {
    throw new HttpsError('failed-precondition', `demande déjà ${status}`);
  }

  const targetUid = data.uid as string;
  // Source du montant en centimes : `expectedAmountCentimes` si fourni, sinon conversion du HTG.
  const amountCents: number =
    typeof data.expectedAmountCentimes === 'number'
      ? data.expectedAmountCentimes
      : htgToCents(Number(data.amount));

  try {
    if (decision === 'reject') {
      await reqRef.update({
        status: 'Rejected',
        reviewedBy: admin.uid,
        reviewedAt: FieldValue.serverTimestamp(),
      });
      await audit(db, { action: 'reviewDeposit:reject', actorUid: admin.uid, targetUid, amountCents, meta: { requestId } });
      return { ok: true, status: 'Rejected' };
    }

    const result = await creditWallet(db, {
      uid: targetUid,
      amountCents,
      idempotencyKey: requestId,
      type: 'deposit',
      actorUid: admin.uid,
      meta: { requestId, method: data.paymentMethod ?? null },
    });
    await reqRef.update({
      status: 'Completed',
      reviewedBy: admin.uid,
      reviewedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, status: 'Completed', balanceAfterCents: result.balanceAfterCents, deduped: result.deduped };
  } catch (e) {
    throw mapDomainError(e);
  }
});

export { DomainError };
