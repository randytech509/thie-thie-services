#!/usr/bin/env node
/**
 * Sonde de validation — Binance « Get Pay Trade History » (GET /sapi/v1/pay/transactions).
 *
 * BUT : trancher si l'auto-crédit off-chain (transferts C2C de Binance user à Binance user)
 * est faisable via l'API sur ton compte PERSONNEL — cet endpoint renvoie souvent `data:[]`
 * (feature surtout marchande). Ce script fait UN appel signé et affiche ce qui remonte.
 *
 * SÉCURITÉ :
 *   - N'utilise QU'UNE clé API « Enable Reading » (lecture seule), SANS retrait ni trade,
 *     idéalement restreinte à ton IP. Ce script ne fait que LIRE l'historique.
 *   - La clé/secret sont lus depuis l'environnement — JAMAIS écrits en dur ni loggés.
 *   - Rien n'est envoyé ailleurs que chez api.binance.com.
 *
 * USAGE (en local, dans un terminal à toi) :
 *   export BINANCE_API_KEY="ta_cle_lecture_seule"
 *   export BINANCE_API_SECRET="ton_secret"
 *   node scripts/binance-pay-probe.mjs               # 90 derniers jours (défaut Binance)
 *   node scripts/binance-pay-probe.mjs --days 7      # fenêtre explicite de 7 jours
 *   node scripts/binance-pay-probe.mjs --limit 50
 *
 * Astuce : fais d'abord un vrai transfert C2C vers ce compte, PUIS lance la sonde.
 */

import crypto from 'node:crypto';
import https from 'node:https';

const API_KEY = process.env.BINANCE_API_KEY;
const API_SECRET = process.env.BINANCE_API_SECRET;
// Base régionale au besoin (ex. https://api.binance.us). Défaut : international.
const BASE = process.env.BINANCE_BASE || 'https://api.binance.com';

// --- args ---
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const days = Number(getArg('--days', '0'));            // 0 = ne pas envoyer start/end (=> 90j par défaut Binance)
const limit = Number(getArg('--limit', '100'));         // max 100
const recvWindow = Number(getArg('--recvWindow', '60000'));

if (!API_KEY || !API_SECRET) {
  console.error('\n❌ Variables manquantes. Fais d’abord :');
  console.error('   export BINANCE_API_KEY="..."   (clé LECTURE SEULE)');
  console.error('   export BINANCE_API_SECRET="..."\n');
  process.exit(1);
}

const mask = (s) => (s.length <= 8 ? '****' : `${s.slice(0, 4)}…${s.slice(-4)}`);
const fmtTime = (ms) => (ms ? new Date(Number(ms)).toISOString().replace('T', ' ').slice(0, 19) : '—');

// --- construction de la requête signée ---
const params = new URLSearchParams();
if (days > 0) {
  const end = Date.now();
  const start = end - Math.min(days, 90) * 24 * 60 * 60 * 1000;
  params.set('startTime', String(start));
  params.set('endTime', String(end));
}
params.set('limit', String(limit));
params.set('recvWindow', String(recvWindow));
params.set('timestamp', String(Date.now()));

const qs = params.toString();
// signature = HMAC-SHA256(queryString, secret) en hex, appendée en fin de query
const signature = crypto.createHmac('sha256', API_SECRET).update(qs).digest('hex');
const path = `/sapi/v1/pay/transactions?${qs}&signature=${signature}`;

console.log('\n🔍 Sonde Binance Pay — GET /sapi/v1/pay/transactions');
console.log(`   base       : ${BASE}`);
console.log(`   clé API    : ${mask(API_KEY)} (lecture seule attendue)`);
console.log(`   fenêtre    : ${days > 0 ? days + ' jours' : '90 jours (défaut Binance)'}  ·  limit ${limit}`);
console.log('   …appel en cours\n');

const url = new URL(BASE);
const options = {
  hostname: url.hostname,
  path,
  method: 'GET',
  headers: { 'X-MBX-APIKEY': API_KEY },
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (c) => (body += c));
  res.on('end', () => {
    let json;
    try {
      json = JSON.parse(body);
    } catch {
      console.error(`⚠️ Réponse non-JSON (HTTP ${res.statusCode}) :\n${body.slice(0, 400)}`);
      process.exit(2);
    }

    // Erreurs Binance classiques
    if (res.statusCode !== 200 || json.code === undefined) {
      diagnoseError(res.statusCode, json);
      return;
    }
    if (typeof json.code === 'string' && json.code !== '000000') {
      console.error(`❌ Binance code=${json.code} — ${json.message || '(sans message)'}`);
      process.exit(2);
    }

    const data = Array.isArray(json.data) ? json.data : [];
    console.log(`✅ Réponse OK  ·  success=${json.success}  ·  transactions=${data.length}\n`);

    if (data.length === 0) {
      console.log('🟠 data:[] — VERDICT : l’API Pay ne remonte PAS les transferts sur ce compte.');
      console.log('   → Bascule sur l’Option B (forwarder de notifications Binance).');
      console.log('   (Vérifie quand même : as-tu bien reçu un C2C récemment ? clé « Enable Reading » + IP autorisée ?)\n');
      return;
    }

    console.log('🟢 VERDICT : l’API renvoie des transactions — l’auto-crédit par polling est FAISABLE.\n');
    for (const t of data.slice(0, 20)) {
      const sign = String(t.amount).startsWith('-') ? 'DÉPENSE' : 'REÇU';
      const payer = t.payerInfo ? (t.payerInfo.name || t.payerInfo.binanceId || '—') : '—';
      console.log(
        `• ${fmtTime(t.transactionTime)}  [${t.orderType}]  ${sign}  ${t.amount} ${t.currency}` +
        `  · txId=${t.transactionId}  · de=${payer}`,
      );
    }
    console.log(
      '\n👉 Note les champs utiles pour le rapprochement : orderType (chercher "C2C"),' +
      ' transactionId (= txId à matcher), amount (+=reçu), currency, payerInfo.\n',
    );
  });
});

req.on('error', (e) => {
  console.error(`❌ Erreur réseau : ${e.message}`);
  process.exit(2);
});
req.end();

function diagnoseError(status, json) {
  const code = json && json.code;
  console.error(`❌ HTTP ${status}  ·  code=${code}  ·  ${json && json.msg ? json.msg : JSON.stringify(json).slice(0, 200)}`);
  const hints = {
    '-1022': 'Signature invalide — le secret ou l’ordre des paramètres ne correspond pas.',
    '-2014': 'Format de clé API invalide.',
    '-2015': 'Clé invalide, permission absente, ou IP non autorisée → vérifie « Enable Reading » + la restriction d’IP.',
    '-1021': 'Timestamp hors fenêtre — horloge locale désynchronisée (augmente --recvWindow ou synchronise l’heure).',
    '-1102': 'Paramètre obligatoire manquant/mal formé.',
  };
  if (code && hints[String(code)]) console.error(`   ↳ ${hints[String(code)]}`);
  process.exit(2);
}
