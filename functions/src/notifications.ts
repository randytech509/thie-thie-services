import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

/**
 * Notifications (push FCM + centre d'activités in-app déjà existant dans le profil) sur les
 * 3 événements serveur qui comptent pour un client : dépôt crédité, commande livrée, KYC statué.
 * Déclenchées en réaction aux écritures Firestore déjà faites par transactions.ts/kyc.ts —
 * AUCUNE modification de ce code déjà testé, ces triggers sont indépendants et best-effort
 * (une erreur d'envoi ne doit jamais faire échouer la transaction financière qui l'a précédée).
 */

interface NotificationContent {
  title: string;
  body: string;
}

/** Écrit l'entrée dans `notifications` (lue par le centre d'activités du profil) + pousse en FCM. */
async function notifyUser(uid: string, content: NotificationContent, data?: Record<string, string>) {
  const db = getFirestore();

  // 1) Centre d'activités in-app (même forme que l'écriture cliente existante).
  const notifId = 'NOTIF-' + Math.floor(100000 + Math.random() * 900000);
  await db.doc(`notifications/${notifId}`).set({
    notificationId: notifId,
    uid,
    title: content.title,
    message: content.body,
    read: false,
    createdAt: new Date().toISOString(),
  });

  // 2) Push FCM — best-effort, silencieux si l'utilisateur n'a jamais activé les notifications.
  try {
    const userSnap = await db.doc(`users/${uid}`).get();
    const tokens = (userSnap.get('fcmTokens') as string[] | undefined) ?? [];
    if (tokens.length === 0) return;

    const res = await getMessaging().sendEachForMulticast({
      tokens,
      notification: content,
      data,
      webpush: { fcmOptions: { link: '/' } },
    });

    // Nettoyage des jetons expirés/désinstallés pour ne pas les retenter indéfiniment.
    const invalidTokens = res.responses
      .map((r, i) => (!r.success && isUnregisteredError(r.error?.code) ? tokens[i] : null))
      .filter((t): t is string => t !== null);
    if (invalidTokens.length > 0) {
      await db.doc(`users/${uid}`).update({ fcmTokens: FieldValue.arrayRemove(...invalidTokens) });
    }
  } catch (e) {
    logger.warn('notifyUser: échec envoi FCM (non bloquant)', { uid, error: (e as Error).message });
  }
}

function isUnregisteredError(code?: string): boolean {
  return code === 'messaging/invalid-registration-token' || code === 'messaging/registration-token-not-registered';
}

/** Dépôt crédité (MonCash/NatCash/Crypto, manuel ou auto-réconcilié — tous passent par creditWallet). */
export const notifyDepositCredited = onDocumentCreated('wallet_transactions/{txId}', async (event) => {
  const tx = event.data?.data();
  if (!tx || tx.direction !== 'credit' || tx.type !== 'deposit') return;

  const uid = tx.uid as string;
  const htg = ((tx.amountCents as number) / 100).toLocaleString('fr-FR');
  await notifyUser(uid, {
    title: 'Dépôt confirmé',
    body: `Votre dépôt de ${htg} HTG a été crédité sur votre wallet.`,
  }, { type: 'deposit' });
});

/** Commande livrée (placeOrder crée directement la commande au statut "completed"). */
export const notifyOrderCompleted = onDocumentCreated('orders/{orderId}', async (event) => {
  const order = event.data?.data();
  if (!order) return;

  const uid = (order.uid ?? order.userId) as string;
  const productName = (order.productName as string) || 'Votre commande';
  await notifyUser(uid, {
    title: 'Commande livrée',
    body: `${productName} a été livré avec succès.`,
  }, { type: 'order', orderId: event.params.orderId });
});

/** KYC approuvé/refusé (reviewKyc fait transiter kyc_requests.status). */
export const notifyKycReviewed = onDocumentUpdated('kyc_requests/{requestId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after || before.status === after.status) return;
  if (after.status !== 'approved' && after.status !== 'rejected') return;

  const uid = after.uid as string;
  const approved = after.status === 'approved';
  await notifyUser(uid, {
    title: approved ? 'Identité vérifiée' : 'Vérification refusée',
    body: approved
      ? 'Ton identité est vérifiée — la recharge crypto (USDT) est débloquée.'
      : `Ta demande de vérification a été refusée${after.reason ? ' : ' + after.reason : '.'}`,
  }, { type: 'kyc', status: after.status });
});

/**
 * Nouvelle connexion depuis un appareil inconnu.
 *
 * Se déclenche à la CRÉATION d'un document `user_sessions` — c'est-à-dire quand un deviceId
 * apparaît pour la première fois. On reste SILENCIEUX à la toute première session du compte :
 * il n'y a aucun autre appareil auquel la comparer, et alerter quelqu'un sur sa propre première
 * connexion apprend à ignorer l'alerte. Dès qu'un second appareil apparaît, on prévient — c'est
 * le signal qui compte : « quelqu'un d'autre s'est-il connecté à mon compte ? ».
 *
 * Best-effort et découplé : un échec d'envoi ne casse rien, la session est déjà enregistrée.
 */
export const notifyNewDeviceSession = onDocumentCreated('user_sessions/{sessionId}', async (event) => {
  const s = event.data?.data();
  if (!s?.uid) return;

  const db = getFirestore();
  // Y avait-il DÉJÀ un autre appareil ? Si ce document est le seul, c'est la première connexion.
  const autres = await db.collection('user_sessions').where('uid', '==', s.uid).limit(2).get();
  const seul = autres.size <= 1;
  if (seul) return;

  const device = String(s.device ?? 'un nouvel appareil');
  const ip = String(s.ip ?? 'inconnue');
  await notifyUser(s.uid, {
    title: 'Nouvelle connexion détectée',
    body: `Connexion depuis ${device} (IP ${ip}). Si ce n'est pas toi, ouvre ton profil et déconnecte les autres appareils.`,
  }, { type: 'new-device', device, ip });
});
