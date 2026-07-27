import { Firestore } from 'firebase-admin/firestore';

/**
 * Garde KYC pour les dépôts LOCAUX (MonCash / NatCash).
 *
 * Règle (choix produit 2026-07-27) : le KYC devient OBLIGATOIRE dès que le CUMUL des dépôts
 * locaux DÉJÀ crédités + le dépôt courant dépasse 5000 HTG (seuil cumulé, anti-fractionnement).
 * PayPal / Binance / Crypto sont eux exigés au KYC dès le 1er HTG (géré ailleurs : firestore.rules
 * + createCryptoInvoice). Ce module ne concerne QUE le seuil cumulé des méthodes locales.
 *
 * Autorité SERVEUR : appelé avant `creditWallet` dans les 2 chemins de crédit d'un dépôt local
 * (reconcileSms pour l'auto-crédit SMS, reviewDeposit pour la validation admin). Le client a un
 * garde-fou UX symétrique, mais c'est ici que la règle est réellement imposée.
 */

/** Méthodes locales soumises au seuil KYC cumulé. */
export const LOCAL_DEPOSIT_METHODS = ['MonCash', 'NatCash'];

/** Seuil cumulé (centimes HTG) au-delà duquel le KYC est requis pour les dépôts locaux (5000 HTG). */
export const KYC_LOCAL_DEPOSIT_THRESHOLD_CENTS = 500000;

function isLocalMethod(m: unknown): boolean {
  return typeof m === 'string' && LOCAL_DEPOSIT_METHODS.includes(m);
}

/**
 * Somme (centimes) des dépôts locaux DÉJÀ crédités pour cet utilisateur.
 * Le moyen est rangé différemment selon la source du crédit :
 *   - `reviewDeposit` (admin)   → meta.method
 *   - `reconcileSms` (SMS-hook) → meta.provider
 * On accepte les deux pour ne rien rater.
 */
export async function sumCreditedLocalDepositsCents(db: Firestore, uid: string): Promise<number> {
  const snap = await db
    .collection('wallet_transactions')
    .where('uid', '==', uid)
    .where('type', '==', 'deposit')
    .get();
  let sum = 0;
  snap.forEach((d) => {
    const meta = (d.get('meta') as Record<string, unknown> | undefined) ?? {};
    if (isLocalMethod(meta.method) || isLocalMethod(meta.provider)) {
      sum += Number(d.get('amountCents') || 0);
    }
  });
  return sum;
}

/** true si l'utilisateur a un KYC approuvé. */
export async function isKycApproved(db: Firestore, uid: string): Promise<boolean> {
  const u = await db.doc(`users/${uid}`).get();
  return u.get('kycStatus') === 'approved';
}

/**
 * true si créditer ce dépôt LOCAL ferait passer le cumul > seuil ET que le KYC n'est PAS approuvé.
 * Renvoie false pour toute méthode non locale (elles ne sont pas concernées par CE seuil).
 */
export async function localDepositBlockedByKyc(
  db: Firestore,
  uid: string,
  method: unknown,
  incomingCents: number,
): Promise<boolean> {
  if (!isLocalMethod(method)) return false;
  const prior = await sumCreditedLocalDepositsCents(db, uid);
  if (prior + incomingCents <= KYC_LOCAL_DEPOSIT_THRESHOLD_CENTS) return false;
  return !(await isKycApproved(db, uid));
}
