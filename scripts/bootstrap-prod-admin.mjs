// Bootstrap prod : crée (ou connecte) le 1er admin, le promeut via setAdminRole
// (self-bootstrap FUNCTIONS_BOOTSTRAP_ADMIN_EMAILS), rafraîchit le token, puis seedProducts.
// Usage : node scripts/bootstrap-prod-admin.mjs <email> <password>
import { initializeApp } from 'firebase/app';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { readFileSync } from 'node:fs';

// Lit .env.production
const env = Object.fromEntries(
  readFileSync(new URL('../.env.production', import.meta.url), 'utf8')
    .split('\n').filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const [, , email, password] = process.argv;
if (!email || !password) { console.error('Usage: node scripts/bootstrap-prod-admin.mjs <email> <password>'); process.exit(1); }

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const functions = getFunctions(app, env.VITE_FUNCTIONS_REGION || 'us-central1');

async function main() {
  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, email, password);
    console.log('✅ compte créé :', cred.user.uid);
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') {
      cred = await signInWithEmailAndPassword(auth, email, password);
      console.log('✅ compte existant, connecté :', cred.user.uid);
    } else { throw e; }
  }
  const uid = cred.user.uid;

  console.log('→ setAdminRole (bootstrap)…');
  const setAdmin = httpsCallable(functions, 'setAdminRole');
  const r1 = await setAdmin({ uid, admin: true });
  console.log('   ', JSON.stringify(r1.data));

  // rafraîchir le token pour embarquer le claim admin
  await cred.user.getIdToken(true);
  console.log('   token rafraîchi (claim admin actif)');

  console.log('→ seedProducts…');
  const seed = httpsCallable(functions, 'seedProducts');
  const r2 = await seed({});
  console.log('   ', JSON.stringify(r2.data));

  console.log('\n✅ Bootstrap terminé. Admin =', email, '| catalogue semé =', r2.data?.written, 'variantes');
  process.exit(0);
}
main().catch((e) => { console.error('❌', e.code || '', e.message); process.exit(1); });
