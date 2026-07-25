import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { reconcileRequestFromInbox } from './lib/deposit-reconcile';
import { audit } from './lib/audit';

/**
 * À la CRÉATION d'une demande de dépôt, tente de la rapprocher d'un SMS DÉJÀ reçu et de la
 * créditer. C'est le pendant de `ingestSms` dans l'autre sens : sans lui, un SMS journalisé
 * avant que la demande existe n'est jamais re-rapproché (le téléphone a reçu un 200 et ne le
 * renvoie plus). Voir l'en-tête de `reconcileRequestFromInbox` pour le détail et la sécurité.
 *
 * Non bloquant : toute erreur est journalisée mais n'empêche pas la création de la demande —
 * l'admin peut toujours valider manuellement. On ne relance rien en boucle : un seul essai à
 * la création suffit (le SMS, lui, est déjà là ou ne l'est pas).
 */
export const reconcileDepositOnCreate = onDocumentCreated('wallet_requests/{requestId}', async (event) => {
  const requestId = event.params.requestId;
  const db = getFirestore();
  try {
    const result = await reconcileRequestFromInbox(db, requestId);
    if (result.credited) {
      await audit(db, {
        action: 'request-reconcile:credit',
        actorUid: 'sms-hook',
        meta: { requestId, note: 'SMS déjà reçu, crédité à la création de la demande' },
      });
      logger.info('Dépôt auto-crédité à la création (SMS déjà reçu)', { requestId });
    } else if (result.needsReview) {
      logger.info('Demande créée : SMS rapproché par numéro, confirmation admin requise', { requestId });
    }
  } catch (e) {
    // On n'échoue jamais la création d'une demande à cause du rapprochement.
    logger.error('reconcileDepositOnCreate a échoué', { requestId, error: String(e) });
  }
});
