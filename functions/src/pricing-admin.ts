import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { requireAdmin, callOpts } from './lib/guards';
import { requireStepUp } from './lib/stepup';
import { audit } from './lib/audit';
import * as reloadly from './lib/reloadly';
import * as giftaccess from './lib/giftaccess';
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

/**
 * Étiquette USD d'un montant en centimes. Les dénominations réelles ne sont PAS toujours
 * rondes ($14.99, $0.99, $9.25) : arrondir à l'entier affichait « $15 » pour une carte à
 * $14.99 et « $0 » pour une carte à $0.20.
 */
export function fmtUsdCents(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

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

/** Supprime TOUS les produits importés de Reloadly (pricing.source==='reloadly'). Permet un
 *  ré-import propre après un changement de modèle (évite les docs orphelins). Admin + step-up. */
export const clearImportedProducts = onCall({ ...callOpts, timeoutSeconds: 300 }, async (req) => {
  const admin = requireAdmin(req);
  const db = getFirestore();
  await requireStepUp(db, admin.uid);
  const snap = await db.collection('products').get();
  let batch = db.batch();
  let ops = 0;
  let deleted = 0;
  for (const d of snap.docs) {
    if ((d.data() as { pricing?: { source?: string } })?.pricing?.source === 'reloadly') {
      batch.delete(d.ref);
      deleted++;
      if (++ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
    }
  }
  if (ops > 0) await batch.commit();
  await audit(db, { action: 'clearImportedProducts', actorUid: admin.uid, meta: { deleted } });
  return { ok: true, deleted };
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
    const fees = { discountBps, fixedFeeUsdCents, feeBps };
    const priceFor = (faceUsdCents: number) => computePrice({ faceUsdCents, ...fees }, cfg).retailHtgCents;

    // UN SEUL doc par produit (`rl_{productId}`). FIXED → liste de dénominations (le client
    // choisit laquelle + la quantité). RANGE → montant libre en dollars entiers dans [min,max].
    const docId = `rl_${p.productId}`;
    let pricing: Record<string, unknown>;
    let optionLabel: string;
    let displayFaceCents: number; // dénomination servant de prix « à partir de » affiché sur la carte
    let denomPrices: { usdCents: number; priceCents: number }[] = [];

    if (p.denominationType === 'RANGE') {
      const minC = Math.round(Number(p.minRecipientDenomination) * 100);
      const maxC = Math.round(Number(p.maxRecipientDenomination) * 100);
      if (!(Number.isInteger(minC) && minC > 0 && Number.isInteger(maxC) && maxC >= minC)) continue;
      displayFaceCents = minC;
      optionLabel = `Montant libre ${fmtUsdCents(minC)}–${fmtUsdCents(maxC)}`;
      pricing = { source: 'reloadly', type: 'range', minUsdCents: minC, maxUsdCents: maxC, ...fees, reloadlyProductId: p.productId, reloadlyCountryCode: country };
    } else {
      const raw = Array.isArray(p.fixedRecipientDenominations)
        ? p.fixedRecipientDenominations
        : rangeDenoms(p.minRecipientDenomination, p.maxRecipientDenomination);
      const denomsCents = Array.from(new Set(raw.map((d: number) => Math.round(Number(d) * 100))))
        .filter((c) => Number.isInteger(c) && (c as number) > 0)
        .sort((a, b) => (a as number) - (b as number)) as number[];
      if (denomsCents.length === 0) continue;
      denomPrices = denomsCents.map((c) => ({ usdCents: c, priceCents: priceFor(c) }));
      displayFaceCents = denomsCents[0];
      optionLabel = denomsCents.length === 1
        ? fmtUsdCents(denomsCents[0])
        : `${fmtUsdCents(denomsCents[0])} – ${fmtUsdCents(denomsCents[denomsCents.length - 1])}`;
      pricing = { source: 'reloadly', type: 'fixed', denominations: denomsCents, ...fees, reloadlyProductId: p.productId, reloadlyCountryCode: country };
    }

    batch.set(
      db.doc(`products/${docId}`),
      {
        productId: docId,
        name: p.productName,
        category: 'gift-cards',
        optionLabel,
        currency: 'HTG',
        priceCents: priceFor(displayFaceCents), // prix « à partir de » (plus petite dénomination)
        stock: 999,
        available: true, // US/Global catalogué directement sur le site (retirable au cas par cas)
        image: p.logoUrls?.[0] ?? '',
        regions: country ? [country] : ['Global'],
        requiresPlayerId: false,
        deliveryTime: '1-5 Min',
        pricing,
        denomPrices, // [{usdCents, priceCents}] pour un affichage EXACT par dénomination (fixe)
        reloadlyProductId: p.productId,
        reloadlyCountryCode: country,
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

// --- 3bis. GIFT ACCESS : import catalogue (remplace la livraison manuelle) ------------------

/** Solde du wallet USD prépayé GIFT ACCESS (alerte solde bas back-office). */
export const giftaccessBalance = onCall(callOpts, async (req) => {
  requireAdmin(req);
  if (!giftaccess.isConfigured()) throw new HttpsError('failed-precondition', 'GIFT ACCESS non configuré');
  const r = await giftaccess.walletBalance();
  return { ok: true, balance: r.balance, currency: r.currency ?? 'USD', environment: r.environment ?? null };
});

/**
 * Produits GIFT ACCESS mappés aux catégories de marque thie-thie. `playerId` = top-up direct
 * (userid requis). `image` = logo local déjà bundlé. Voir mémoire giftaccess pour la genèse.
 */
const GA_PRODUCTS: Record<string, { slug: string; playerId: boolean; image: string; name: string }> = {
  '58462': { slug: 'free-fire', playerId: true, image: '/images/logos/free-fire.png', name: 'Free Fire Diamonds' },
  '97707': { slug: 'pubg', playerId: true, image: '/images/covers/pubg.webp', name: 'PUBG Mobile UC' },
  '59273': { slug: 'valorant', playerId: false, image: '/images/logos/valorant.svg', name: 'Valorant Points' },
  '63693': { slug: 'robux', playerId: false, image: '/images/logos/roblox.svg', name: 'Roblox Robux' },
  '54486': { slug: 'apple', playerId: false, image: '/images/logos/apple.svg', name: 'Apple Gift Card' },
  '47496': { slug: 'google-play', playerId: false, image: '/images/logos/google-play.svg', name: 'Google Play Gift Card' },
  '79561': { slug: 'playstation', playerId: false, image: '/images/logos/playstation.svg', name: 'PlayStation Gift Card' },
  '21875': { slug: 'xbox', playerId: false, image: '/images/logos/xbox.svg', name: 'Xbox Gift Card' },
  '96956': { slug: 'steam', playerId: false, image: '/images/logos/steam.svg', name: 'Steam Wallet' },
};

/**
 * Importe les produits GIFT ACCESS mappés → crée UN doc par dénomination (`ga_{id}__{i}`,
 * même schéma que les produits manuels : productId partagé + optionLabel + priceCents), portant
 * `supplier='giftaccess'` + `giftAccessProductId` + `giftAccessVariationId` (le fulfillment lit
 * ces champs). Puis DÉSACTIVE (available=false) les anciens produits MANUELS de ces catégories
 * (réversible). N'importe QUE les 9 produits mappés → Meru/CoD/eFootball/MobileLegends/Netflix
 * intacts.
 *
 * Coût : GIFT ACCESS renvoie le COÛT direct (variation.price). On le passe en `faceUsdCents`
 * avec discountBps=0 → wholesale = coût → marge appliquée sur le vrai coût (gère Steam coût>face).
 * RANGE (Google Play/Roblox/PlayStation) : pas de coût par palier → on SUPPOSE coût=face
 * (à vérifier via une commande test) ; la marge thie-thie fournit le tampon.
 */
export const giftaccessImportCatalog = onCall({ ...callOpts, timeoutSeconds: 300 }, async (req) => {
  const admin = requireAdmin(req);
  if (!giftaccess.isConfigured()) throw new HttpsError('failed-precondition', 'GIFT ACCESS non configuré');
  const db = getFirestore();
  await requireStepUp(db, admin.uid);

  const cfg = await getPricingConfig(db);
  const priceFor = (costUsdCents: number) => computePrice({ faceUsdCents: costUsdCents, discountBps: 0 }, cfg).retailHtgCents;

  let batch = db.batch();
  let ops = 0;
  let importedDocs = 0;
  const touchedSlugs = new Set<string>();
  const summary: Record<string, number> = {};

  for (const [gaId, m] of Object.entries(GA_PRODUCTS)) {
    let detail: any;
    try {
      detail = await giftaccess.getProduct(gaId);
    } catch (e) {
      summary[m.name] = -1; // échec fetch
      continue;
    }
    const p = detail.product ?? detail.data ?? detail;
    touchedSlugs.add(m.slug);

    // Dénominations : variations explicites (variable) OU paliers générés (range, coût supposé=face).
    type Denom = { label: string; costUsdCents: number; variationId: string | null; amountUsd: number | null; available: boolean };
    let denoms: Denom[] = [];
    const vars: any[] = Array.isArray(p.variations) ? p.variations : [];
    if (vars.length > 0) {
      denoms = vars.map((v) => ({
        label: String(v.label ?? v.name ?? ''),
        costUsdCents: Math.round(Number(v.price ?? v.amount ?? 0) * 100),
        variationId: v.id != null ? String(v.id) : null,
        amountUsd: null,
        available: v.available !== false,
      }));
    } else {
      // RANGE : paliers propres dans [min,max], coût supposé = valeur faciale.
      const faces = rangeDenoms(p.min_amount, p.max_amount);
      denoms = faces.map((usd) => ({
        label: fmtUsdCents(usd * 100),
        costUsdCents: usd * 100,
        variationId: null,
        amountUsd: usd,
        available: true,
      }));
    }
    denoms = denoms.filter((d) => d.costUsdCents > 0 && d.available);
    if (denoms.length === 0) { summary[m.name] = 0; continue; }

    const base = `ga_${gaId}`;
    let i = 0;
    for (const d of denoms) {
      const priceCents = priceFor(d.costUsdCents);
      batch.set(db.doc(`products/${base}__${i}`), {
        productId: base,
        id: `${base}__${i}`,
        name: m.name,
        optionLabel: d.label,
        category: m.slug,
        categorySlug: m.slug,
        currency: 'HTG',
        priceCents,
        costUsdCents: d.costUsdCents,
        stock: 999,
        available: true,
        image: m.image,
        regions: ['Global'],
        requiresPlayerId: m.playerId,
        deliveryTime: '1-5 Min',
        sortIndex: i,
        supplier: 'giftaccess',
        autoFulfill: true,
        giftAccessProductId: gaId,
        giftAccessVariationId: d.variationId,
        giftAccessAmountUsd: d.amountUsd,
        pricing: { source: 'giftaccess', faceUsdCents: d.costUsdCents, giftAccessProductId: gaId, giftAccessVariationId: d.variationId },
        pricedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      i++; importedDocs++;
      if (++ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
    }
    summary[m.name] = i;
  }
  if (ops > 0) { await batch.commit(); }

  // DÉSACTIVER les anciens produits MANUELS des catégories touchées (supplier != 'giftaccess').
  let disabled = 0;
  for (const slug of touchedSlugs) {
    const snap = await db.collection('products').where('category', '==', slug).get();
    let b = db.batch(); let o = 0;
    for (const doc of snap.docs) {
      if (doc.get('supplier') === 'giftaccess') continue; // ne pas toucher les nouveaux ga_
      if (doc.get('available') === false) continue;
      b.update(doc.ref, { available: false, disabledBy: 'giftaccessImport', updatedAt: new Date().toISOString() });
      disabled++;
      if (++o >= 450) { await b.commit(); b = db.batch(); o = 0; }
    }
    if (o > 0) await b.commit();
  }

  await audit(db, { action: 'giftaccessImportCatalog', actorUid: admin.uid, meta: { importedDocs, disabled, summary } });
  return { ok: true, importedDocs, disabledManual: disabled, summary };
});

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
