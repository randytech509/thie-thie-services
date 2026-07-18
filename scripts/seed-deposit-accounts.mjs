/**
 * Sème `config/depositAccounts` (coordonnées de dépôt manuel affichées dans le modal
 * Add Funds — MonCash/NatCash/Binance Pay/PayPal). Écriture serveur-only (Admin SDK,
 * contourne firestore.rules) : ce sont des données de configuration métier, pas des
 * secrets applicatifs, mais elles ne doivent pas vivre en dur dans un repo public.
 *
 * Usage :
 *   1. Copier scripts/deposit-accounts.example.json → scripts/deposit-accounts.json
 *      (gitignored) et y mettre les vraies valeurs.
 *   2. Contre l'émulateur : FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-deposit-accounts.mjs
 *   3. Contre le vrai projet : GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> node scripts/seed-deposit-accounts.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, 'deposit-accounts.json');

let data;
try {
  data = JSON.parse(readFileSync(dataPath, 'utf8'));
} catch {
  console.error(`Introuvable : ${dataPath}\nCopie scripts/deposit-accounts.example.json vers ce chemin et remplis les vraies valeurs.`);
  process.exit(1);
}

const required = ['moncashName', 'moncashNumber', 'natcashName', 'natcashNumber', 'binancePayId', 'paypalEmail'];
const missing = required.filter((k) => !data[k]);
if (missing.length) {
  console.error(`Champs manquants dans deposit-accounts.json : ${missing.join(', ')}`);
  process.exit(1);
}

initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'thie-thie-dev' });
const db = getFirestore();

await db.doc('config/depositAccounts').set(data);
console.log('config/depositAccounts semé :', data);
