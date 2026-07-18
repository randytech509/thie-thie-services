import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { requireAdmin, callOpts } from './lib/guards';
import { requireStepUp } from './lib/stepup';
import { audit } from './lib/audit';

/** Envoi d'une notification push à TOUS les utilisateurs abonnés (admin + step-up). */
export const sendBroadcastPush = onCall(callOpts, async (req) => {
  const admin = requireAdmin(req);
  const db = getFirestore();
  await requireStepUp(db, admin.uid);

  const title = String(req.data?.title ?? '').trim();
  const body = String(req.data?.body ?? '').trim();
  const imageUrl = String(req.data?.imageUrl ?? '').trim();
  const url = String(req.data?.url ?? '').trim();
  if (!title || !body) throw new HttpsError('invalid-argument', 'Titre et corps requis');

  const usersSnap = await db.collection('users').get();
  const tokenSet = new Set<string>();
  usersSnap.forEach((u) => {
    const t = u.get('fcmTokens');
    if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && tokenSet.add(x));
  });
  const tokens = [...tokenSet];
  if (tokens.length === 0) return { ok: true, sent: 0, failed: 0, tokens: 0 };

  const messaging = getMessaging();
  let sent = 0, failed = 0;
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const res = await messaging.sendEachForMulticast({
      tokens: batch,
      webpush: {
        notification: { title, body, ...(imageUrl ? { image: imageUrl } : {}) },
        ...(url ? { fcmOptions: { link: url } } : {}),
      },
      ...(url ? { data: { url } } : {}),
    });
    sent += res.successCount;
    failed += res.failureCount;
  }
  await audit(db, { action: 'sendBroadcastPush', actorUid: admin.uid, meta: { title, sent, failed, tokens: tokens.length } });
  return { ok: true, sent, failed, tokens: tokens.length };
});

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);

/** Crée/met à jour une page promo HTML (admin + step-up). Rendue publiquement en iframe sandbox. */
export const savePromo = onCall(callOpts, async (req) => {
  const admin = requireAdmin(req);
  const db = getFirestore();
  await requireStepUp(db, admin.uid);

  const id = String(req.data?.id ?? '').trim();
  const title = String(req.data?.title ?? '').trim();
  const html = String(req.data?.html ?? '');
  const published = req.data?.published === true;
  if (!title) throw new HttpsError('invalid-argument', 'Titre requis');
  if (html.length > 200_000) throw new HttpsError('invalid-argument', 'HTML trop volumineux (200 Ko max)');

  const ref = id ? db.doc(`promos/${id}`) : db.collection('promos').doc();
  const slug = slugify(title) || ref.id;
  await ref.set(
    { title, html, published, slug, updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid, ...(id ? {} : { createdAt: FieldValue.serverTimestamp() }) },
    { merge: true },
  );
  await audit(db, { action: 'savePromo', actorUid: admin.uid, meta: { id: ref.id, published } });
  return { ok: true, id: ref.id, slug };
});

export const deletePromo = onCall(callOpts, async (req) => {
  const admin = requireAdmin(req);
  const db = getFirestore();
  await requireStepUp(db, admin.uid);
  const id = String(req.data?.id ?? '').trim();
  if (!id) throw new HttpsError('invalid-argument', 'id requis');
  await db.doc(`promos/${id}`).delete();
  await audit(db, { action: 'deletePromo', actorUid: admin.uid, meta: { id } });
  return { ok: true };
});
