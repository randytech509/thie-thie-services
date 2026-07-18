import { getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Notifications push (Firebase Cloud Messaging). Dégradation gracieuse à chaque étage —
 * navigateur non compatible, permission refusée, ou VITE_FCM_VAPID_KEY absente (projet
 * Firebase réel pas encore configuré) : le bouton "Activer" échoue proprement, jamais de crash.
 */

const VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY as string | undefined;

let messagingInstance: Messaging | null | undefined; // undefined = pas encore vérifié

async function getMessagingIfSupported(): Promise<Messaging | null> {
  if (messagingInstance !== undefined) return messagingInstance;
  messagingInstance = (await isSupported()) ? getMessaging(getApp()) : null;
  return messagingInstance;
}

export type PushEnableResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' | 'no-vapid-key' | 'error'; error?: string };

/** Demande la permission navigateur, récupère le jeton FCM, l'enregistre sur users/{uid}.fcmTokens.
 *  Idempotent (arrayUnion) — rappelable sans risque (plusieurs appareils, permission déjà accordée). */
export async function enablePushNotifications(uid: string): Promise<PushEnableResult> {
  if (!VAPID_KEY) return { ok: false, reason: 'no-vapid-key' };

  const messaging = await getMessagingIfSupported();
  if (!messaging) return { ok: false, reason: 'unsupported' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    // Attendre que le service worker soit ACTIF avant de s'abonner. Sans ça, getToken()
    // appelle PushManager.subscribe() sur un SW encore en cours d'installation → erreur
    // "Subscription failed - no active Service Worker".
    if (!registration.active) {
      await new Promise<void>((resolve) => {
        const worker = registration.installing || registration.waiting;
        if (!worker) { resolve(); return; }
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated') resolve();
        });
      });
    }
    // Filet de sécurité : garantit un SW actif pour le scope de la page.
    await navigator.serviceWorker.ready;
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return { ok: false, reason: 'error', error: 'Jeton FCM vide' };

    await updateDoc(doc(db, 'users', uid), {
      fcmTokens: arrayUnion(token),
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'error', error: (e as Error).message };
  }
}

/** Notifications reçues quand l'onglet est au premier plan (le service worker ne les affiche
 *  QUE en arrière-plan — voir public/firebase-messaging-sw.js). Renvoie une fonction de nettoyage. */
export async function listenForForegroundPush(
  onPush: (title: string, body: string) => void,
): Promise<() => void> {
  const messaging = await getMessagingIfSupported();
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    const { title, body } = payload.notification ?? {};
    onPush(title ?? 'Thie Thie Services', body ?? '');
  });
}
