/**
 * Envoi d'e-mails transactionnels via Resend (https://resend.com).
 * Dégradation gracieuse : sans RESEND_API_KEY (ou en cas d'échec), renvoie {sent:false, error}
 * — l'appelant décide (ex. marquer la commande livrée quand même, signaler à l'admin).
 * ⚠️ Tant qu'aucun domaine n'est vérifié dans Resend, RESEND_FROM=onboarding@resend.dev
 *    et l'envoi n'aboutit QU'À l'adresse du compte Resend (mode test).
 */

export interface SendResult {
  sent: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
  if (!apiKey) return { sent: false, error: 'RESEND_API_KEY absente' };
  if (!to) return { sent: false, error: 'destinataire vide' };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { sent: false, error: `Resend HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = (await res.json()) as { id?: string };
    return { sent: true, id: data.id };
  } catch (e) {
    return { sent: false, error: (e as Error).message };
  }
}

/** Template e-mail de livraison d'un code/PIN — charte Thie Thie (navy/orange), zéro émoji. */
export function orderDeliveryHtml(opts: {
  productName: string;
  optionLabel?: string | null;
  code: string;
  instructions?: string;
}): string {
  const esc = (s: string) =>
    String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  const produit = esc(opts.productName) + (opts.optionLabel ? ' — ' + esc(opts.optionLabel) : '');
  const instr = opts.instructions
    ? `<tr><td style="padding:0 32px 8px;color:#cbd5e1;font-size:14px;line-height:1.6;"><strong style="color:#fff;">Comment utiliser votre code :</strong><br>${esc(opts.instructions).replace(/\n/g, '<br>')}</td></tr>`
    : '';
  return (
    '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1.0"></head>' +
    '<body style="margin:0;padding:0;background:#0a0e27;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e27;padding:32px 16px;"><tr><td align="center">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#11162e;border-radius:16px;overflow:hidden;">' +
    '<tr><td style="background:linear-gradient(135deg,#1a2332 0%,#ff9800 180%);padding:36px 32px;text-align:center;">' +
    '<h1 style="margin:0;color:#fff;font-size:26px;font-weight:800;">Thie Thie Services</h1>' +
    '<p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:15px;">Votre commande est livrée</p></td></tr>' +
    `<tr><td style="padding:32px 32px 8px;color:#e5e7eb;font-size:16px;line-height:1.6;">Bonjour,<br>Merci pour votre achat. Voici votre code pour <strong style="color:#ff9800;">${produit}</strong> :</td></tr>` +
    `<tr><td style="padding:8px 32px 20px;"><div style="background:#0a0e27;border:1px dashed #ff9800;border-radius:12px;padding:20px;text-align:center;"><span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:2px;font-family:monospace;">${esc(opts.code)}</span></div></td></tr>` +
    instr +
    '<tr><td style="padding:16px 32px 8px;color:#94a3b8;font-size:13px;line-height:1.6;">Rappel : les produits numériques sont non remboursables une fois le code envoyé. Pour les cartes cadeaux, vérifiez la région de votre compte avant utilisation.</td></tr>' +
    '<tr><td style="padding:16px 32px 28px;color:#64748b;font-size:12px;border-top:1px solid rgba(255,255,255,0.06);">Besoin d\'aide ? Répondez à cet e-mail ou contactez notre support. — Thie Thie Services</td></tr>' +
    '</table></td></tr></table></body></html>'
  );
}
