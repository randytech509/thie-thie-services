import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import * as giftaccess from './lib/giftaccess';
import { interpretOrderResponse, finalizeDelivery } from './lib/giftaccess-fulfill';

/**
 * Poller des commandes GIFT ACCESS ASYNCHRONES. Le sandbox répond `completed` tout de suite,
 * mais rien ne garantit que la prod soit toujours synchrone : `autoFulfillOrder` marque alors
 * la commande `giftAccessPending=true`, et ce poller la reprend jusqu'à livraison/échec.
 *
 * Il interroge `getOrder` puis réutilise `finalizeDelivery` (même code que la livraison
 * immédiate) — qui pose `giftAccessPending=false` en état terminal, sortant la commande de la file.
 * Filet de sécurité : au-delà de MAX_TRIES tentatives, on abandonne (repli manuel) pour ne pas
 * poller éternellement une commande bloquée.
 */

const MAX_TRIES = 20; // ~20 passes → repli manuel si toujours pas résolu

export const giftaccessFulfillmentPoll = onSchedule(
  { schedule: 'every 2 minutes', timeZone: 'Etc/UTC', retryCount: 0 },
  async () => {
    if (!giftaccess.isConfigured()) return;
    const db = getFirestore();

    const snap = await db.collection('orders').where('giftAccessPending', '==', true).limit(50).get();
    if (snap.empty) return;

    for (const doc of snap.docs) {
      const order = doc.data() as Record<string, any>;
      const gaId = String(order.giftAccessOrderId ?? '');
      if (!gaId) { await doc.ref.update({ giftAccessPending: false }); continue; }

      const tries = Number(order.giftAccessPollTries ?? 0) + 1;

      try {
        const resp = await giftaccess.getOrder(gaId);
        const interp = interpretOrderResponse(resp);

        if (interp.terminal) {
          let email = String(order.email ?? '');
          const uid = String(order.uid ?? order.userId ?? '');
          if (!email && uid) email = String((await db.doc(`users/${uid}`).get()).data()?.email ?? '');
          await finalizeDelivery(db, doc.ref, order, interp, email); // pose giftAccessPending=false
        } else if (tries >= MAX_TRIES) {
          await doc.ref.update({
            giftAccessPending: false,
            giftAccessStatus: interp.providerStatus,
            autoFulfillError: `GIFT ACCESS: non résolu après ${tries} tentatives (repli manuel)`,
            giftAccessPollTries: tries,
          });
        } else {
          await doc.ref.update({ giftAccessPollTries: tries, giftAccessStatus: interp.providerStatus });
        }
      } catch (e) {
        // getOrder a échoué (réseau/API) : on incrémente sans abandonner tout de suite.
        if (tries >= MAX_TRIES) {
          await doc.ref.update({
            giftAccessPending: false,
            autoFulfillError: `GIFT ACCESS poll: ${(e as Error).message}`.slice(0, 200),
            giftAccessPollTries: tries,
          });
        } else {
          await doc.ref.update({ giftAccessPollTries: tries });
        }
      }
    }
  },
);
