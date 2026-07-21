import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2/options';

initializeApp();

// ⚠️ Région IMMUABLE une fois en prod (CLAUDE.md J1 : choisir par mesure de latence).
// Défaut us-central1 ; surcharger via FUNCTIONS_REGION avant le 1er déploiement.
//
// ⚠️ QUOTA CPU CLOUD RUN : « Total CPU allocation per project per region » est plafonné à
// 20 000 milli vCPU sur ce projet et N'EST PAS augmentable en self-service (refus console).
// Une fois saturé, toute CRÉATION de nouvelle fonction échoue (healthcheck / timeout).
// → maxInstances réduit à 3 (largement suffisant avant lancement) pour limiter la réservation.
// → Déployer par PETITS LOTS (`--only functions:a,functions:b`), jamais tout d'un coup.
setGlobalOptions({ region: process.env.FUNCTIONS_REGION ?? 'us-central1', maxInstances: 3 });

export { reviewDeposit } from './deposits';
export { placeOrderCallable, placeCartOrderCallable } from './orders';
export { setAdminRole, setSmsForwarderRole } from './admin';
export { recordSession, endSession } from './sessions';
// `seedProducts` retiré du déploiement (2026-07-19) : semait le catalogue codé en dur, déjà
// fait en prod, et jamais appelé par l'app (scripts émulateur uniquement). Libère du quota CPU.
// Le code reste dans ./products si un re-seed devenait nécessaire.
export { ingestSms, ingestOxapayCallback } from './webhooks';
export { redeemReward } from './points';
export { reviewKyc } from './kyc';
export { createCryptoInvoice } from './crypto-deposits';
export { notifyDepositCredited, notifyOrderCompleted, notifyKycReviewed } from './notifications';
export { setFxRate, setDepositAccounts } from './config-admin';
export { fulfillOrder } from './fulfillment';
export { passkeyStatus, passkeyRegisterOptions, passkeyRegisterVerify, passkeyAuthOptions, passkeyAuthVerify } from './webauthn';
export { sendBroadcastPush, savePromo, deletePromo } from './broadcast';
export { autoFulfillOrder } from './auto-fulfillment';
export { reloadlyBalance, reloadlyFindProducts, setProductSupplier } from './reloadly-admin';
// NB : `repriceAll` retiré (2026-07-19). Depuis la restructuration du catalogue, les cartes
// Reloadly n'ont plus de `pricing.faceUsdCents` (dénominations multiples / montant libre) :
// il les ignorait toutes. La re-tarification correcte se fait via `reloadlyImportCatalog`,
// qui recalcule tout avec la config courante. Retiré aussi car le quota CPU Cloud Run est saturé.
export { setPricingConfig, setProductCost, reloadlyImportCatalog, estimateFunding, setProductInventory, deleteProduct, clearImportedProducts } from './pricing-admin';
export { depositChainHeartbeat } from './heartbeat';
