import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { CATALOG_VARIANTS } from '../data/catalog.data';

/**
 * Sème / actualise la collection `products` (source de vérité prix + stock, invariant 3)
 * depuis le catalogue. Idempotent : `set(..., { merge: true })` par variantId.
 *
 * `setStock` (défaut true) : pose le stock initial. Passer false lors d'une re-synchro
 * catalogue pour NE PAS écraser un stock ajusté par l'admin.
 */
export async function seedCatalog(
  db: Firestore,
  opts: { setStock?: boolean } = {},
): Promise<{ written: number }> {
  const setStock = opts.setStock !== false;
  const batch = db.batch();

  for (const v of CATALOG_VARIANTS) {
    const { stock, ...rest } = v;
    const data: Record<string, unknown> = { ...rest, updatedAt: FieldValue.serverTimestamp() };
    if (setStock) data.stock = stock;
    batch.set(db.doc(`products/${v.id}`), data, { merge: true });
  }

  await batch.commit();
  return { written: CATALOG_VARIANTS.length };
}
