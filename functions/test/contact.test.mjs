// Tests d'intégration du formulaire de contact sur l'émulateur Firestore.
// Importe la lib COMPILÉE (../lib) — exécuter après `npm run build`.
// Lancé via `firebase emulators:exec --only firestore` (cf. root `npm run test:functions`).
import { test, beforeEach, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { handleContactSubmission, ContactError, CONTACT_RULE } from '../lib/lib/contact-core.js';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

const app = initializeApp({ projectId: 'thie-thie-contact-test' });
const db = getFirestore(app);

async function clearAll() {
  await db.recursiveDelete(db.collection('contact_messages'));
  await db.recursiveDelete(db.collection('rate_limits'));
}

beforeEach(clearAll);
after(clearAll);

const VALID = { name: 'Jean Baptiste', email: 'jean@example.com', message: 'Bonjour, une question sur ma commande.' };

async function countMessages() {
  return (await db.collection('contact_messages').get()).size;
}

/** Mailer factice : enregistre l'appel et renvoie le résultat programmé. */
function fakeMailer(result) {
  const calls = [];
  const mailer = async (to, subject, html, opts) => {
    calls.push({ to, subject, html, opts });
    return result;
  };
  return { mailer, calls };
}

describe('handleContactSubmission — validation', () => {
  test('champ manquant (message vide) → invalid-argument, RIEN stocké', async () => {
    await assert.rejects(
      () => handleContactSubmission(db, { ...VALID, message: '' }),
      (e) => e instanceof ContactError && e.code === 'invalid-argument',
    );
    assert.equal(await countMessages(), 0);
  });

  test('e-mail invalide → invalid-argument, RIEN stocké', async () => {
    await assert.rejects(
      () => handleContactSubmission(db, { ...VALID, email: 'pasunemail' }),
      (e) => e instanceof ContactError && e.code === 'invalid-argument',
    );
    assert.equal(await countMessages(), 0);
  });

  test('message trop court (< 5) → invalid-argument', async () => {
    await assert.rejects(
      () => handleContactSubmission(db, { ...VALID, message: 'hi' }),
      (e) => e instanceof ContactError && e.code === 'invalid-argument',
    );
    assert.equal(await countMessages(), 0);
  });
});

describe('handleContactSubmission — stockage (filet de sécurité)', () => {
  test('sans SUPPORT_EMAIL : message stocké, emailSent=false, emailError renseigné', async () => {
    const res = await handleContactSubmission(db, VALID); // pas de supportEmail
    assert.equal(res.ok, true);
    assert.equal(res.emailSent, false);

    const snap = await db.collection('contact_messages').get();
    assert.equal(snap.size, 1);
    const d = snap.docs[0].data();
    assert.equal(d.name, VALID.name);
    assert.equal(d.email, VALID.email);
    assert.equal(d.message, VALID.message);
    assert.equal(d.status, 'new');
    assert.equal(d.emailSent, false);
    assert.equal(d.uid, null);
    assert.equal(d.emailError, 'SUPPORT_EMAIL non configuré');
  });

  test('champs tronqués/nettoyés (trim + slice) et lang par défaut FR', async () => {
    const res = await handleContactSubmission(db, {
      name: '  Marie  ',
      email: '  marie@example.com  ',
      message: '  Un message valide ici.  ',
      lang: 'ZZ',
    });
    const d = (await db.doc(`contact_messages/${res.id}`).get()).data();
    assert.equal(d.name, 'Marie');
    assert.equal(d.email, 'marie@example.com');
    assert.equal(d.message, 'Un message valide ici.');
    assert.equal(d.lang, 'FR');
  });
});

describe('handleContactSubmission — envoi e-mail', () => {
  test('SUPPORT_EMAIL configuré + mailer OK → emailSent=true, doc.emailSent=true, replyTo=client', async () => {
    const { mailer, calls } = fakeMailer({ sent: true, id: 'em_123' });
    const res = await handleContactSubmission(db, VALID, { supportEmail: 'support@pro.example', mailer });

    assert.equal(res.emailSent, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].to, 'support@pro.example');
    assert.equal(calls[0].opts.replyTo, VALID.email); // le support répond au client
    assert.match(calls[0].subject, /\[Contact\]/);

    const d = (await db.doc(`contact_messages/${res.id}`).get()).data();
    assert.equal(d.emailSent, true);
    assert.equal(d.emailId, 'em_123');
  });

  test('mailer en échec → emailSent=false, doc.emailError renseigné (message conservé)', async () => {
    const { mailer } = fakeMailer({ sent: false, error: 'Resend HTTP 403' });
    const res = await handleContactSubmission(db, VALID, { supportEmail: 'support@pro.example', mailer });

    assert.equal(res.emailSent, false);
    const d = (await db.doc(`contact_messages/${res.id}`).get()).data();
    assert.equal(d.emailSent, false);
    assert.equal(d.emailError, 'Resend HTTP 403');
  });
});

describe('handleContactSubmission — rate-limit', () => {
  test(`bloque après ${CONTACT_RULE.limit} messages dans la fenêtre (anon)`, async () => {
    for (let i = 0; i < CONTACT_RULE.limit; i++) {
      const r = await handleContactSubmission(db, { ...VALID, message: `Message numéro ${i} valide.` });
      assert.equal(r.ok, true);
    }
    // Le (limit+1)-ème doit être refusé.
    await assert.rejects(
      () => handleContactSubmission(db, VALID),
      (e) => e instanceof ContactError && e.code === 'resource-exhausted',
    );
    // Seuls les messages autorisés ont été stockés.
    assert.equal(await countMessages(), CONTACT_RULE.limit);
  });

  test('un uid connecté a son propre seau (indépendant de l’anonyme)', async () => {
    // Sature l'anonyme.
    for (let i = 0; i < CONTACT_RULE.limit; i++) {
      await handleContactSubmission(db, { ...VALID, message: `Anon ${i} message valide.` });
    }
    await assert.rejects(() => handleContactSubmission(db, VALID));
    // Un utilisateur connecté passe quand même.
    const r = await handleContactSubmission(db, { ...VALID, uid: 'userX', message: 'Message utilisateur connecté.' });
    assert.equal(r.ok, true);
  });
});
