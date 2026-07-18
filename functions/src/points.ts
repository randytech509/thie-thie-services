import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { redeemReward as redeemRewardTx } from './lib/transactions';
import { requireAuth, mapDomainError, callOpts } from './lib/guards';

/**
 * Rédemption d'une récompense fidélité (invariant 2/3) : le client dépense des
 * points Thie Thie contre un coupon. Coût et code viennent du catalogue SERVEUR
 * (rewards.data) — jamais du client. Débit des points + création du coupon en une
 * transaction atomique, idempotente sur l'ID de coupon fourni par le client.
 */
export const redeemReward = onCall(callOpts, async (req) => {
  const actor = requireAuth(req);
  const rewardId = String(req.data?.rewardId ?? '');
  const idempotencyKey = String(req.data?.idempotencyKey ?? '');
  if (!rewardId) throw new HttpsError('invalid-argument', 'rewardId requis');
  if (!idempotencyKey) throw new HttpsError('invalid-argument', 'idempotencyKey requis');

  try {
    const res = await redeemRewardTx(getFirestore(), { uid: actor.uid, rewardId, idempotencyKey });
    return { ok: true, ...res };
  } catch (e) {
    throw mapDomainError(e);
  }
});
