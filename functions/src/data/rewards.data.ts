/**
 * Catalogue des récompenses fidélité — SOURCE DE VÉRITÉ SERVEUR (invariant 2/3).
 * Le coût en points et le code ne sont JAMAIS lus depuis le client (sinon coupons gratuits).
 * Doit rester synchronisé avec `AVAILABLE_REWARDS` de la SPA (App.tsx).
 */
export interface RewardDef {
  id: string;
  cost: number; // coût en points Thie Thie
  code: string;
  titleFR: string;
  titleHT: string;
}

export const REWARDS: RewardDef[] = [
  { id: 'promo10', cost: 100, code: 'THIE10', titleFR: '10% de réduction', titleHT: '10% rabè' },
  { id: 'freeship', cost: 200, code: 'THIEFREE', titleFR: 'Livraison Gratuite', titleHT: 'Livrezon Gratis' },
  { id: 'promo25', cost: 500, code: 'THIE25', titleFR: '25% de réduction', titleHT: '25% rabè' },
  { id: 'voucher10', cost: 1000, code: 'THIEV10', titleFR: "Bon d'achat de $10", titleHT: 'Kado $10 USD' },
];

export const REWARD_BY_ID = new Map<string, RewardDef>(REWARDS.map((r) => [r.id, r]));

/** Points fidélité gagnés pour un achat : ~ priceUSD × 10 = totalCents / 1450 (priceCents = priceUSD × 14500). */
export function pointsForOrder(totalCents: number): number {
  return Math.round(totalCents / 1450);
}
