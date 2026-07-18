import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Firestore } from 'firebase-admin/firestore';
import { requireAdmin, callOpts } from './lib/guards';
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';

/**
 * Passkeys WebAuthn pour l'accès au back-office (step-up). Réservé aux admins (requireAdmin).
 * Stocke : webauthn_challenges/{uid} (défi éphémère), users/{uid}/passkeys/{credId} (clé publique
 * + compteur anti-rejeu), admin_stepup/{uid} (fenêtre de validité après vérification).
 * RP_ID = domaine servant l'app (sans protocole). ⚠️ à changer si domaine custom.
 */
const RP_ID = process.env.WEBAUTHN_RP_ID || 'thie-thie-services.web.app';
const RP_NAME = 'Thie Thie Services';
const ORIGIN = process.env.WEBAUTHN_ORIGIN || 'https://thie-thie-services.web.app';
const STEPUP_MINUTES = 30;

const credsCol = (db: Firestore, uid: string) => db.collection('users').doc(uid).collection('passkeys');

export const passkeyStatus = onCall(callOpts, async (req) => {
  const admin = requireAdmin(req);
  const snap = await credsCol(getFirestore(), admin.uid).get();
  return { hasPasskey: !snap.empty, count: snap.size };
});

export const passkeyRegisterOptions = onCall(callOpts, async (req) => {
  const admin = requireAdmin(req);
  const db = getFirestore();
  const existing = await credsCol(db, admin.uid).get();
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(admin.uid),
    userName: String(req.auth?.token?.email ?? admin.uid),
    attestationType: 'none',
    excludeCredentials: existing.docs.map((d) => ({ id: d.id })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });
  await db.doc(`webauthn_challenges/${admin.uid}`).set({ challenge: options.challenge, type: 'reg', createdAt: FieldValue.serverTimestamp() });
  return options;
});

export const passkeyRegisterVerify = onCall(callOpts, async (req) => {
  const admin = requireAdmin(req);
  const db = getFirestore();
  const ch = await db.doc(`webauthn_challenges/${admin.uid}`).get();
  const expectedChallenge = ch.get('challenge') as string | undefined;
  if (!expectedChallenge || ch.get('type') !== 'reg') throw new HttpsError('failed-precondition', 'défi de création absent');
  const verification = await verifyRegistrationResponse({
    response: req.data?.response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  });
  if (!verification.verified || !verification.registrationInfo) throw new HttpsError('invalid-argument', 'création du passkey non vérifiée');
  const cred = verification.registrationInfo.credential;
  await credsCol(db, admin.uid).doc(cred.id).set({
    publicKey: Buffer.from(cred.publicKey).toString('base64url'),
    counter: cred.counter,
    transports: cred.transports ?? [],
    createdAt: FieldValue.serverTimestamp(),
  });
  await db.doc(`webauthn_challenges/${admin.uid}`).delete();
  return { ok: true };
});

export const passkeyAuthOptions = onCall(callOpts, async (req) => {
  const admin = requireAdmin(req);
  const db = getFirestore();
  const creds = await credsCol(db, admin.uid).get();
  if (creds.empty) throw new HttpsError('failed-precondition', 'aucun passkey enregistré');
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: creds.docs.map((d) => ({ id: d.id, transports: d.get('transports') ?? [] })),
    userVerification: 'preferred',
  });
  await db.doc(`webauthn_challenges/${admin.uid}`).set({ challenge: options.challenge, type: 'auth', createdAt: FieldValue.serverTimestamp() });
  return options;
});

export const passkeyAuthVerify = onCall(callOpts, async (req) => {
  const admin = requireAdmin(req);
  const db = getFirestore();
  const ch = await db.doc(`webauthn_challenges/${admin.uid}`).get();
  const expectedChallenge = ch.get('challenge') as string | undefined;
  if (!expectedChallenge || ch.get('type') !== 'auth') throw new HttpsError('failed-precondition', 'défi d\'authentification absent');
  const credId = String(req.data?.response?.id ?? '');
  const credDoc = await credsCol(db, admin.uid).doc(credId).get();
  if (!credDoc.exists) throw new HttpsError('not-found', 'passkey inconnu');
  const verification = await verifyAuthenticationResponse({
    response: req.data?.response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    credential: {
      id: credId,
      publicKey: new Uint8Array(Buffer.from(credDoc.get('publicKey') as string, 'base64url')),
      counter: (credDoc.get('counter') as number) ?? 0,
      transports: credDoc.get('transports') ?? [],
    },
  });
  if (!verification.verified) throw new HttpsError('unauthenticated', 'authentification passkey non vérifiée');
  await credDoc.ref.update({ counter: verification.authenticationInfo.newCounter });
  await db.doc(`webauthn_challenges/${admin.uid}`).delete();
  const until = Date.now() + STEPUP_MINUTES * 60 * 1000;
  await db.doc(`admin_stepup/${admin.uid}`).set({ until });
  return { ok: true, until };
});
