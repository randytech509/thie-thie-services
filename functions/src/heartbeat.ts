import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { sendEmail } from './lib/email';
import { audit } from './lib/audit';

/**
 * Sentinelle de la chaîne de dépôts.
 *
 * POURQUOI ELLE EXISTE : le 2026-07-20, la rotation du `SMS_HOOK_SECRET` a coupé le
 * transfert des SMS depuis le téléphone marchand. Rien ne l'a signalé. Aucune erreur,
 * aucune alerte — juste des dépôts qui cessent d'arriver, et personne pour s'en rendre
 * compte avant qu'un client se plaigne.
 *
 * C'est le mode de panne le plus coûteux d'un système de paiement : il est SILENCIEUX.
 * Un webhook qui renvoie 500 se voit dans les journaux ; un webhook que plus personne
 * n'appelle ne laisse aucune trace. On surveille donc une ABSENCE, pas une erreur.
 *
 * Ce que la sentinelle ne fait PAS : elle ne juge pas de la validité des SMS, ni des
 * montants. Elle répond à une seule question — « la chaîne est-elle encore vivante ? ».
 */

/** Au-delà de ce silence pendant les heures d'activité, on alerte. */
const SEUIL_SILENCE_HEURES = 6;

/**
 * Heures d'activité en Haïti (UTC−5, pas de changement d'heure). La nuit, l'absence de SMS
 * est NORMALE : alerter à 3 h du matin apprendrait vite à ignorer l'alerte, ce qui la rendrait
 * inutile le jour où elle compte.
 */
const HEURE_DEBUT_LOCALE = 7;
const HEURE_FIN_LOCALE = 21;
const DECALAGE_HAITI = -5;

export const depositChainHeartbeat = onSchedule(
  { schedule: 'every 2 hours', timeZone: 'Etc/UTC', retryCount: 0 },
  async () => {
    const maintenant = new Date();
    const heureLocale = (maintenant.getUTCHours() + 24 + DECALAGE_HAITI) % 24;
    if (heureLocale < HEURE_DEBUT_LOCALE || heureLocale >= HEURE_FIN_LOCALE) return;

    const db = getFirestore();
    const seuil = Timestamp.fromMillis(Date.now() - SEUIL_SILENCE_HEURES * 3600 * 1000);

    // On interroge le REGISTRE D'ENTRÉE, pas les crédits : un SMS reçu mais non rapproché
    // prouve quand même que la chaîne téléphone → webhook fonctionne. Compter les crédits
    // ferait sonner l'alerte lors d'une simple journée sans dépôt, ce qui est autre chose.
    const recents = await db.collection('sms_inbox')
      .where('receivedAt', '>=', seuil)
      .limit(1)
      .get();

    if (!recents.empty) return; // la chaîne vit

    // Dernier signe de vie connu, pour que l'alerte dise depuis QUAND et non juste « panne ».
    const dernier = await db.collection('sms_inbox')
      .orderBy('receivedAt', 'desc')
      .limit(1)
      .get();
    const dernierAt = dernier.empty ? null : dernier.docs[0].get('receivedAt');
    const depuis = dernierAt?.toDate?.()
      ? `${dernierAt.toDate().toISOString()} (UTC)`
      : 'aucune réception enregistrée à ce jour';

    // Idempotence : une alerte au plus par fenêtre de silence. Sans ce garde-fou, la
    // sentinelle enverrait un courriel toutes les deux heures pendant toute la panne, et
    // on apprendrait à les supprimer sans les lire.
    const marqueur = db.doc(`system_alerts/deposit-chain-silent`);
    const snap = await marqueur.get();
    const dejaAlerteA = snap.exists ? Number(snap.get('lastAlertMs') ?? 0) : 0;
    if (Date.now() - dejaAlerteA < SEUIL_SILENCE_HEURES * 3600 * 1000) return;

    const destinataires = (process.env.FUNCTIONS_BOOTSTRAP_ADMIN_EMAILS ?? '')
      .split(',').map((e) => e.trim()).filter(Boolean);

    const html = `
      <h2>Chaîne de dépôts silencieuse</h2>
      <p>Aucun SMS n'a été reçu par le webhook depuis <strong>${SEUIL_SILENCE_HEURES} heures</strong>,
      en pleine journée d'activité.</p>
      <p>Dernière réception connue : <strong>${depuis}</strong></p>
      <p>Les dépôts MonCash et NatCash ne sont probablement plus crédités automatiquement.
      Causes les plus fréquentes, par ordre de probabilité :</p>
      <ol>
        <li>le secret partagé de l'app SMS Forwarder ne correspond plus à celui du serveur ;</li>
        <li>le téléphone marchand est éteint, hors réseau, ou l'app a été arrêtée ;</li>
        <li>la permission de lecture des SMS a été révoquée sur le téléphone.</li>
      </ol>
      <p>Vérification rapide : ouvrir l'app, onglet Sécurité, bouton « Tester l'envoi ».
      Un HTTP 200 confirme que la chaîne est rétablie.</p>`;

    for (const to of destinataires) {
      await sendEmail(to, '⚠️ Thie Thie — dépôts : chaîne SMS silencieuse', html);
    }

    await marqueur.set({ lastAlertMs: Date.now(), lastSeenAt: dernierAt ?? null }, { merge: true });
    await audit(db, {
      action: 'heartbeat:deposit-chain-silent',
      actorUid: 'system',
      meta: { seuilHeures: SEUIL_SILENCE_HEURES, dernierAt: depuis, destinataires: destinataires.length },
    });
  },
);
