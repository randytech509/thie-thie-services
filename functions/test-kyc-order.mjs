// Test émulateur du gate KYC commandes (slice 3c) — appelle le vrai placeOrder.
// Lancé via: firebase emulators:exec --only firestore "node functions/test-kyc-order.mjs"
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { placeOrder } from './lib/lib/transactions.js';

initializeApp({ projectId: 'thie-thie-services' });
const db = getFirestore();

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log('  OK  ', name); } else { fail++; console.log(' FAIL ', name); } };

// Produit HTG à prix fixe (pas besoin de fx/pricing)
async function seedProduct(id, priceCents) {
  await db.doc(`products/${id}`).set({ name: 'Test', available: true, stock: 1000, priceCents, currency: 'HTG' });
}
async function seedUser(uid, kyc, spentCents, balanceCents) {
  await db.doc(`users/${uid}`).set({ kycStatus: kyc, totalSpentCents: spentCents, walletBalanceCents: balanceCents, thieThiePoints: 0 });
}
async function tryOrder(uid, productId, key) {
  try {
    await placeOrder(db, { uid, productId, quantity: 1, idempotencyKey: key });
    return { ok: true };
  } catch (e) { return { ok: false, code: e.code, msg: e.message }; }
}

await seedProduct('P1000', 100000); // 1000 HTG
await seedProduct('P400', 40000);   // 400 HTG

// U1 : déjà 4500 HTG dépensés, KYC none, gros solde
await seedUser('U1', 'none', 450000, 10000000);
let r = await tryOrder('U1', 'P1000', 'o-u1-a'); // 4500+1000=5500 > 5000 -> BLOQUÉ
check('U1 commande 1000 (total 5500) BLOQUÉE kyc-required', !r.ok && r.code === 'kyc-required');

await seedUser('U1b', 'none', 450000, 10000000);
r = await tryOrder('U1b', 'P400', 'o-u1b-a'); // 4500+400=4900 <= 5000 -> OK
check('U1b commande 400 (total 4900) PASSE', r.ok === true);

// U2 : même cumul mais KYC approuvé -> passe
await seedUser('U2', 'approved', 450000, 10000000);
r = await tryOrder('U2', 'P1000', 'o-u2-a'); // 5500 mais KYC ok
check('U2 (KYC ok) commande 1000 (total 5500) PASSE', r.ok === true);

// U3 : total EXACT 5000 -> non bloqué ; +1 commande au-delà -> bloqué
await seedUser('U3', 'none', 450000, 10000000);
r = await tryOrder('U3', 'P400', 'o-u3-a'); // 4500+400=4900 ok, spent devient 4900
check('U3 1re commande 400 PASSE (spent->4900)', r.ok === true);
r = await tryOrder('U3', 'P400', 'o-u3-b'); // 4900+400=5300 > 5000 -> BLOQUÉ
check('U3 2e commande 400 (total 5300) BLOQUÉE', !r.ok && r.code === 'kyc-required');

console.log(`\nRésultat: ${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
