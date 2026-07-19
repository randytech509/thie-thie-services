import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { requireAdmin, callOpts } from './lib/guards';
import { requireStepUp } from './lib/stepup';
import { audit } from './lib/audit';
import * as reloadly from './lib/reloadly';
import {
  computePrice,
  estimateFunding as estimateFundingCore,
  PricingConfig,
  MarginMode,
  ProviderCostInput,
  FundingLine,
} from './lib/pricing';

/**
 * Back-office tarification (serveur-only). Le prix de vente HTG de chaque produit est
 * CALCULÉ ici depuis le coût fournisseur, avec la marge cible, puis écrit dans
 * `products.priceCents`. La SPA ne fait que lire ce prix (jamais recalculer — invariant 3).
 *
 * Modèle de coût par produit, stocké dans `products.{productId}.pricing` :
 *   { source: 'reloadly' | 'manual', faceUsdCents, discountBps?, fixedFeeUsdCents? }
 * Reloadly : face + remise (discountPercentage) capturés à l'import.
 * Manuel   : `faceUsdCents` = coût d'achat réel saisi par l'admin (remise déjà incluse).
 */

/** Paramètres par défaut (config/pricing absent) — cf. décisions produit 2026-07-18. */
const DEFAULT_PRICING: PricingConfig = {
  acquisitionHtgCentsPerUsd: 14200, // 142,00 HTG pour acquérir 1 USDT
  cryptoDepositBps: 100, // Reloadly : 1 % sur les dépôts crypto
  marginBps: 1500, // 15 %
  marginMode: 'margin', // VRAIE marge sur le prix de vente (÷0,85), pas un markup
  roundToHtgCents: 500, // arrondi à la hausse aux 5 HTG
};

/** Lit `config/pricing` fusionné sur les défauts, validé. */
export async function getPricingConfig(db: Firestore): Promise<PricingConfig> {
  const snap = await db.doc('config/pricing').get();
  const d = (snap.exists ? snap.data() : {}) ?? {};
  const cfg: PricingConfig = {
    acquisitionHtgCentsPerUsd: intOr(d.acquisitionHtgCentsPerUsd, DEFAULT_PRICING.acquisitionHtgCentsPerUsd),
    cryptoDepositBps: intOr(d.cryptoDepositBps, DEFAULT_PRICING.cryptoDepositBps),
    marginBps: intOr(d.marginBps, DEFAULT_PRICING.marginBps),
    marginMode: d.marginMode === 'markup' ? 'markup' : 'margin',
    roundToHtgCents: intOr(d.roundToHtgCents, DEFAULT_PRICING.roundToHtgCents),
  };
  return cfg;
}

function intOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : fallback;
}

/** Extrait le coût fournisseur d'un doc produit, ou null si aucune donnée de coût. */
function costOf(productData: Record<string, unknown>): ProviderCostInput | null {
  const p = productData.pricing as Record<string, unknown> | undefined;
  if (!p || typeof p.faceUsdCents !== 'number') return null;
  return {
    faceUsdCents: p.faceUsdCents,
    discountBps: typeof p.discountBps === 'number' ? p.discountBps : 0,
    fixedFeeUsdCents: typeof p.fixedFeeUsdCents === 'number' ? p.fixedFeeUsdCents : 0,
    feeBps: typeof p.feeBps === 'number' ? p.feeBps : 0,
  };
}

// --- 1. Config de tarification (admin + step-up) ---

export const setPricingConfig = onCall(callOpts, async (req) => {
  const admin = requireAdmin(req);
  const db = getFirestore();
  await requireStepUp(db, admin.uid);

  const d = (req.data ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString(), updatedBy: admin.uid };
  if (d.acquisitionHtgCentsPerUsd !== undefined) patch.acquisitionHtgCentsPerUsd = requireInt(d.acquisitionHtgCentsPerUsd, 'acquisitionHtgCentsPerUsd', 1);
  if (d.cryptoDepositBps !== undefined) patch.cryptoDepositBps = requireInt(d.cryptoDepositBps, 'cryptoDepositBps', 0);
  if (d.marginBps !== undefined) patch.marginBps = requireInt(d.marginBps, 'marginBps', 0);
  if (d.roundToHtgCents !== undefined) patch.roundToHtgCents = requireInt(d.roundToHtgCents, 'roundToHtgCents', 0);
  if (d.marginMode !== undefined) {
    if (d.marginMode !== 'markup' && d.marginMode !== 'margin') throw new HttpsError('invalid-argument', "marginMode ∈ {markup, margin}");
    patch.marginMode = d.marginMode as MarginMode;
  }

  await db.doc('config/pricing').set(patch, { merge: true });
  await audit(db, { action: 'setPricingConfig', actorUid: admin.uid, meta: patch });
  const cfg = await getPricingConfig(db);
  return { ok: true, config: cfg };
});

function requireInt(v: unknown, label: string, min: number): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min) throw new HttpsError('invalid-argument', `${label} : entier ≥ ${min} requis`);
  return n;
}

// --- 2. Coût manuel d'un produit (non-Reloadly) → calcule et écrit le prix ---

export const setProductCost = onCall(callOpts, async (req) => {
  const admin = requireAdmin(req);
  const db = getFirestore();
  await requireStepUp(db, admin.uid);

  const productId = String(req.data?.productId ?? '').trim();
  if (!productId) throw new HttpsError('invalid-argument', 'productId requis');
  const faceUsdCents = requireInt(req.data?.faceUsdCents, 'faceUsdCents (coût d’achat en centimes USD)', 0);
  const discountBps = req.data?.discountBps !== undefined ? requireInt(req.data.discountBps, 'discountBps', 0) : 0;
  const fixedFeeUsdCents = req.data?.fixedFeeUsdCents !== undefined ? requireInt(req.data.fixedFeeUsdCents, 'fixedFeeUsdCents', 0) : 0;

  const cfg = await getPricingConfig(db);
  const cost: ProviderCostInput = { faceUsdCents, discountBps, fixedFeeUsdCents };
  const b = computePrice(cost, cfg);

  const patch: Record<string, unknown> = {
    pricing: { source: 'manual', faceUsdCents, discountBps, fixedFeeUsdCents },
    priceCents: b.retailHtgCents,
    costHtgCents: b.costHtgCents,
    marginHtgCents: b.marginHtgCents,
    pricedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Si un nom est fourni → produit AFFICHABLE (carte cadeau visible dans la catégorie Cartes
  // cadeaux). Sinon on ne fait que (re)tarifer un produit existant (ex. variante seedée).
  const name = req.data?.name ? String(req.data.name).slice(0, 100) : undefined;
  if (name) {
    patch.name = name;
    patch.category = req.data?.category ? String(req.data.category).slice(0, 50) : 'gift-cards';
    patch.image = req.data?.image ? String(req.data.image).slice(0, 1000) : '';
    patch.optionLabel = req.data?.optionLabel ? String(req.data.optionLabel).slice(0, 50) : `$${(faceUsdCents / 100).toFixed(2)}`;
    patch.currency = 'HTG';
    patch.available = req.data?.available !== false;
    patch.stock = 999;
    patch.deliveryTime = '1-5 Min';
    patch.regions = ['Global'];
    patch.requiresPlayerId = false;
  }

  await db.doc(`products/${productId}`).set(patch, { merge: true });
  await audit(db, { action: 'setProductCost', actorUid: admin.uid, meta: { productId, faceUsdCents, priceCents: b.retailHtgCents, displayable: !!name } });
  return { ok: true, breakdown: b };
});

// --- 2bis. Stock / disponibilité / prix direct d'un produit (back-office) ---

/**
 * Met à jour le STOCK, la DISPONIBILITÉ et/ou le PRIX de vente direct d'un produit.
 * Sert au back-office « Produits manuels » (stock réel, retrait de la vente, ajustement de prix).
 * `priceCents` écrase le prix calculé (override admin assumé, produits manuels surtout).
 */
export const setProductInventory = onCall(callOpts, async (req) => {
  const admin = requireAdmin(req);
  const db = getFirestore();
  await requireStepUp(db, admin.uid);
  const productId = String(req.data?.productId ?? '').trim();
  if (!productId) throw new HttpsError('invalid-argument', 'productId requis');
  const ref = db.doc(`products/${productId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'produit introuvable');

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (req.data?.stock !== undefined) patch.stock = requireInt(req.data.stock, 'stock', 0);
  if (req.data?.available !== undefined) patch.available = req.data.available === true;
  if (req.data?.priceCents !== undefined) patch.priceCents = requireInt(req.data.priceCents, 'priceCents', 0);
  if (Object.keys(patch).length === 1) throw new HttpsError('invalid-argument', 'aucun champ à modifier');

  await ref.set(patch, { merge: true });
  await audit(db, { action: 'setProductInventory', actorUid: admin.uid, meta: { productId, ...patch } });
  return { ok: true };
});

/** Supprime un produit du catalogue (back-office). Réservé admin + step-up. */
export const deleteProduct = onCall(callOpts, async (req) => {
  const admin = requireAdmin(req);
  const db = getFirestore();
  await requireStepUp(db, admin.uid);
  const productId = String(req.data?.productId ?? '').trim();
  if (!productId) throw new HttpsError('invalid-argument', 'productId requis');
  await db.doc(`products/${productId}`).delete();
  await audit(db, { action: 'deleteProduct', actorUid: admin.uid, meta: { productId } });
  return { ok: true };
});

// --- 3. Import Reloadly (page par page, idempotent) → produits + prix calculés ---

/**
 * Importe UNE page du catalogue Reloadly. « Importer tout » = boucler tant que `nextPage`
 * n'est pas null. Les produits sont écrits `available: false` (à curer avant publication) :
 * on ne veut pas 5000+ cartes de tous pays visibles d'un coup. Idempotent : doc id déterministe
 * `rl_{productId}_{denominationCents}`.
 */
export const reloadlyImportCatalog = onCall({ ...callOpts, timeoutSeconds: 300 }, async (req) => {
  const admin = requireAdmin(req);
  if (!reloadly.isConfigured()) throw new HttpsError('failed-precondition', 'Reloadly non configuré');
  const db = getFirestore();
  await requireStepUp(db, admin.uid);

  const page = requireInt(req.data?.page ?? 1, 'page', 1);
  const size = Math.min(200, Math.max(1, Number(req.data?.size ?? 200)));
  const countryFilter = req.data?.countryCode ? String(req.data.countryCode).toUpperCase() : null;

  const cfg = await getPricingConfig(db);
  const r = await reloadly.getProducts(page, size);
  const content: any[] = r.content ?? [];

  let batch = db.batch();
  let ops = 0;
  let imported = 0;

  for (const p of content) {
    const country = p.country?.isoName ?? null;
    const isGlobal = p.global === true || country === null;
    // Par défaut : on ne catalogue que le US + les cartes Global (marché haïtien, réglées en USD).
    // Un countryFilter explicite (ex. 'US') restreint à ce seul pays.
    const keep = countryFilter ? country === countryFilter : (country === 'US' || isGlobal);
    if (!keep) continue;
    // Seules les devises USD sont directement tarifables sans FX interne Reloadly.
    if (p.recipientCurrencyCode && p.recipientCurrencyCode !== 'USD') continue;

    // Frais Reloadly RÉELS (sinon sous-marge) : remise revendeur, frais fixe, frais en %.
    const discountBps = Math.round((p.discountPercentage ?? 0) * 100);
    const fixedFeeUsdCents = Math.round((p.senderFee ?? 0) * 100);
    const feeBps = Math.round((p.senderFeePercentage ?? 0) * 100);
    // Entrées à écrire : une carte à MONTANT LIBRE si RANGE ; sinon une carte par dénomination FIXE.
    type Entry = { docId: string; faceUsdCents: number; optionLabel: string; pricing: Record<string, unknown> };
    const baseFees = { discountBps, fixedFeeUsdCents, feeBps, reloadlyProductId: p.productId, reloadlyCountryCode: country };
    const entries: Entry[] = [];
    if (p.denominationType === 'RANGE') {
      const minC = Math.round(Number(p.minRecipientDenomination) * 100);
      const maxC = Math.round(Number(p.maxRecipientDenomination) * 100);
      if (Number.isInteger(minC) && minC > 0 && Number.isInteger(maxC) && maxC >= minC) {
        entries.push({
          docId: `rl_${p.productId}_range`,
          faceUsdCents: minC, // le prix AFFICHÉ est celui du minimum ; le client choisit ensuite son montant
          optionLabel: `Montant libre $${(minC / 100).toFixed(0)}–$${(maxC / 100).toFixed(0)}`,
          pricing: { source: 'reloadly', type: 'range', minUsdCents: minC, maxUsdCents: maxC, ...baseFees },
        });
      }
    } else {
      const denoms = Array.isArray(p.fixedRecipientDenominations)
        ? p.fixedRecipientDenominations
        : rangeDenoms(p.minRecipientDenomination, p.maxRecipientDenomination);
      for (const face of denoms) {
        const faceUsdCents = Math.round(Number(face) * 100);
        if (!Number.isInteger(faceUsdCents) || faceUsdCents <= 0) continue;
        entries.push({
          docId: `rl_${p.productId}_${faceUsdCents}`,
          faceUsdCents,
          optionLabel: `$${(faceUsdCents / 100).toFixed(2)}`,
          pricing: { source: 'reloadly', faceUsdCents, ...baseFees },
        });
      }
    }

    for (const e of entries) {
      const b = computePrice({ faceUsdCents: e.faceUsdCents, discountBps, fixedFeeUsdCents, feeBps }, cfg);
      batch.set(
        db.doc(`products/${e.docId}`),
        {
          productId: e.docId,
          name: p.productName,
          category: 'gift-cards',
          optionLabel: e.optionLabel,
          currency: 'HTG',
          priceCents: b.retailHtgCents,
          costHtgCents: b.costHtgCents,
          marginHtgCents: b.marginHtgCents,
          stock: 999,
          available: true, // US/Global catalogué directement sur le site (retirable au cas par cas)
          image: p.logoUrls?.[0] ?? '',
          regions: country ? [country] : ['Global'],
          requiresPlayerId: false,
          deliveryTime: '1-5 Min',
          pricing: e.pricing,
          reloadlyProductId: p.productId,
          reloadlyCountryCode: country,
          reloadlyUnitPrice: e.faceUsdCents / 100,
          pricedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      imported++;
      if (++ops >= 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
  }
  if (ops > 0) await batch.commit();

  const totalPages = r.totalPages ?? 1;
  const nextPage = page < totalPages ? page + 1 : null;
  await audit(db, { action: 'reloadlyImportCatalog', actorUid: admin.uid, meta: { page, imported, nextPage } });
  return { ok: true, page, imported, totalPages, nextPage };
});

/** Génère des paliers pour un produit RANGE (min→max) : arrondis « propres » usuels. */
function rangeDenoms(min: unknown, max: unknown): number[] {
  const lo = Number(min), hi = Number(max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return [];
  const paliers = [5, 10, 25, 50, 100, 200, 500].filter((v) => v >= lo && v <= hi);
  return paliers.length ? paliers : [Math.round(lo)];
}

// --- 4. Re-tarification en masse (après changement de FX/marge/frais) ---

export const repriceAll = onCall({ ...callOpts, timeoutSeconds: 300 }, async (req) => {
  const admin = requireAdmin(req);
  const db = getFirestore();
  await requireStepUp(db, admin.uid);
  const cfg = await getPricingConfig(db);

  const snap = await db.collection('products').get();
  let batch = db.batch();
  let ops = 0;
  let repriced = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const cost = costOf(doc.data());
    if (!cost) {
      skipped++;
      continue;
    }
    const b = computePrice(cost, cfg);
    batch.set(doc.ref, { priceCents: b.retailHtgCents, costHtgCents: b.costHtgCents, marginHtgCents: b.marginHtgCents, pricedAt: new Date().toISOString() }, { merge: true });
    repriced++;
    if (++ops >= 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();

  await audit(db, { action: 'repriceAll', actorUid: admin.uid, meta: { repriced, skipped } });
  return { ok: true, repriced, skipped };
});

// --- 5. Estimation du float USDT à déposer chez les fournisseurs ---

/**
 * Estime l'USDT initial à déposer pour couvrir un stock cible, le capital HTG à mobiliser,
 * et le CA/marge potentiels. `qtyPerProduct` (défaut 1) s'applique à chaque produit ayant
 * un coût. Ventilé par fournisseur (reloadly / manual).
 */
export const estimateFunding = onCall(callOpts, async (req) => {
  requireAdmin(req);
  const db = getFirestore();
  const cfg = await getPricingConfig(db);
  const qty = Math.max(1, Number(req.data?.qtyPerProduct ?? 1));
  const availableOnly = req.data?.availableOnly === true;

  const snap = await db.collection('products').get();
  const bySource: Record<string, FundingLine[]> = {};
  for (const doc of snap.docs) {
    const data = doc.data();
    if (availableOnly && data.available !== true) continue;
    const cost = costOf(data);
    if (!cost) continue;
    const source = String((data.pricing as any)?.source ?? 'manual');
    (bySource[source] ??= []).push({ cost, qty });
  }

  const perProvider = Object.fromEntries(
    Object.entries(bySource).map(([source, lines]) => [source, estimateFundingCore(lines, cfg)]),
  );
  const all = estimateFundingCore(Object.values(bySource).flat(), cfg);

  return {
    ok: true,
    qtyPerProduct: qty,
    config: cfg,
    perProvider,
    total: all,
    // Confort de lecture (unités entières)
    human: {
      usdtToDeposit: (all.usdtToDepositUsdCents / 100).toFixed(2),
      htgCapital: Math.round(all.htgCapitalCents / 100),
      potentialRevenueHtg: Math.round(all.retailHtgCents / 100),
      projectedMarginHtg: Math.round(all.projectedMarginHtgCents / 100),
    },
  };
});
