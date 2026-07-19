import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { addCents, subCents, assertCents, usdCentsToHtgCents, Cents } from './money';
import { auditInTx } from './audit';
import { REWARD_BY_ID, pointsForOrder } from '../data/rewards.data';
import { computePrice, PricingConfig, MarginMode } from './pricing';

// Défauts de tarification (dupliqués depuis pricing-admin pour éviter un import circulaire
// guards→transactions ; garder en phase). Utilisés pour les produits à MONTANT LIBRE (range).
const DEFAULT_PRICING: PricingConfig = {
  acquisitionHtgCentsPerUsd: 14200, cryptoDepositBps: 100, marginBps: 1500, marginMode: 'margin', roundToHtgCents: 500,
};
function pricingCfgFrom(snap: FirebaseFirestore.DocumentSnapshot): PricingConfig {
  const d = (snap.exists ? snap.data() : {}) ?? {};
  const intOr = (v: unknown, f: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : f);
  return {
    acquisitionHtgCentsPerUsd: intOr(d.acquisitionHtgCentsPerUsd, DEFAULT_PRICING.acquisitionHtgCentsPerUsd),
    cryptoDepositBps: intOr(d.cryptoDepositBps, DEFAULT_PRICING.cryptoDepositBps),
    marginBps: intOr(d.marginBps, DEFAULT_PRICING.marginBps),
    marginMode: (d.marginMode === 'markup' ? 'markup' : 'margin') as MarginMode,
    roundToHtgCents: intOr(d.roundToHtgCents, DEFAULT_PRICING.roundToHtgCents),
  };
}

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
  // MONTANT LIBRE (cartes à plage) : le client envoie le MONTANT choisi en centimes USD,
  // JAMAIS le prix. Le serveur recalcule le prix HTG (invariant 3 : prix résolu serveur).
  amountUsdCents?: number;
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

/**
 * Prix unitaire HTG pour un produit à PRIX DYNAMIQUE, calculé SERVEUR à partir de la
 * dénomination/montant choisi par le client (invariant 3 : le client fournit le MONTANT USD,
 * JAMAIS le prix). Deux formes :
 *   - `pricing.type === 'fixed'` : dénominations imposées (`denominations` en centimes USD) —
 *     le montant DOIT être l'une d'elles (ex. Netflix US : $20/$25/…/$100 dans une seule carte).
 *   - `pricing.type === 'range'` : montant LIBRE en dollars entiers dans [min, max] (ex. Visa).
 * Renvoie null pour un produit à prix fixe simple (→ `unitPriceCents` lit `priceCents`).
 */
function dynamicUnitPriceCents(
  product: FirebaseFirestore.DocumentData,
  amountUsdCents: number | undefined,
  pricingSnap: FirebaseFirestore.DocumentSnapshot,
): Cents | null {
  const pricing = product.pricing as Record<string, unknown> | undefined;
  const type = pricing?.type;
  if (!pricing || (type !== 'range' && type !== 'fixed')) return null;

  if (typeof amountUsdCents !== 'number' || !Number.isInteger(amountUsdCents)) {
    throw new DomainError('invalid-amount', 'montant (dénomination) requis pour ce produit');
  }
  // Montant contraint aux DOLLARS ENTIERS (pas de $25,10) — multiple de 100 centimes.
  if (amountUsdCents % 100 !== 0) {
    throw new DomainError('invalid-amount', 'montant en dollars entiers uniquement');
  }
  if (type === 'range') {
    const min = pricing.minUsdCents as number;
    const max = pricing.maxUsdCents as number;
    if (amountUsdCents < min || amountUsdCents > max) {
      throw new DomainError('invalid-amount', `montant hors plage (${min / 100}–${max / 100} USD)`);
    }
  } else {
    const denoms = pricing.denominations as number[] | undefined;
    if (!Array.isArray(denoms) || !denoms.includes(amountUsdCents)) {
      throw new DomainError('invalid-amount', 'dénomination non disponible pour ce produit');
    }
  }
  const b = computePrice(
    {
      faceUsdCents: amountUsdCents,
      discountBps: (pricing.discountBps as number) ?? 0,
      fixedFeeUsdCents: (pricing.fixedFeeUsdCents as number) ?? 0,
      feeBps: (pricing.feeBps as number) ?? 0,
    },
    pricingCfgFrom(pricingSnap),
  );
  return b.retailHtgCents;
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
  const pricingRef = db.doc('config/pricing');

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
    const [userSnap, productSnap, fxSnap, pricingSnap] = await Promise.all([
      t.get(userRef), t.get(productRef), t.get(fxRef), t.get(pricingRef),
    ]);
    if (!userSnap.exists) throw new DomainError('user-not-found', 'utilisateur introuvable');
    if (!productSnap.exists) throw new DomainError('product-not-found', 'produit introuvable');
    const product = productSnap.data()!;
    if (product.available !== true) throw new DomainError('unavailable', 'produit indisponible');

    const stock = (product.stock as number) ?? 0;
    if (!Number.isInteger(stock) || stock < qty) throw new DomainError('out-of-stock', 'stock insuffisant');

    const htgCentsPerUsd = fxSnap.exists ? (fxSnap.get('htgCentsPerUsd') as number) : null;
    const unit = dynamicUnitPriceCents(product, p.amountUsdCents, pricingSnap) ?? unitPriceCents(product, htgCentsPerUsd);
    const totalCents = unit * qty;
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
 * PANIER (invariant 3) : achat de PLUSIEURS articles en une seule transaction.
 *
 * Architecture : 1 DÉBIT, N COMMANDES. Le wallet est débité une seule fois pour
 * le total, mais chaque ligne produit une commande NORMALE à un seul produit
 * (`orders/{key}-{i}`, partageant un `groupId`). Conséquence voulue : l'auto-
 * livraison (`autoFulfillOrder`), le back-office et l'historique fonctionnent
 * SANS modification, et l'échec d'une ligne à la livraison ne bloque pas les autres.
 *
 * Prix TOUJOURS résolus serveur (le client envoie produit + quantité + montant,
 * jamais un prix). Atomique : si une ligne est indisponible/en rupture, RIEN n'est débité.
 * ====================================================================== */
export interface CartLine {
  productId: string;
  quantity: number;
  amountUsdCents?: number;  // dénomination / montant choisi (cartes cadeaux)
  playerId?: string;        // ID de joueur (recharges de jeux) — par ligne
  region?: string;
  optionLabel?: string;
}

export interface PlaceCartOrderParams {
  uid: string;
  lines: CartLine[];
  idempotencyKey: string;   // clé du panier (dédupe le double-checkout)
}

export interface PlaceCartOrderResult {
  groupId: string;
  orderIds: string[];
  totalCents: Cents;
  balanceAfterCents: Cents;
  pointsEarned: number;
  deduped: boolean;
}

const MAX_CART_LINES = 20;

export async function placeCartOrder(db: Firestore, p: PlaceCartOrderParams): Promise<PlaceCartOrderResult> {
  if (!p.uid) throw new DomainError('invalid-arg', 'uid manquant');
  if (!p.idempotencyKey) throw new DomainError('invalid-arg', 'idempotencyKey manquant');
  if (!Array.isArray(p.lines) || p.lines.length === 0) throw new DomainError('invalid-arg', 'panier vide');
  if (p.lines.length > MAX_CART_LINES) throw new DomainError('invalid-arg', `panier trop grand (max ${MAX_CART_LINES})`);
  for (const l of p.lines) {
    if (!l.productId) throw new DomainError('invalid-arg', 'productId manquant dans une ligne');
    if (!Number.isInteger(l.quantity) || l.quantity <= 0 || l.quantity > 20) {
      throw new DomainError('invalid-qty', 'quantité de ligne invalide');
    }
  }

  const key = p.idempotencyKey;
  const userRef = db.doc(`users/${p.uid}`);
  const fxRef = db.doc('config/fx');
  const pricingRef = db.doc('config/pricing');
  const ledgerRef = db.doc(`wallet_transactions/${key}-cart-debit`);
  const uniqueIds = [...new Set(p.lines.map((l) => l.productId))];

  return db.runTransaction(async (t) => {
    // — Idempotence : le ledger du panier fait foi (rejeu → on renvoie le résultat stocké) —
    const ledgerSnap = await t.get(ledgerRef);
    if (ledgerSnap.exists) {
      const meta = (ledgerSnap.get('meta') as { orderIds?: string[]; pointsEarned?: number }) ?? {};
      return {
        groupId: key,
        orderIds: meta.orderIds ?? [],
        totalCents: ledgerSnap.get('amountCents') as number,
        balanceAfterCents: ledgerSnap.get('balanceAfterCents') as number,
        pointsEarned: meta.pointsEarned ?? 0,
        deduped: true,
      };
    }

    // — Lectures (toutes avant écritures) —
    const [userSnap, fxSnap, pricingSnap, ...productSnaps] = await Promise.all([
      t.get(userRef), t.get(fxRef), t.get(pricingRef),
      ...uniqueIds.map((id) => t.get(db.doc(`products/${id}`))),
    ]);
    if (!userSnap.exists) throw new DomainError('user-not-found', 'utilisateur introuvable');

    const byId = new Map<string, FirebaseFirestore.DocumentData>();
    productSnaps.forEach((snap, i) => {
      if (!snap.exists) throw new DomainError('product-not-found', `produit introuvable : ${uniqueIds[i]}`);
      const data = snap.data()!;
      if (data.available !== true) throw new DomainError('unavailable', `produit indisponible : ${data.name ?? uniqueIds[i]}`);
      byId.set(uniqueIds[i], data);
    });

    // Stock : agrégé PAR PRODUIT (deux lignes peuvent viser le même produit à des montants différents).
    const qtyByProduct = new Map<string, number>();
    for (const l of p.lines) qtyByProduct.set(l.productId, (qtyByProduct.get(l.productId) ?? 0) + l.quantity);
    for (const [id, needed] of qtyByProduct) {
      const stock = (byId.get(id)!.stock as number) ?? 0;
      if (!Number.isInteger(stock) || stock < needed) {
        throw new DomainError('out-of-stock', `stock insuffisant : ${byId.get(id)!.name ?? id}`);
      }
    }

    // — Prix : chaque ligne résolue SERVEUR —
    const htgCentsPerUsd = fxSnap.exists ? (fxSnap.get('htgCentsPerUsd') as number) : null;
    const lineTotals = p.lines.map((l) => {
      const product = byId.get(l.productId)!;
      const unit = dynamicUnitPriceCents(product, l.amountUsdCents, pricingSnap) ?? unitPriceCents(product, htgCentsPerUsd);
      const lt = unit * l.quantity;
      assertCents(lt, 'total de ligne');
      return lt;
    });
    const totalCents = lineTotals.reduce((a, b) => a + b, 0);
    assertCents(totalCents, 'totalCents');

    const before: Cents = (userSnap.get('walletBalanceCents') as number) ?? 0;
    assertCents(before, 'walletBalanceCents existant');
    if (before < totalCents) throw new DomainError('insufficient-funds', 'solde insuffisant');
    const after = subCents(before, totalCents);

    const pointsEarned = pointsForOrder(totalCents);
    const pointsBefore = (userSnap.get('thieThiePoints') as number) ?? 0;
    const orderIds = p.lines.map((_l, i) => `${key}-${i}`);

    // — Écritures : 1 débit, stock par produit, N commandes normales —
    t.update(userRef, {
      walletBalanceCents: after,
      totalSpentCents: addCents((userSnap.get('totalSpentCents') as number) ?? 0, totalCents),
      thieThiePoints: pointsBefore + pointsEarned,
      updatedAt: FieldValue.serverTimestamp(),
    });
    for (const [id, needed] of qtyByProduct) {
      t.update(db.doc(`products/${id}`), { stock: ((byId.get(id)!.stock as number) ?? 0) - needed });
    }
    p.lines.forEach((l, i) => {
      const product = byId.get(l.productId)!;
      t.set(db.doc(`orders/${orderIds[i]}`), {
        orderId: orderIds[i],
        groupId: key,               // relie les commandes d'un même panier
        userId: p.uid,
        uid: p.uid,
        productId: l.productId,
        productName: product.name ?? '',
        quantity: l.quantity,
        priceCents: lineTotals[i],
        balanceAfterCents: after,
        pointsEarned: i === 0 ? pointsEarned : 0, // points comptés une fois pour le panier
        status: 'completed',
        playerId: l.playerId ?? null,
        region: l.region ?? null,
        optionLabel: l.optionLabel ?? null,
        paymentMethod: 'wallet',
        createdAt: FieldValue.serverTimestamp(),
      });
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
      meta: { groupId: key, orderIds, pointsEarned, lines: p.lines.length },
      createdAt: FieldValue.serverTimestamp(),
    });
    auditInTx(db, t, {
      action: 'placeCartOrder',
      actorUid: p.uid,
      targetUid: p.uid,
      amountCents: totalCents,
      meta: { groupId: key, orderIds, lines: p.lines.length },
    });

    return { groupId: key, orderIds, totalCents, balanceAfterCents: after, pointsEarned, deduped: false };
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
