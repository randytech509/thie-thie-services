#!/usr/bin/env node
/**
 * Sonde de validation — API GIFT ACCESS (portal.gift-access.com/api/v1).
 *
 * BUT : valider en VRAI que la signature HMAC et les endpoints répondent avec TA clé sandbox,
 * avant d'écrire l'adaptateur fournisseur dans thie-thie. Teste : GET /ping, GET /wallet/balance,
 * GET /products.
 *
 * Schéma d'auth (doc GIFT ACCESS) :
 *   message signé = timestamp + method + path + body
 *   headers = X-API-KEY, X-API-SIGNATURE, X-API-TIMESTAMP (+ Idempotency-Key, Content-Type sur POST)
 *   signature = HMAC-SHA256(secret, message)  [supposé hex — bascule en base64 si 401]
 *
 * ⚠️ INCERTITUDES à ajuster si 401/erreur signature (tout est paramétrable via env) :
 *   - GA_SIGN_PATH : 'full' (/api/v1/ping, défaut) ou 'rel' (/ping)
 *   - GA_TS_UNIT   : 'ms' (défaut) ou 's'
 *   - GA_SIG_ENC   : 'hex' (défaut) ou 'base64'
 * Le script AFFICHE le message signé (sans le secret) pour comparer avec le SDK officiel.
 *
 * SÉCURITÉ : clé/secret lus en ENV, jamais en dur ni loggés ; n'appelle que portal.gift-access.com ;
 * ne fait que des GET (lecture). Rien n'est acheté.
 *
 * USAGE :
 *   export GIFTACCESS_API_KEY="ta_cle_sandbox"
 *   export GIFTACCESS_API_SECRET="ton_secret_sandbox"
 *   node scripts/giftaccess-probe.mjs
 *   # si 401 signature, essayer par ex. :  GA_SIGN_PATH=rel GA_TS_UNIT=s node scripts/giftaccess-probe.mjs
 */

import crypto from 'node:crypto';
import https from 'node:https';

const API_KEY = process.env.GIFTACCESS_API_KEY;
const API_SECRET = process.env.GIFTACCESS_API_SECRET;
const BASE = process.env.GIFTACCESS_BASE_URL || 'https://portal.gift-access.com';
const API_PREFIX = '/api/v1';

const SIGN_PATH = (process.env.GA_SIGN_PATH || 'full').toLowerCase();  // full | rel
const TS_UNIT = (process.env.GA_TS_UNIT || 'ms').toLowerCase();         // ms | s
const SIG_ENC = (process.env.GA_SIG_ENC || 'hex').toLowerCase();       // hex | base64
const SIGN_QUERY = (process.env.GA_SIGN_QUERY || 'strip').toLowerCase(); // strip | path | body
//   strip = query PAS signé (path seul) ; path = query inclus dans le path ; body = query dans le slot body

if (!API_KEY || !API_SECRET) {
  console.error('\n❌ Variables manquantes :');
  console.error('   export GIFTACCESS_API_KEY="..."   (clé SANDBOX)');
  console.error('   export GIFTACCESS_API_SECRET="..."\n');
  process.exit(1);
}

const mask = (s) => (s.length <= 8 ? '****' : `${s.slice(0, 4)}…${s.slice(-4)}`);

function sign(method, endpoint, body = '') {
  const ts = TS_UNIT === 's' ? Math.floor(Date.now() / 1000).toString() : Date.now().toString();
  const [epPath, epQuery = ''] = endpoint.split('?');
  const base = SIGN_PATH === 'rel' ? epPath : `${API_PREFIX}${epPath}`;
  let signPath = base;
  let signBody = body;
  if (SIGN_QUERY === 'path') signPath = base + (epQuery ? `?${epQuery}` : '');
  else if (SIGN_QUERY === 'body') signBody = epQuery + body;
  // 'strip' (défaut) : query absent de la signature.
  const message = `${ts}${method.toUpperCase()}${signPath}${signBody}`;
  const signature = crypto.createHmac('sha256', API_SECRET).update(message).digest(SIG_ENC);
  return { ts, message, signature };
}

function call(method, endpoint, body = '') {
  return new Promise((resolve) => {
    const { ts, message, signature } = sign(method, endpoint, body);
    const options = {
      hostname: new URL(BASE).hostname,
      path: `${API_PREFIX}${endpoint}`,
      method,
      headers: {
        'X-API-KEY': API_KEY,
        'X-API-SIGNATURE': signature,
        'X-API-TIMESTAMP': ts,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => resolve({ status: res.statusCode, raw, signedMessage: message }));
    });
    req.on('error', (e) => resolve({ status: 0, raw: `NETWORK ${e.message}`, signedMessage: message }));
    if (body) req.write(body);
    req.end();
  });
}

function short(raw) {
  try {
    const j = JSON.parse(raw);
    return JSON.stringify(j).slice(0, 400);
  } catch {
    return String(raw).slice(0, 300);
  }
}

const OK = (s) => s >= 200 && s < 300;

const run = async () => {
  console.log('\n🔍 Sonde GIFT ACCESS — ' + BASE + API_PREFIX);
  console.log(`   clé      : ${mask(API_KEY)} (sandbox attendue)`);
  console.log(`   réglages : signPath=${SIGN_PATH}  ts=${TS_UNIT}  sigEnc=${SIG_ENC}  query=${SIGN_QUERY}\n`);

  const tests = [
    ['GET', '/ping', 'Clé API répond'],
    ['GET', '/wallet/balance', 'Solde wallet USD'],
    ['GET', '/products?limit=5', 'Liste produits (+ IDs/variations)'],
  ];

  let firstAuthFail = false;
  for (const [method, endpoint, label] of tests) {
    const r = await call(method, endpoint);
    const flag = OK(r.status) ? '✅' : (r.status === 401 || r.status === 403 ? '🔒' : '❌');
    console.log(`${flag} ${method} ${endpoint}  →  HTTP ${r.status}  · ${label}`);
    console.log(`   ${short(r.raw)}`);
    if (!OK(r.status) && !firstAuthFail) {
      firstAuthFail = true;
      console.log(`   ↳ message signé essayé : "${r.signedMessage}"`);
    }
    console.log('');
  }

  if (firstAuthFail) {
    console.log('🟠 Au moins un appel a échoué. Si c’est une erreur de signature (401), rejoue en');
    console.log('   variant les réglages, ex. :');
    console.log('     GA_SIGN_PATH=rel node scripts/giftaccess-probe.mjs');
    console.log('     GA_TS_UNIT=s GA_SIGN_PATH=rel node scripts/giftaccess-probe.mjs');
    console.log('     GA_SIG_ENC=base64 node scripts/giftaccess-probe.mjs');
    console.log('   (ou ouvre le SDK Node téléchargeable pour lire la fonction de signature exacte.)\n');
  } else {
    console.log('🟢 Tous les appels répondent — la signature HMAC est bonne, l’adaptateur est faisable.\n');
  }
};

run();
