import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { requireAdmin, callOpts } from './lib/guards';
import { requireStepUp } from './lib/stepup';
import { audit } from './lib/audit';
import * as reloadly from './lib/reloadly';
import { RELOADLY_SECRETS } from './lib/secrets';

/** Solde du compte fournisseur Reloadly (back-office). */
export const reloadlyBalance = onCall({ ...callOpts, secrets: RELOADLY_SECRETS }, async (req) => {
  requireAdmin(req);
  if (!reloadly.isConfigured()) return { configured: false };
  const b = await reloadly.getBalance();
  return { configured: true, ...b };
});

/** Recherche de produits Reloadly (pour mapper à un produit du catalogue). */
export const reloadlyFindProducts = onCall({ ...callOpts, secrets: RELOADLY_SECRETS }, async (req) => {
  requireAdmin(req);
  if (!reloadly.isConfigured()) throw new HttpsError('failed-precondition', 'Reloadly non configuré');
  const query = String(req.data?.query ?? '').trim();
  const r = await reloadly.getProducts(1, 20, query || undefined);
  const products = (r.content ?? []).map((p: any) => ({
    productId: p.productId,
    productName: p.productName,
    denominationType: p.denominationType,
    fixedRecipientDenominations: p.fixedRecipientDenominations ?? null,
    minRecipientDenomination: p.minRecipientDenomination ?? null,
    maxRecipientDenomination: p.maxRecipientDenomination ?? null,
    recipientCurrencyCode: p.recipientCurrencyCode,
    countryCode: p.country?.isoName ?? null,
    discountPercentage: p.discountPercentage ?? 0,
  }));
  return { total: r.totalElements ?? products.length, products };
});

/** Mappe un produit du catalogue à un produit Reloadly (+ active/désactive l'auto-fulfilment). */
export const setProductSupplier = onCall(callOpts, async (req) => {
  const admin = requireAdmin(req);
  const db = getFirestore();
  await requireStepUp(db, admin.uid);
  const productId = String(req.data?.productId ?? '').trim();
  if (!productId) throw new HttpsError('invalid-argument', 'productId (catalogue) requis');

  const rid = req.data?.reloadlyProductId;
  const patch: Record<string, unknown> = {
    reloadlyProductId: rid ? Number(rid) : FieldValue.delete(),
    reloadlyCountryCode: req.data?.reloadlyCountryCode ? String(req.data.reloadlyCountryCode) : FieldValue.delete(),
    reloadlyUnitPrice: req.data?.reloadlyUnitPrice ? Number(req.data.reloadlyUnitPrice) : FieldValue.delete(),
    autoFulfill: req.data?.autoFulfill === true,
    updatedAt: new Date().toISOString(),
  };
  await db.doc(`products/${productId}`).set(patch, { merge: true });
  await audit(db, { action: 'setProductSupplier', actorUid: admin.uid, meta: { productId, reloadlyProductId: rid ?? null, autoFulfill: patch.autoFulfill } });
  return { ok: true };
});
