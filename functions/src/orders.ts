import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { placeOrder, placeCartOrder, CartLine } from './lib/transactions';
import { requireAuth, mapDomainError, callOpts } from './lib/guards';

/**
 * Achat depuis le wallet (invariant 3) : prix et stock résolus SERVEUR (client hostile),
 * débit + décrément de stock + écriture de commande/ledger en une seule transaction atomique,
 * solde garanti ≥ 0, idempotent sur l'ID de commande fourni par le client.
 */
export const placeOrderCallable = onCall(callOpts, async (req) => {
  const actor = requireAuth(req);
  const productId = String(req.data?.productId ?? '');
  const idempotencyKey = String(req.data?.idempotencyKey ?? '');
  const quantity = Number(req.data?.quantity ?? 1);
  if (!productId) throw new HttpsError('invalid-argument', 'productId requis');
  if (!idempotencyKey) throw new HttpsError('invalid-argument', 'idempotencyKey requis');

  // Montant libre (cartes à plage) : le client fournit le MONTANT en USD (jamais le prix).
  // Converti en centimes entiers ; le serveur recalcule le prix (placeOrder / rangeUnitPriceCents).
  const amountUsdRaw = req.data?.amountUsd;
  const amountUsdCents = amountUsdRaw !== undefined && amountUsdRaw !== null && amountUsdRaw !== ''
    ? Math.round(Number(amountUsdRaw) * 100)
    : undefined;
  if (amountUsdCents !== undefined && (!Number.isInteger(amountUsdCents) || amountUsdCents <= 0 || amountUsdCents > 100000000)) {
    throw new HttpsError('invalid-argument', 'montant USD invalide');
  }

  // Métadonnées de livraison optionnelles (bornées ; sans effet sur le prix)
  const trimOpt = (v: unknown, max = 120) => {
    const s = String(v ?? '').trim();
    return s ? s.slice(0, max) : undefined;
  };

  try {
    const result = await placeOrder(getFirestore(), {
      uid: actor.uid,
      productId,
      quantity,
      idempotencyKey,
      playerId: trimOpt(req.data?.playerId, 64),
      region: trimOpt(req.data?.region, 40),
      optionLabel: trimOpt(req.data?.optionLabel, 120),
      amountUsdCents,
    });
    return { ok: true, ...result };
  } catch (e) {
    throw mapDomainError(e);
  }
});

/**
 * Checkout PANIER (invariant 3) : plusieurs articles, UN SEUL débit wallet, N commandes
 * normales groupées par `groupId`. Prix de chaque ligne résolus SERVEUR (le client envoie
 * produit + quantité + montant choisi + ID de joueur, JAMAIS un prix). Idempotent sur la
 * clé du panier → un double-clic sur « Payer » ne débite qu'une fois.
 */
export const placeCartOrderCallable = onCall(callOpts, async (req) => {
  const actor = requireAuth(req);
  const idempotencyKey = String(req.data?.idempotencyKey ?? '');
  if (!idempotencyKey) throw new HttpsError('invalid-argument', 'idempotencyKey requis');

  const rawLines = req.data?.lines;
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    throw new HttpsError('invalid-argument', 'panier vide');
  }

  const trimOpt = (v: unknown, max = 120) => {
    const s = String(v ?? '').trim();
    return s ? s.slice(0, max) : undefined;
  };

  const lines: CartLine[] = rawLines.map((l: Record<string, unknown>) => {
    const productId = String(l?.productId ?? '').trim();
    if (!productId) throw new HttpsError('invalid-argument', 'productId manquant dans une ligne');
    const quantity = Number(l?.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 20) {
      throw new HttpsError('invalid-argument', 'quantité de ligne invalide (1-20)');
    }
    const rawAmount = l?.amountUsd;
    const amountUsdCents = rawAmount !== undefined && rawAmount !== null && rawAmount !== ''
      ? Math.round(Number(rawAmount) * 100)
      : undefined;
    if (amountUsdCents !== undefined && (!Number.isInteger(amountUsdCents) || amountUsdCents <= 0 || amountUsdCents > 100000000)) {
      throw new HttpsError('invalid-argument', 'montant USD invalide dans une ligne');
    }
    return {
      productId,
      quantity,
      amountUsdCents,
      playerId: trimOpt(l?.playerId, 64),
      region: trimOpt(l?.region, 40),
      optionLabel: trimOpt(l?.optionLabel, 120),
    };
  });

  try {
    const result = await placeCartOrder(getFirestore(), { uid: actor.uid, lines, idempotencyKey });
    return { ok: true, ...result };
  } catch (e) {
    throw mapDomainError(e);
  }
});
