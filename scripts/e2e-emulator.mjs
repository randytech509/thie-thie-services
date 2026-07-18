/**
 * Test d'intégration runtime bout-en-bout contre la suite d'émulateurs.
 * Exerce les VRAIES Cloud Functions (pas des mocks) via le SDK client JS,
 * exactement comme le fait la SPA.
 *
 * Prérequis : émulateurs auth+firestore+functions démarrés, functions/.env avec
 *   FUNCTIONS_ENFORCE_APPCHECK=false et FUNCTIONS_BOOTSTRAP_ADMIN_EMAILS=admin@test.com
 * Lancer depuis la racine projet : node scripts/e2e-emulator.mjs
 */
import { initializeApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc,
} from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { randomUUID } from 'node:crypto';

const PROJECT = 'thie-thie-dev';
const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-key' });
const auth = getAuth(app);
const db = getFirestore(app, '(default)');
const fns = getFunctions(app, 'us-central1');
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFirestoreEmulator(db, '127.0.0.1', 8080);
connectFunctionsEmulator(fns, '127.0.0.1', 5001);

const ADMIN = { email: 'admin@test.com', pass: 'passw0rd!' };
const CUST = { email: 'customer@test.com', pass: 'passw0rd!' };
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅', m); };
const ko = (m) => { fail++; console.log('  ❌', m); };
const step = (m) => console.log('\n▶', m);

async function login(u) { await signInWithEmailAndPassword(auth, u.email, u.pass); }
function profile(user) {
  return {
    uid: user.uid, displayName: 'Test', fullName: 'Test User',
    email: user.email, role: 'customer', photoURL: '', thieThiePoints: 0,
    phoneNumber: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

try {
  step('1. Création des comptes (admin + client)');
  const adminCred = await createUserWithEmailAndPassword(auth, ADMIN.email, ADMIN.pass);
  const adminUid = adminCred.user.uid;
  await setDoc(doc(db, 'users', adminUid), profile(adminCred.user)); // create rule
  const custCred = await createUserWithEmailAndPassword(auth, CUST.email, CUST.pass);
  const custUid = custCred.user.uid;
  await setDoc(doc(db, 'users', custUid), profile(custCred.user)); // teste aussi le fix inscription
  ok(`comptes créés + profils écrits (create rule OK) admin=${adminUid.slice(0,6)} cust=${custUid.slice(0,6)}`);

  step('2. Bootstrap 1er admin (setAdminRole)');
  await login(ADMIN);
  await httpsCallable(fns, 'setAdminRole')({ uid: adminUid, admin: true });
  await signOut(auth); await login(ADMIN); // rafraîchit le token → claim admin présent
  ok('claim admin attribué via bootstrap');

  step('3. Seed du catalogue (seedProducts, admin)');
  const seedRes = await httpsCallable(fns, 'seedProducts')({ setStock: true });
  ok(`catalogue semé : ${JSON.stringify(seedRes.data)}`);
  const variantId = 'ff-diamonds__0';
  const vSnap = await getDoc(doc(db, 'products', variantId));
  const price = vSnap.exists() ? vSnap.data().priceCents : null;
  vSnap.exists() ? ok(`variante ${variantId} présente, priceCents=${price}`) : ko(`variante ${variantId} absente`);

  step('4. Le client crée une demande de dépôt (wallet_requests)');
  await login(CUST);
  const reqId = randomUUID().replace(/-/g, '');
  await setDoc(doc(db, 'wallet_requests', reqId), {
    requestId: reqId, uid: custUid, amount: 500, paymentMethod: 'moncash',
    transactionReference: 'TX-TEST-001', screenshotURL: '', status: 'Pending Verification',
    createdAt: new Date().toISOString(),
  });
  ok(`demande ${reqId.slice(0,8)}… créée (500 HTG, Pending Verification)`);

  step('5. L\'admin approuve (reviewDeposit → creditWallet)');
  await login(ADMIN);
  const rev = await httpsCallable(fns, 'reviewDeposit')({ requestId: reqId, decision: 'approve' });
  ok(`reviewDeposit: ${JSON.stringify(rev.data)}`);

  step('6. Vérif solde crédité');
  await login(CUST);
  let uSnap = await getDoc(doc(db, 'users', custUid));
  const bal = uSnap.data();
  const balCents = bal.walletBalanceCents ?? bal.balance ?? null;
  balCents === 50000 ? ok(`solde = ${balCents} centimes (attendu 50000)`) : ko(`solde=${balCents}, attendu 50000 — doc=${JSON.stringify(bal)}`);

  step('7. Le client achète avec son wallet (placeOrder)');
  const idem = randomUUID();
  const order = await httpsCallable(fns, 'placeOrderCallable')({
    productId: variantId, quantity: 1, idempotencyKey: idem,
    playerId: '123456789', region: 'BR', optionLabel: '100 Diamonds',
  });
  ok(`placeOrder: ${JSON.stringify(order.data)}`);

  step('8. Vérif débit + stock');
  uSnap = await getDoc(doc(db, 'users', custUid));
  const bal2 = uSnap.data();
  const balCents2 = bal2.walletBalanceCents ?? bal2.balance ?? null;
  const expected = 50000 - price;
  balCents2 === expected ? ok(`solde après achat = ${balCents2} (attendu ${expected})`) : ko(`solde=${balCents2}, attendu ${expected}`);
  const vSnap2 = await getDoc(doc(db, 'products', variantId));
  const stock2 = vSnap2.data().stock;
  ok(`stock variante après achat = ${stock2}`);

  step('9. Idempotence : rejouer le MÊME achat ne double pas le débit');
  await httpsCallable(fns, 'placeOrderCallable')({
    productId: variantId, quantity: 1, idempotencyKey: idem,
    playerId: '123456789', region: 'BR', optionLabel: '100 Diamonds',
  });
  uSnap = await getDoc(doc(db, 'users', custUid));
  const balCents3 = (uSnap.data().walletBalanceCents ?? uSnap.data().balance);
  balCents3 === expected ? ok(`solde inchangé après rejeu = ${balCents3} (idempotent)`) : ko(`DOUBLE DÉBIT ! solde=${balCents3}`);

  step('10. Gate KYC : recharge crypto REFUSÉE avant vérification (permission-denied)');
  try {
    await httpsCallable(fns, 'createCryptoInvoice')({ amountUsd: 10 });
    ko('createCryptoInvoice a réussi SANS kycStatus approuvé — faille de sécurité');
  } catch (e) {
    e?.code === 'functions/permission-denied'
      ? ok(`refusé comme attendu (${e.code}): ${e.message}`)
      : ko(`erreur inattendue : ${e?.code} ${e?.message}`);
  }

  step('11. Le client soumet une demande KYC (kyc_requests)');
  const kycReqId = 'KYC-' + randomUUID().slice(0, 8);
  await setDoc(doc(db, 'kyc_requests', kycReqId), {
    requestId: kycReqId, uid: custUid, fullName: 'Client Test',
    idPhotoURL: 'https://example.com/id.jpg', selfiePhotoURL: 'https://example.com/selfie.jpg',
    status: 'pending', createdAt: new Date().toISOString(),
  });
  ok(`demande KYC ${kycReqId} créée (pending)`);

  step('12. L\'admin approuve (reviewKyc)');
  await login(ADMIN);
  const kycRev = await httpsCallable(fns, 'reviewKyc')({ requestId: kycReqId, decision: 'approve' });
  ok(`reviewKyc: ${JSON.stringify(kycRev.data)}`);

  step('13. Vérif kycStatus == approved côté users/{uid}');
  await login(CUST);
  const kycUserSnap = await getDoc(doc(db, 'users', custUid));
  kycUserSnap.data().kycStatus === 'approved'
    ? ok('kycStatus = approved')
    : ko(`kycStatus = ${kycUserSnap.data().kycStatus}, attendu 'approved'`);

  step('14. Recharge crypto maintenant débloquée (dépasse le gate KYC)');
  try {
    await httpsCallable(fns, 'createCryptoInvoice')({ amountUsd: 10 });
    ko('createCryptoInvoice a réussi — inattendu sans vraies credentials OxaPay (clé factice)');
  } catch (e) {
    // Le projet d'émulateur frais n'a pas de config/fx (taux FX HTG/USD) ni de vraies
    // credentials OxaPay — donc l'appel échoue plus loin dans le pipeline, MAIS ce qui
    // compte ici est PROUVÉ : le code n'est PAS 'permission-denied' (comme à l'étape 10),
    // ce qui démontre que le gate KYC a bien été franchi une fois approuvé.
    e?.code !== 'functions/permission-denied'
      ? ok(`gate KYC franchi (code=${e?.code}, attendu tant que config/fx ou credentials OxaPay réelles manquent) : ${e.message}`)
      : ko(`gate KYC PAS franchi malgré kycStatus=approved : ${e?.code} ${e?.message}`);
  }

} catch (e) {
  fail++;
  console.log('\n❌ EXCEPTION:', e?.code || '', e?.message || e);
} finally {
  console.log(`\n===== RÉSULTAT : ${pass} OK / ${fail} KO =====`);
  process.exit(fail ? 1 : 0);
}
