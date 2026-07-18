/**
 * Monnaie = centimes HTG entiers, source unique (invariant 4).
 * MIROIR de `functions/src/lib/money.ts` — garder les deux strictement en phase
 * (logique pure) pour que SPA et backend calculent à l'identique.
 * Le client n'écrit JAMAIS un solde : ces helpers servent à l'affichage et à la saisie.
 */

export type Cents = number;

export class MoneyError extends Error {}

export function assertCents(n: unknown, label = 'montant'): asserts n is number {
  if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isInteger(n)) {
    throw new MoneyError(`${label} invalide: centimes entiers requis (reçu ${String(n)})`);
  }
  if (!Number.isSafeInteger(n)) {
    throw new MoneyError(`${label} hors plage entière sûre`);
  }
}

export function htgToCents(htg: number): Cents {
  if (typeof htg !== 'number' || !Number.isFinite(htg)) {
    throw new MoneyError(`HTG invalide: ${String(htg)}`);
  }
  return Math.round(htg * 100);
}

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

/** Affichage localisé d'un solde en centimes HTG → ex. "1 234,50 HTG". */
export function formatHtg(cents: Cents, lang: 'FR' | 'HT' = 'FR'): string {
  assertCents(cents, 'centimes');
  const value = centsToHtg(cents);
  const locale = lang === 'FR' ? 'fr-FR' : 'fr-HT';
  return `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} HTG`;
}
