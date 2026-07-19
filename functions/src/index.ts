import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2/options';

initializeApp();

// ⚠️ Région IMMUABLE une fois en prod (CLAUDE.md J1 : choisir par mesure de latence).
// Défaut us-central1 ; surcharger via FUNCTIONS_REGION avant le 1er déploiement.
setGlobalOptions({ region: process.env.FUNCTIONS_REGION ?? 'us-central1', maxInstances: 10 });

export { reviewDeposit } from './deposits';
export { placeOrderCallable, placeCartOrderCallable } from './orders';
export { setAdminRole } from './admin';
export { seedProducts } from './products';
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
