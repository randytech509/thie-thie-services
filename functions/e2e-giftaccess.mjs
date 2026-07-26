// Test E2E GIFT ACCESS sur l'émulateur : seed un produit ga_* + une commande, puis attend que
// le VRAI déclencheur autoFulfillOrder (code de prod) appelle le VRAI sandbox GIFT ACCESS et
// livre. À lancer via :
//   npm --prefix functions run build
//   firebase emulators:exec --only firestore,functions "node functions/e2e-giftaccess.mjs"
// (les creds GIFTACCESS_API_KEY/SECRET sont chargés par l'émulateur depuis functions/.env.local)
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'thie-thie-services' });
const db = getFirestore(app);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  // 1. Produit GIFT ACCESS (Free Fire LATAM 100+10 diamants → variation 88452).
  await db.doc('products/ga_58462__0').set({
    productId: 'ga_58462', id: 'ga_58462__0', name: 'Free Fire Diamonds',
    optionLabel: '100 + 10 Diamonds', category: 'free-fire', categorySlug: 'free-fire',
    currency: 'HTG', priceCents: 13000, stock: 999, available: true,
    requiresPlayerId: true, deliveryTime: '1-5 Min', sortIndex: 0,
    supplier: 'giftaccess', autoFulfill: true,
    giftAccessProductId: '58462', giftAccessVariationId: '88452', giftAccessAmountUsd: null,
  });

  // 2. Commande payée (placeOrder est le seul créateur en prod ; ici on seed direct pour
  //    déclencher autoFulfillOrder onCreate). Le déclencheur va lire ce produit et commander.
  const orderId = `e2e-${Date.now()}`;
  console.log(`\n📦 Création commande ${orderId} (Free Fire, player 123456789)…`);
  await db.doc(`orders/${orderId}`).set({
    orderId, productId: 'ga_58462__0', productName: 'Free Fire Diamonds',
    optionLabel: '100 + 10 Diamonds', uid: 'e2e-user', email: 'e2e@example.com',
    freeFirePlayerId: '123456789', status: 'Pending', priceCents: 13000,
    createdAt: FieldValue.serverTimestamp(),
  });

  // 3. Attendre que le déclencheur livre (fulfilledAt) ou signale un échec (autoFulfillError).
  console.log('⏳ Attente du déclencheur autoFulfillOrder (→ sandbox GIFT ACCESS)…');
  let snap, data;
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    snap = await db.doc(`orders/${orderId}`).get();
    data = snap.data() || {};
    if (data.fulfilledAt || data.autoFulfillError) break;
    if (i % 5 === 4) console.log(`   …${i + 1}s (giftAccessStatus=${data.giftAccessStatus ?? '—'})`);
  }

  console.log('\n=== Résultat commande ===');
  console.log(JSON.stringify({
    fulfilledAt: !!data.fulfilledAt,
    autoFulfilled: data.autoFulfilled ?? false,
    autoFulfillProvider: data.autoFulfillProvider ?? null,
    giftAccessOrderId: data.giftAccessOrderId ?? null,
    giftAccessStatus: data.giftAccessStatus ?? null,
    deliveryCode: data.deliveryCode ?? null,
    deliveryPin: data.deliveryPin ?? null,
    deliveryInstructions: data.deliveryInstructions ?? null,
    autoFulfillError: data.autoFulfillError ?? null,
    emailSent: data.emailSent ?? null,
  }, null, 2));

  // Assertions : la commande doit être livrée automatiquement par GIFT ACCESS.
  assert.ok(data.autoFulfillError == null, `Échec fulfillment: ${data.autoFulfillError}`);
  assert.ok(data.fulfilledAt, 'La commande devrait être livrée (fulfilledAt manquant)');
  assert.equal(data.autoFulfillProvider, 'giftaccess', 'Fournisseur devrait être giftaccess');
  assert.ok(data.giftAccessOrderId, 'order_id GIFT ACCESS manquant');
  assert.ok(data.deliveryCode || data.deliveryPin || data.deliveryInstructions, 'Aucune livraison (code/pin/confirmation)');
  console.log('\n✅ E2E OK : commande auto-livrée de bout en bout via GIFT ACCESS.\n');
}

run().then(() => process.exit(0)).catch((e) => { console.error('\n❌ E2E ÉCHOUÉ :', e.message, '\n'); process.exit(1); });
