import { httpsCallable } from 'firebase/functions';
import { functionsClient } from '../firebase';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

/**
 * Passkeys WebAuthn (back-office). Les défis et la vérification sont côté serveur
 * (Cloud Functions requireAdmin). Le passkey est stocké par le gestionnaire du navigateur
 * (Google Password Manager / iCloud Trousseau / 1Password…). Un step-up réussi débloque
 * les actions admin sensibles (30 min, appliqué SERVEUR via requireStepUp).
 */
const call = <T = any>(name: string, data?: any): Promise<T> =>
  httpsCallable<any, T>(functionsClient, name)(data).then((r) => r.data);

export function getPasskeyStatus(): Promise<{ hasPasskey: boolean; count: number }> {
  return call('passkeyStatus');
}

export async function enrollPasskey(): Promise<{ ok: boolean }> {
  const options = await call<any>('passkeyRegisterOptions');
  const response = await startRegistration({ optionsJSON: options });
  return call('passkeyRegisterVerify', { response });
}

export async function verifyPasskey(): Promise<{ ok: boolean; until: number }> {
  const options = await call<any>('passkeyAuthOptions');
  const response = await startAuthentication({ optionsJSON: options });
  return call('passkeyAuthVerify', { response });
}
