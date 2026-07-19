/**
 * Moteur de tarification fournisseur → prix de vente HTG (invariant 4 : centimes entiers).
 *
 * Chaîne de coût (par unité), de la valeur faciale fournisseur au prix client :
 *
 *   faceUSD            valeur reçue par le client (dénomination Reloadly, devise de règlement USD)
 *   − remise (discount) remise revendeur accordée par le fournisseur (Reloadly `discountPercentage`)
 *   + frais fixes       `senderFee` éventuel par transaction
 *   = wholesaleUSD      coût réel d'acquisition du bien chez le fournisseur
 *   × (1 + cryptoFee)   Reloadly prélève 1 % sur les dépôts crypto (recharge du solde en USDT)
 *   = usdtSpentUSD      USDT réellement dépensé pour disposer du solde fournisseur
 *   × acqRateHTG        taux d'acquisition d'1 USDT en gourdes (~142 HTG)
 *   = costHTG           coût de revient en gourdes
 *   × marge / ÷ marge   marge commerciale (15 %) — cf. marginMode
 *   → retailHTG         prix de vente affiché (arrondi à la hausse)
 *
 * Ce module est PUR (aucune I/O) et backend-only : le prix de vente est écrit dans
 * `products.priceCents` par l'auto-listing, la SPA ne fait que le lire (jamais recalculer).
 * Les paramètres (taux d'acquisition, frais crypto, marge) vivent dans `config/pricing`
 * (serveur-only, éditable admin — comme `config/fx`) et sont passés ici via `PricingConfig`.
 */

export class PricingError extends Error {}

/** Comment appliquer la marge : */
export type MarginMode =
  | 'markup' // marge SUR LE COÛT : retail = cost × (1 + m). 15 % → ×1.15
  | 'margin'; // marge SUR LE PRIX DE VENTE : retail = cost ÷ (1 − m). 15 % → ÷0.85

export interface PricingConfig {
  /** Centimes HTG pour acquérir 1 USD(T). Ex : 142,00 HTG → 14200. */
  acquisitionHtgCentsPerUsd: number;
  /** Frais de dépôt crypto du fournisseur, en points de base. Ex : 1 % → 100. */
  cryptoDepositBps: number;
  /** Marge commerciale, en points de base. Ex : 15 % → 1500. */
  marginBps: number;
  /** Interprétation de la marge (markup sur coût vs marge sur prix de vente). */
  marginMode: MarginMode;
  /** Granularité d'arrondi à la hausse du prix final, en centimes HTG. Ex : arrondi aux 5 HTG → 500. 0/1 = pas d'arrondi. */
  roundToHtgCents: number;
}

export interface ProviderCostInput {
  /** Valeur faciale en centimes USD (devise de règlement). Ex : carte $10 → 1000. */
  faceUsdCents: number;
  /** Remise revendeur accordée par le fournisseur, en points de base. Ex : −2 % → 200. Défaut 0 (prix « fixe »). */
  discountBps?: number;
  /** Frais fixes fournisseur par unité, en centimes USD (Reloadly `senderFee`). Défaut 0. */
  fixedFeeUsdCents?: number;
  /** Frais fournisseur EN POURCENTAGE de la face, en points de base (Reloadly `senderFeePercentage`).
   *  Ex : Netflix 8 % → 800. AJOUTÉ au coût. Défaut 0. Ignorer ce champ sous-marge le produit. */
  feeBps?: number;
}

export interface PriceBreakdown {
  faceUsdCents: number;
  /** Coût fournisseur après remise + frais fixes (centimes USD). */
  wholesaleUsdCents: number;
  /** USDT dépensé après frais de dépôt crypto (centimes USD). */
  usdtSpentUsdCents: number;
  /** Coût de revient en centimes HTG. */
  costHtgCents: number;
  /** Prix de vente final en centimes HTG (arrondi à la hausse). */
  retailHtgCents: number;
  /** Profit brut = retail − coût (centimes HTG). */
  marginHtgCents: number;
  /** Marge réalisée rapportée au prix de vente, en points de base (contrôle). */
  effectiveMarginBps: number;
}

function assertPositiveInt(n: unknown, label: string): asserts n is number {
  if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new PricingError(`${label} invalide : entier ≥ 0 requis (reçu ${String(n)})`);
  }
}

function roundUpTo(cents: number, granularity: number): number {
  if (granularity <= 1) return Math.ceil(cents);
  return Math.ceil(cents / granularity) * granularity;
}

/** Calcule le prix de vente HTG et la décomposition complète du coût pour un article fournisseur. */
export function computePrice(cost: ProviderCostInput, cfg: PricingConfig): PriceBreakdown {
  assertPositiveInt(cost.faceUsdCents, 'faceUsdCents');
  assertPositiveInt(cfg.acquisitionHtgCentsPerUsd, 'acquisitionHtgCentsPerUsd');
  assertPositiveInt(cfg.cryptoDepositBps, 'cryptoDepositBps');
  assertPositiveInt(cfg.marginBps, 'marginBps');
  if (cfg.acquisitionHtgCentsPerUsd <= 0) throw new PricingError('taux d’acquisition ≤ 0');
  if (cfg.marginMode === 'margin' && cfg.marginBps >= 10000) {
    throw new PricingError('marge sur prix de vente ≥ 100 % impossible');
  }

  const discountBps = cost.discountBps ?? 0;
  const fixedFeeUsdCents = cost.fixedFeeUsdCents ?? 0;
  const feeBps = cost.feeBps ?? 0;
  assertPositiveInt(discountBps, 'discountBps');
  assertPositiveInt(fixedFeeUsdCents, 'fixedFeeUsdCents');
  assertPositiveInt(feeBps, 'feeBps');
  if (discountBps >= 10000) throw new PricingError('remise ≥ 100 % impossible');

  // 1. Coût fournisseur = face − remise revendeur + frais fixes + frais en % (senderFeePercentage).
  //    Ex Netflix US : face 5000 + 8 % (feeBps 800) = 5400. Ignorer feeBps sous-marge le produit.
  const wholesaleUsdCents =
    (cost.faceUsdCents * (10000 - discountBps)) / 10000 +
    fixedFeeUsdCents +
    (cost.faceUsdCents * feeBps) / 10000;

  // 2. Frais de dépôt crypto (USDT) pour recharger le solde fournisseur.
  const usdtSpentUsdCents = wholesaleUsdCents * (10000 + cfg.cryptoDepositBps) / 10000;

  // 3. Conversion en gourdes au taux d'acquisition de l'USDT.
  //    usdCents/100 (USD) × htgCentsPerUsd (centimes HTG / USD) = centimes HTG.
  const costHtgCents = (usdtSpentUsdCents * cfg.acquisitionHtgCentsPerUsd) / 100;

  // 4. Marge commerciale.
  const retailRaw =
    cfg.marginMode === 'markup'
      ? costHtgCents * (10000 + cfg.marginBps) / 10000
      : costHtgCents / ((10000 - cfg.marginBps) / 10000);

  const retailHtgCents = roundUpTo(retailRaw, cfg.roundToHtgCents || 1);
  const costRounded = Math.round(costHtgCents);
  const marginHtgCents = retailHtgCents - costRounded;
  const effectiveMarginBps = retailHtgCents > 0 ? Math.round((marginHtgCents / retailHtgCents) * 10000) : 0;

  return {
    faceUsdCents: cost.faceUsdCents,
    wholesaleUsdCents: Math.round(wholesaleUsdCents),
    usdtSpentUsdCents: Math.round(usdtSpentUsdCents),
    costHtgCents: costRounded,
    retailHtgCents,
    marginHtgCents,
    effectiveMarginBps,
  };
}

export interface FundingLine {
  cost: ProviderCostInput;
  /** Quantité à pré-stocker pour cet article. */
  qty: number;
}

export interface FundingEstimate {
  /** Coût fournisseur total à approvisionner (centimes USD, hors frais crypto). */
  wholesaleUsdCents: number;
  /** USDT total à déposer (centimes USD, frais crypto inclus). */
  usdtToDepositUsdCents: number;
  /** Capital en gourdes à mobiliser pour acheter cet USDT (centimes HTG). */
  htgCapitalCents: number;
  /** Prix de vente cumulé du stock (centimes HTG) — chiffre d'affaires potentiel. */
  retailHtgCents: number;
  /** Profit brut potentiel (centimes HTG). */
  projectedMarginHtgCents: number;
}

/**
 * Estime l'USDT initial à déposer chez un fournisseur pour couvrir un stock donné,
 * plus le capital HTG correspondant et le CA/marge potentiels une fois vendu.
 */
export function estimateFunding(lines: FundingLine[], cfg: PricingConfig): FundingEstimate {
  let wholesaleUsdCents = 0;
  let usdtToDepositUsdCents = 0;
  let htgCapitalCents = 0;
  let retailHtgCents = 0;
  let projectedMarginHtgCents = 0;

  for (const line of lines) {
    assertPositiveInt(line.qty, 'qty');
    const b = computePrice(line.cost, cfg);
    wholesaleUsdCents += b.wholesaleUsdCents * line.qty;
    usdtToDepositUsdCents += b.usdtSpentUsdCents * line.qty;
    htgCapitalCents += b.costHtgCents * line.qty;
    retailHtgCents += b.retailHtgCents * line.qty;
    projectedMarginHtgCents += b.marginHtgCents * line.qty;
  }

  return {
    wholesaleUsdCents: Math.round(wholesaleUsdCents),
    usdtToDepositUsdCents: Math.round(usdtToDepositUsdCents),
    htgCapitalCents: Math.round(htgCapitalCents),
    retailHtgCents: Math.round(retailHtgCents),
    projectedMarginHtgCents: Math.round(projectedMarginHtgCents),
  };
}
