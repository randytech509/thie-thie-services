/**
 * Monnaie = centimes HTG entiers, source unique (invariant 4).
 * Jamais de float pour un solde ou un prix. Le wallet est en HTG.
 * La conversion FX ne s'applique QU'À l'achat de biens libellés en USD (gift cards).
 *
 * Ce module est dupliqué à l'identique côté SPA (`src/lib/money.ts`) — garder les deux
 * en phase (logique pure, sans dépendance) pour que front et backend calculent pareil.
 */

export type Cents = number; // entier ≥ 0 attendu pour un solde

export class MoneyError extends Error {}

/** Garantit un entier fini (centimes). Lève sinon — aucune tolérance au float. */
export function assertCents(n: unknown, label = 'montant'): asserts n is number {
  if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isInteger(n)) {
    throw new MoneyError(`${label} invalide: centimes entiers requis (reçu ${String(n)})`);
  }
  if (!Number.isSafeInteger(n)) {
    throw new MoneyError(`${label} hors plage entière sûre`);
  }
}

/** HTG (unité) → centimes. À n'utiliser qu'aux frontières (saisie utilisateur, affichage). */
export function htgToCents(htg: number): Cents {
  if (typeof htg !== 'number' || !Number.isFinite(htg)) {
    throw new MoneyError(`HTG invalide: ${String(htg)}`);
  }
  return Math.round(htg * 100);
}

/** Centimes → HTG (unité), pour affichage uniquement. */
export function centsToHtg(c: Cents): number {
  assertCents(c, 'centimes');
  return c / 100;
}

export function addCents(a: Cents, b: Cents): Cents {
  assertCents(a, 'a');
  assertCents(b, 'b');
  const r = a + b;
  assertCents(r, 'somme');
  return r;
}

export function subCents(a: Cents, b: Cents): Cents {
  assertCents(a, 'a');
  assertCents(b, 'b');
  const r = a - b;
  assertCents(r, 'différence');
  return r;
}

/**
 * Convertit un prix libellé en USD (en centimes USD) vers des centimes HTG, au taux FX.
 * `htgCentsPerUsd` = combien de centimes HTG vaut 1 USD (entier, stocké dans /config/fx).
 * Ex: 1 USD = 132.50 HTG → htgCentsPerUsd = 13250.
 */
export function usdCentsToHtgCents(usdCents: Cents, htgCentsPerUsd: number): Cents {
  assertCents(usdCents, 'usdCents');
  assertCents(htgCentsPerUsd, 'htgCentsPerUsd');
  if (htgCentsPerUsd <= 0) throw new MoneyError('taux FX invalide (≤ 0)');
  // usdCents/100 (USD) * htgCentsPerUsd (centimes HTG / USD) = centimes HTG
  return Math.round((usdCents * htgCentsPerUsd) / 100);
}
