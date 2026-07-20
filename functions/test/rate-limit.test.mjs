// Limiteur de débit des webhooks publics (ingestSms / ingestOxapayCallback).
// Exécuter après build ; via l'émulateur Firestore (npm run test:functions).
import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { consumeRateLimit, clientIp } from '../lib/lib/rate-limit.js';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const app = initializeApp({ projectId: 'thie-thie-rl-test' }, 'ratelimit');
const db = getFirestore(app);

async function clearAll() {
  await db.recursiveDelete(db.collection('rate_limits'));
}
beforeEach(clearAll);
after(clearAll);

const RULE = { limit: 3, windowSec: 60 };

describe('consumeRateLimit — fenêtre fixe', () => {
  test('laisse passer jusqu\'à la limite, puis bloque', async () => {
    for (let i = 1; i <= RULE.limit; i++) {
      const r = await consumeRateLimit(db, 'ip:1.2.3.4', RULE);
      assert.equal(r.allowed, true, `requête ${i} devrait passer`);
      assert.equal(r.remaining, RULE.limit - i);
    }
    const blocked = await consumeRateLimit(db, 'ip:1.2.3.4', RULE);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.retryAfterSec > 0 && blocked.retryAfterSec <= RULE.windowSec);
  });

  test('les clés sont indépendantes : une IP saturée n\'en bloque pas une autre', async () => {
    for (let i = 0; i < RULE.limit; i++) await consumeRateLimit(db, 'ip:1.1.1.1', RULE);
    assert.equal((await consumeRateLimit(db, 'ip:1.1.1.1', RULE)).allowed, false);
    assert.equal((await consumeRateLimit(db, 'ip:2.2.2.2', RULE)).allowed, true);
  });

  test('la fenêtre écoulée remet le compteur à zéro', async () => {
    const t0 = Date.now();
    for (let i = 0; i < RULE.limit; i++) await consumeRateLimit(db, 'ip:3.3.3.3', RULE, t0);
    assert.equal((await consumeRateLimit(db, 'ip:3.3.3.3', RULE, t0)).allowed, false);

    // Horloge injectée : juste après la fin de la fenêtre.
    const after = t0 + RULE.windowSec * 1000 + 1;
    const r = await consumeRateLimit(db, 'ip:3.3.3.3', RULE, after);
    assert.equal(r.allowed, true);
    assert.equal(r.remaining, RULE.limit - 1);
  });

  test('une tentative refusée ne prolonge PAS la fenêtre (pas de blocage perpétuel)', async () => {
    const t0 = Date.now();
    for (let i = 0; i < RULE.limit; i++) await consumeRateLimit(db, 'ip:4.4.4.4', RULE, t0);
    // Flood pendant la fenêtre : refusé, et sans repousser windowStart.
    const mid = t0 + 30_000;
    assert.equal((await consumeRateLimit(db, 'ip:4.4.4.4', RULE, mid)).allowed, false);
    const snap = await db.doc('rate_limits/ip:4.4.4.4').get();
    assert.equal(Number(snap.get('windowStart')), t0);
    assert.equal(Number(snap.get('count')), RULE.limit); // les refus ne s'écrivent pas

    const after = t0 + RULE.windowSec * 1000 + 1;
    assert.equal((await consumeRateLimit(db, 'ip:4.4.4.4', RULE, after)).allowed, true);
  });

  test('le compteur est bien partagé (persisté), pas par instance', async () => {
    for (let i = 0; i < RULE.limit; i++) await consumeRateLimit(db, 'ip:5.5.5.5', RULE);
    // Deuxième handle Firestore = autre « instance » lisant le même état.
    const other = getFirestore(initializeApp({ projectId: 'thie-thie-rl-test' }, 'ratelimit2'));
    assert.equal((await consumeRateLimit(other, 'ip:5.5.5.5', RULE)).allowed, false);
  });

  test('une clé à caractères interdits ne casse pas l\'ID de document', async () => {
    const r = await consumeRateLimit(db, 'sms:authfail:a/b/../__x__', RULE);
    assert.equal(r.allowed, true);
  });

  test('pose expiresAt pour la purge TTL', async () => {
    await consumeRateLimit(db, 'ip:6.6.6.6', RULE);
    const snap = await db.doc('rate_limits/ip:6.6.6.6').get();
    assert.ok(snap.get('expiresAt'), 'expiresAt manquant → les documents ne seraient jamais purgés');
    assert.ok(snap.get('expiresAt').toMillis() > Date.now());
  });
});

describe('clientIp — anti-usurpation X-Forwarded-For', () => {
  const reqWith = (xff) => ({ header: (n) => (n === 'x-forwarded-for' ? xff : undefined), ip: '9.9.9.9' });

  test('prend la DERNIÈRE entrée (posée par le frontal), pas celle fournie par le client', () => {
    // Un attaquant qui préfixe une fausse IP ne doit pas obtenir un compteur neuf.
    assert.equal(clientIp(reqWith('1.1.1.1, 203.0.113.7')), '203.0.113.7');
    assert.equal(clientIp(reqWith('spoofed, autre, 203.0.113.7')), '203.0.113.7');
  });

  test('repli sur req.ip sans en-tête', () => {
    assert.equal(clientIp(reqWith(undefined)), '9.9.9.9');
  });
});
