import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { addCents, subCents, assertCents, usdCentsToHtgCents, Cents } from './money';
import { auditInTx } from './audit';
import { REWARD_BY_ID, pointsForOrder } from '../data/rewards.data';

/**
 * Cœur financier — SEUL chemin d'écriture des soldes (invariant 3).
 * Tout est transactionnel (`runTransaction`) et idempotent : la clé d'idempotence
 * est l'ID du document ledger / commande, ce qui empêche tout double-crédit/débit
 * même en cas de retry réseau ou de double-clic.
 *
 * Source de vérité des soldes (centimes HTG, serveur-only) :
 *   users/{uid}.walletBalanceCents · totalAddedCents · totalSpentCents
 */

export class DomainError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export type CreditType = 'deposit' | 'refund' | 'adjustment';

export interface CreditParams {
  uid: string;
  amountCents: Cents;        // > 0
  idempotencyKey: string;    // ID unique (ex: requestId du dépôt, providerTxId)
  type: CreditType;
  actorUid?: string;         // admin qui valide, sinon 'system'
  meta?: Record<string, unknown>;
}

export interface CreditResult {
  balanceAfterCents: Cents;
  deduped: boolean;          // true si l'opération avait déjà été appliquée
}

export async function creditWallet(db: Firestore, p: CreditParams): Promise<CreditResult> {
  assertCents(p.amountCents, 'amountCents');
  if (p.amountCents <= 0) throw new DomainError('invalid-amount', 'Le crédit doit être > 0');
  if (!p.uid) throw new DomainError('invalid-arg', 'uid manquant');
  if (!p.idempotencyKey) throw new DomainError('invalid-arg', 'idempotencyKey manquant');

  const userRef = db.doc(`users/${p.uid}`);
  const txRef = db.doc(`wallet_transactions/${p.idempotencyKey}`);
  const actorUid = p.actorUid ?? 'system';

  return db.runTransaction(async (t) => {
    const txSnap = await t.get(txRef);
    if (txSnap.exists) {
      // Déjà appliqué → idempotent, on renvoie le solde déjà calculé sans re-créditer.
      return { balanceAfterCents: txSnap.get('balanceAfterCents') as number, deduped: true };
    }
    const userSnap = await t.get(userRef);
    if (!userSnap.exists) throw new DomainError('user-not-found', `users/${p.uid} introuvable`);

    const before: Cents = (userSnap.get('walletBalanceCents') as number) ?? 0;
    assertCents(before, 'walletBalanceCents existant');
    const after = addCents(before, p.amountCents);
    const totalAdded = addCents((userSnap.get('totalAddedCents') as number) ?? 0, p.amountCents);

    t.update(userRef, {
      walletBalanceCents: after,
      totalAddedCents: totalAdded,
      updatedAt: FieldValue.serverTimestamp(),
    });
    t.set(txRef, {
      transactionId: p.idempotencyKey,
      uid: p.uid,
      type: p.type,
      direction: 'credit',
      amountCents: p.amountCents,
      balanceBeforeCents: before,
      balanceAfterCents: after,
      status: 'Completed',
      actorUid,
      meta: p.meta ?? {},
      createdAt: FieldValue.serverTimestamp(),
    });
    auditInTx(db, t, {
      action: `creditWallet:${p.type}`,
      actorUid,
      targetUid: p.uid,
      amountCents: p.amountCents,
      meta: { idempotencyKey: p.idempotencyKey },
    });
    return { balanceAfterCents: after, deduped: false };
  });
}

export interface PlaceOrderParams {
  uid: string;
  productId: string;
  quantity: number;
  idempotencyKey: string;    // ID de commande (fourni par le client, dédupe le double-achat)
  // Métadonnées de livraison (n'influencent JAMAIS le prix — résolu serveur) :
  playerId?: string;         // ID de joueur pour les recharges de jeux (Free Fire, etc.)
  region?: string;           // région choisie (affichage/livraison)
  optionLabel?: string;      // libellé de l'option choisie (ex: "100 +10 Diamonds")
}

export interface PlaceOrderResult {
  orderId: string;
  totalCents: Cents;
  balanceAfterCents: Cents;
  pointsEarned: number;       // points fidélité octroyés SERVEUR (invariant 2)
  deduped: boolean;
}

/** Résout le prix unitaire en centimes HTG (FX appliqué seulement aux biens libellés USD). */
function unitPriceCents(productData: FirebaseFirestore.DocumentData, htgCentsPerUsd: number | null): Cents {
  const currency = (productData.currency as string) ?? 'HTG';
  if (currency === 'USD') {
    const usdCents = productData.priceUsdCents as number;
    assertCents(usdCents, 'priceUsdCents');
    if (htgCentsPerUsd == null) throw new DomainError('fx-missing', 'Taux FX /config/fx absent');
    return usdCentsToHtgCents(usdCents, htgCentsPerUsd);
  }
  const priceCents = productData.priceCents as number;
  assertCents(priceCents, 'priceCents');
  return priceCents;
}

export async function placeOrder(db: Firestore, p: PlaceOrderParams): Promise<PlaceOrderResult> {
  if (!p.uid) throw new DomainError('invalid-arg', 'uid manquant');
  if (!p.productId) throw new DomainError('invalid-arg', 'productId manquant');
  if (!p.idempotencyKey) throw new DomainError('invalid-arg', 'idempotencyKey manquant');
  const qty = p.quantity ?? 1;
  if (!Number.isInteger(qty) || qty <= 0) throw new DomainError('invalid-qty', 'quantité invalide');

  const userRef = db.doc(`users/${p.uid}`);
  const productRef = db.doc(`products/${p.productId}`);
  const orderRef = db.doc(`orders/${p.idempotencyKey}`);
  const ledgerRef = db.doc(`wallet_transactions/${p.idempotencyKey}-debit`);
  const fxRef = db.doc('config/fx');

  return db.runTransaction(async (t) => {
    // — Lectures (toutes avant écritures) —
    const orderSnap = await t.get(orderRef);
    if (orderSnap.exists) {
      // Défense en profondeur : ne traiter comme un doublon légitime QUE si la commande
      // existante a bien été produite par CE chemin serveur (statut 'completed' + propriétaire
      // concordant). Un doc `orders/{idempotencyKey}` forgé côté client ne doit JAMAIS
      // court-circuiter le débit — on refuse plutôt que de renvoyer un faux succès sans paiement.
      // (Les règles interdisent déjà toute création client d'`orders` ; ceci est la 2e barrière.)
      if (orderSnap.get('status') !== 'completed' || orderSnap.get('uid') !== p.uid) {
        throw new DomainError('order-conflict', 'ID de commande déjà utilisé (conflit)');
      }
      return {
        orderId: orderRef.id,
        totalCents: orderSnap.get('priceCents') as number,
        balanceAfterCents: orderSnap.get('balanceAfterCents') as number,
        pointsEarned: (orderSnap.get('pointsEarned') as number) ?? 0,
        deduped: true,
      };
    }
    const [userSnap, productSnap, fxSnap] = await Promise.all([
      t.get(userRef), t.get(productRef), t.get(fxRef),
    ]);
    if (!userSnap.exists) throw new DomainError('user-not-found', 'utilisateur introuvable');
    if (!productSnap.exists) throw new DomainError('product-not-found', 'produit introuvable');
    const product = productSnap.data()!;
    if (product.available !== true) throw new DomainError('unavailable', 'produit indisponible');

    const stock = (product.stock as number) ?? 0;
    if (!Number.isInteger(stock) || stock < qty) throw new DomainError('out-of-stock', 'stock insuffisant');

    const htgCentsPerUsd = fxSnap.exists ? (fxSnap.get('htgCentsPerUsd') as number) : null;
    const totalCents = unitPriceCents(product, htgCentsPerUsd) * qty;
    assertCents(totalCents, 'totalCents');

    const before: Cents = (userSnap.get('walletBalanceCents') as number) ?? 0;
    assertCents(before, 'walletBalanceCents existant');
    if (before < totalCents) throw new DomainError('insufficient-funds', 'solde insuffisant');
    const after = subCents(before, totalCents); // garanti ≥ 0 par le test ci-dessus

    // Points fidélité octroyés SERVEUR (invariant 2 : jamais écrits par le client).
    const pointsEarned = pointsForOrder(totalCents);
    const pointsBefore = (userSnap.get('thieThiePoints') as number) ?? 0;

    // — Écritures —
    t.update(userRef, {
      walletBalanceCents: after,
      totalSpentCents: addCents((userSnap.get('totalSpentCents') as number) ?? 0, totalCents),
      thieThiePoints: pointsBefore + pointsEarned,
      updatedAt: FieldValue.serverTimestamp(),
    });
    t.update(productRef, { stock: stock - qty });
    t.set(orderRef, {
      orderId: orderRef.id,
      userId: p.uid,
      uid: p.uid,
      productId: p.productId,
      productName: product.name ?? '',
      quantity: qty,
      priceCents: totalCents,
      balanceAfterCents: after,
      pointsEarned,
      status: 'completed',
      // Métadonnées de livraison (informatives — le prix reste résolu serveur)
      playerId: p.playerId ?? null,
      region: p.region ?? null,
      optionLabel: p.optionLabel ?? null,
      paymentMethod: 'wallet',
      createdAt: FieldValue.serverTimestamp(),
    });
    t.set(ledgerRef, {
      transactionId: ledgerRef.id,
      uid: p.uid,
      type: 'purchase',
      direction: 'debit',
      amountCents: totalCents,
      balanceBeforeCents: before,
      balanceAfterCents: after,
      status: 'Completed',
      actorUid: p.uid,
      meta: { orderId: orderRef.id, productId: p.productId, quantity: qty },
      createdAt: FieldValue.serverTimestamp(),
    });
    auditInTx(db, t, {
      action: 'placeOrder',
      actorUid: p.uid,
      targetUid: p.uid,
      amountCents: totalCents,
      meta: { orderId: orderRef.id, productId: p.productId, quantity: qty },
    });
    return { orderId: orderRef.id, totalCents, balanceAfterCents: after, pointsEarned, deduped: false };
  });
}

/* =========================================================================
 * Rédemption de récompense fidélité (invariant 2/3) : dépense de points →
 * émission d'un coupon. Points et coupon sont serveur-only ; le client ne peut
 * NI débiter des points NI créer un coupon (firestore.rules les refuse).
 * Transactionnel + idempotent sur l'ID de coupon (clé fournie par le client).
 * ====================================================================== */
export interface RedeemParams {
  uid: string;
  rewardId: string;
  idempotencyKey: string; // ID du coupon → dédupe la double-rédemption
}

export interface RedeemResult {
  couponId: string;
  code: string;
  cost: number;
  pointsAfter: number;
  deduped: boolean;
}

export async function redeemReward(db: Firestore, p: RedeemParams): Promise<RedeemResult> {
  if (!p.uid) throw new DomainError('invalid-arg', 'uid manquant');
  if (!p.idempotencyKey) throw new DomainError('invalid-arg', 'idempotencyKey manquant');
  const reward = REWARD_BY_ID.get(p.rewardId);
  if (!reward) throw new DomainError('reward-not-found', 'récompense inconnue');

  const userRef = db.doc(`users/${p.uid}`);
  const couponRef = db.doc(`users/${p.uid}/coupons/${p.idempotencyKey}`);

  return db.runTransaction(async (t) => {
    // — Lectures (avant écritures) —
    const [couponSnap, userSnap] = await Promise.all([t.get(couponRef), t.get(userRef)]);
    if (!userSnap.exists) throw new DomainError('user-not-found', 'utilisateur introuvable');
    const points = (userSnap.get('thieThiePoints') as number) ?? 0;

    if (couponSnap.exists) {
      // Déjà rédimé (retry/double-clic) : on ne re-débite pas.
      return {
        couponId: couponRef.id,
        code: couponSnap.get('code') as string,
        cost: (couponSnap.get('cost') as number) ?? reward.cost,
        pointsAfter: points,
        deduped: true,
      };
    }

    if (points < reward.cost) throw new DomainError('insufficient-points', 'points insuffisants');
    const after = points - reward.cost;

    // — Écritures —
    t.update(userRef, { thieThiePoints: after, updatedAt: FieldValue.serverTimestamp() });
    t.set(couponRef, {
      couponId: couponRef.id,
      rewardId: reward.id,
      code: reward.code,
      titleFR: reward.titleFR,
      titleHT: reward.titleHT,
      cost: reward.cost,
      status: 'active',
      claimedAt: new Date().toISOString(),
      createdAt: FieldValue.serverTimestamp(),
    });
    auditInTx(db, t, {
      action: 'redeemReward',
      actorUid: p.uid,
      targetUid: p.uid,
      meta: { rewardId: reward.id, code: reward.code, cost: reward.cost, pointsAfter: after },
    });

    return { couponId: couponRef.id, code: reward.code, cost: reward.cost, pointsAfter: after, deduped: false };
  });
}
