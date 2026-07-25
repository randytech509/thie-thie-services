import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { consumeRateLimit, RateLimitRule } from './rate-limit';
import { sendEmail as defaultSendEmail, SendResult } from './email';

/**
 * Cœur (testable) du formulaire de contact — séparé de l'enveloppe onCall pour pouvoir être
 * exercé directement sur l'émulateur Firestore, sans mock de CallableRequest/App Check.
 *
 * Invariants :
 *  - le message est TOUJOURS stocké dans `contact_messages` avant toute tentative d'e-mail
 *    (filet de sécurité : rien n'est perdu même si l'envoi n'est pas configuré ou échoue) ;
 *  - l'e-mail n'est tenté que si une adresse support est fournie (`deps.supportEmail`) ;
 *  - le mailer est injectable (`deps.mailer`) pour les tests — défaut = Resend (sendEmail).
 */

export const CONTACT_RULE: RateLimitRule = { limit: 5, windowSec: 3600 }; // 5 messages / heure / appelant

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ContactError extends Error {
  constructor(public code: 'invalid-argument' | 'resource-exhausted', message: string) {
    super(message);
    this.name = 'ContactError';
  }
}

export interface ContactInput {
  name?: unknown;
  email?: unknown;
  subject?: unknown;
  message?: unknown;
  lang?: unknown;
  uid?: string | null;
}

export type Mailer = (to: string, subject: string, html: string, opts?: { replyTo?: string }) => Promise<SendResult>;

export interface ContactDeps {
  supportEmail?: string;
  mailer?: Mailer;
  now?: number;
}

const esc = (s: string): string =>
  String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function contactEmailHtml(opts: { name: string; email: string; subject: string; message: string }): string {
  const subject = opts.subject ? esc(opts.subject) : 'Sans objet';
  return (
    '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1.0"></head>' +
    '<body style="margin:0;padding:0;background:#0a0e27;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e27;padding:32px 16px;"><tr><td align="center">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#11162e;border-radius:16px;overflow:hidden;">' +
    '<tr><td style="background:linear-gradient(135deg,#1a2332 0%,#a855f7 200%);padding:28px 32px;">' +
    '<h1 style="margin:0;color:#fff;font-size:20px;font-weight:800;">Nouveau message de contact</h1>' +
    '<p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Thie Thie Services — formulaire de support</p></td></tr>' +
    '<tr><td style="padding:24px 32px 4px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Objet</td></tr>' +
    `<tr><td style="padding:0 32px 12px;color:#fff;font-size:16px;font-weight:700;">${subject}</td></tr>` +
    '<tr><td style="padding:8px 32px 4px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Expéditeur</td></tr>' +
    `<tr><td style="padding:0 32px 12px;color:#e5e7eb;font-size:15px;">${esc(opts.name)} &lt;<a href="mailto:${esc(opts.email)}" style="color:#a855f7;">${esc(opts.email)}</a>&gt;</td></tr>` +
    '<tr><td style="padding:8px 32px 4px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Message</td></tr>' +
    `<tr><td style="padding:0 32px 24px;color:#e5e7eb;font-size:15px;line-height:1.6;white-space:pre-wrap;">${esc(opts.message).replace(/\n/g, '<br>')}</td></tr>` +
    '<tr><td style="padding:16px 32px 24px;color:#64748b;font-size:12px;border-top:1px solid rgba(255,255,255,0.06);">Répondez directement à cet e-mail pour contacter le client.</td></tr>' +
    '</table></td></tr></table></body></html>'
  );
}

export interface ContactResult {
  ok: true;
  emailSent: boolean;
  id: string;
}

export async function handleContactSubmission(db: Firestore, input: ContactInput, deps: ContactDeps = {}): Promise<ContactResult> {
  const name = String(input.name ?? '').trim().slice(0, 120);
  const email = String(input.email ?? '').trim().slice(0, 200);
  const subject = String(input.subject ?? '').trim().slice(0, 160);
  const message = String(input.message ?? '').trim().slice(0, 4000);
  const lang = input.lang === 'HT' ? 'HT' : 'FR';
  const uid = input.uid ?? null;

  if (!name || !email || !message) throw new ContactError('invalid-argument', 'Nom, e-mail et message requis.');
  if (!EMAIL_RE.test(email)) throw new ContactError('invalid-argument', 'Adresse e-mail invalide.');
  if (message.length < 5) throw new ContactError('invalid-argument', 'Message trop court.');

  // Rate-limit : par uid si connecté, sinon un seau « anonyme » commun.
  const rl = await consumeRateLimit(db, `contact:${uid ?? 'anon'}`, CONTACT_RULE, deps.now);
  if (!rl.allowed) throw new ContactError('resource-exhausted', 'Trop de messages envoyés. Réessayez dans un moment.');

  // 1. Filet de sécurité : on enregistre TOUJOURS, avant toute tentative d'e-mail.
  const ref = await db.collection('contact_messages').add({
    name,
    email,
    subject: subject || null,
    message,
    lang,
    uid,
    status: 'new',
    emailSent: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  // 2. Envoi vers la boîte pro dédiée — uniquement si une adresse support est configurée.
  const to = deps.supportEmail || '';
  const mailer = deps.mailer ?? defaultSendEmail;
  let emailSent = false;
  if (to) {
    const res = await mailer(
      to,
      `[Contact] ${subject || 'Nouveau message'} — ${name}`,
      contactEmailHtml({ name, email, subject, message }),
      { replyTo: email },
    );
    emailSent = res.sent;
    await ref.update(res.sent ? { emailSent: true, emailId: res.id ?? null } : { emailError: res.error ?? 'inconnu' });
  } else {
    await ref.update({ emailError: 'SUPPORT_EMAIL non configuré' });
  }

  return { ok: true, emailSent, id: ref.id };
}
