import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { audit } from './lib/audit';
import { requireAdmin, callOpts } from './lib/guards';
import { requireStepUp } from './lib/stepup';

/**
 * Validation manuelle du KYC (léger, miroir de reviewDeposit — invariant 6 : seule une
 * Cloud Function avec Admin SDK peut faire transiter kycStatus, jamais le client Firestore).
 * L'approbation débloque la recharge crypto (createCryptoInvoice exige kycStatus == 'approved').
 */
export const reviewKyc = onCall(callOpts, async (req) => {
  const admin = requireAdmin(req);
  const requestId = String(req.data?.requestId ?? '');
  const decision = String(req.data?.decision ?? '');
  const reason = req.data?.reason != null ? String(req.data.reason) : null;
  if (!requestId) throw new HttpsError('invalid-argument', 'requestId requis');
  if (decision !== 'approve' && decision !== 'reject') {
    throw new HttpsError('invalid-argument', "decision doit être 'approve' ou 'reject'");
  }

  const db = getFirestore();
  await requireStepUp(db, admin.uid);
  const reqRef = db.doc(`kyc_requests/${requestId}`);
  const snap = await reqRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'demande introuvable');
  const data = snap.data()!;
  if (data.status !== 'pending') {
    throw new HttpsError('failed-precondition', `demande déjà ${data.status}`);
  }

  const targetUid = data.uid as string;
  const newStatus = decision === 'approve' ? 'approved' : 'rejected';

  const userRef = db.doc(`users/${targetUid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new HttpsError('not-found', 'utilisateur introuvable');

  await db.batch()
    .update(reqRef, {
      status: newStatus,
      reason,
      reviewedBy: admin.uid,
      reviewedAt: FieldValue.serverTimestamp(),
    })
    .update(userRef, {
      kycStatus: newStatus,
      updatedAt: FieldValue.serverTimestamp(),
    })
    .commit();

  await audit(db, {
    action: `reviewKyc:${decision}`,
    actorUid: admin.uid,
    targetUid,
    meta: { requestId, reason },
  });

  return { ok: true, status: newStatus };
});
