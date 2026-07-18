import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { requireAdmin, callOpts } from './lib/guards';
import { seedCatalog } from './lib/seed';
import { audit } from './lib/audit';

/**
 * Sème / re-synchronise la collection `products` depuis le catalogue (admin uniquement).
 * `data.setStock === false` → ne pas écraser le stock existant.
 */
export const seedProducts = onCall(callOpts, async (req) => {
  const admin = requireAdmin(req);
  const setStock = req.data?.setStock !== false;
  const db = getFirestore();
  const res = await seedCatalog(db, { setStock });
  await audit(db, { action: 'seedProducts', actorUid: admin.uid, meta: { written: res.written, setStock } });
  return { ok: true, ...res };
});
