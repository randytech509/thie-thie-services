import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2/options';

initializeApp();

// ⚠️ Région IMMUABLE une fois en prod (CLAUDE.md J1 : choisir par mesure de latence).
// Défaut us-central1 ; surcharger via FUNCTIONS_REGION avant le 1er déploiement.
setGlobalOptions({ region: process.env.FUNCTIONS_REGION ?? 'us-central1', maxInstances: 10 });

export { reviewDeposit } from './deposits';
export { placeOrderCallable } from './orders';
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
export { setPricingConfig, setProductCost, reloadlyImportCatalog, repriceAll, estimateFunding, setProductInventory, deleteProduct } from './pricing-admin';
