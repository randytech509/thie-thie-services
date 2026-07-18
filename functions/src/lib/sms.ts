/**
 * Parsing des SMS de confirmation MonCash / NatCash (approche « SMS hook » : une app sur le
 * téléphone marchand lit le SMS entrant et le POST vers le webhook `ingestSms`).
 *
 * ⚠️ Les gabarits exacts varient selon l'opérateur/la langue → les regex ci-dessous sont
 * volontairement tolérantes et doivent être ajustées sur un VRAI SMS (cf. tests). Le rapprochement
 * exige de toute façon un txId + montant concordant avant tout auto-crédit (sinon repli manuel).
 */

export type SmsProvider = 'MonCash' | 'NatCash';
export type SmsDirection = 'in' | 'out' | 'other'; // reçu / envoyé / bruit (promo, OTP…)

export interface ParsedSms {
  provider: SmsProvider;
  direction: SmsDirection;     // SEUL 'in' peut créditer un dépôt
  amountCents: number | null;  // centimes HTG (montant de la transaction, pas le solde)
  txId: string | null;         // référence de transaction (idempotence)
  sender: string | null;       // numéro de l'expéditeur
  senderName: string | null;   // nom de l'expéditeur (si présent)
  balanceCents: number | null; // solde du compte marchand après opération (contexte)
  raw: string;
}

/** Sens : 'in' (reçu), 'out' (transféré/retiré/envoyé), 'other' (promo, OTP, notif). */
export function parseDirection(text: string): SmsDirection {
  if (/\bre[cç?]{1,2}u\b|received|resev[wè]/i.test(text)) return 'in';
  if (/transfer|transf[ée]r|retir[ée]|envoy|\bvoye\b|\bsent\b|d[ée]bit/i.test(text)) return 'out';
  return 'other';
}

/** Nom de l'expéditeur : après « de … » (FR) ou « nan … » (créole) jusqu'au numéro. */
export function parseSenderName(text: string): string | null {
  const m = text.match(/\b(?:de|nan)\s+(\p{Lu}[\p{L}'’.\- ]*?)\s+(?:\+?509[\s-]?)?\d{4,}/u);
  return m ? m[1].trim() : null;
}

/** Solde du compte marchand : « Votre solde / Your balance : X HTG ». */
export function parseBalanceCents(text: string): number | null {
  const m = text.match(/(?:solde|balans|balance)\s*(?:ou)?\s*:?\s*([\d][\d.,\s]*\d|\d)\s*(?:HTG|Gourdes?|Goud|\bG\b)/i);
  return m ? normalizeAmount(m[1]) : null;
}

/**
 * Montant HTG → centimes (entier). Gère la devise AVANT ("G1,100.00", "HTG 500") ou APRÈS
 * ("1,500 HTG", "45.5 Gourdes") le nombre, et l'ambiguïté virgule (milliers vs décimale) :
 *   - '.' ET ',' présents → ',' = séparateur de milliers ("1,100.00" → 1100.00)
 *   - ',' seule suivie de 3 chiffres → milliers ("1,500" → 1500) ; sinon décimale ("1 000,50" → 1000.50)
 */
function normalizeAmount(raw: string): number | null {
  let s = raw.replace(/\s/g, '');
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/,/g, '');                                  // "1,100.00" → virgule = milliers
  } else if (s.includes(',')) {
    const frac = s.split(',')[1] ?? '';
    s = frac.length === 3 ? s.replace(/,/g, '') : s.replace(',', '.'); // "1,500"→1500 ; "1000,50"→1000.50
  }
  const val = Number(s);
  if (!Number.isFinite(val) || val < 0) return null;
  return Math.round(val * 100);
}

export function parseHtgAmountToCents(text: string): number | null {
  // Tous les montants avec devise (devant OU derrière le nombre)
  const re = /(?:HTG|Gourdes?|Goud|G)\s*([\d][\d.,\s]*\d|\d)|([\d][\d.,\s]*\d|\d)\s*(?:HTG|Gourdes?|Goud|\bG\b)/gi;
  // On IGNORE tout montant précédé de « solde / balance » (= le solde du compte, pas la transaction)
  const isBalanceBefore = /(solde|balans|balance|\bbal\b)[^\d]{0,10}$/i;

  const found: { num: string; balance: boolean }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const num = m[1] ?? m[2];
    const before = text.slice(Math.max(0, m.index - 18), m.index);
    found.push({ num, balance: isBalanceBefore.test(before) });
  }
  const pick = found.find((f) => !f.balance) ?? found[0];
  return pick ? normalizeAmount(pick.num) : null;
}

/** Référence de transaction : après "TransCode/Txn ID/transaction/ref/#"… */
export function parseTxId(text: string): string | null {
  const m =
    text.match(/(?:transcode|transaction|tranzaksyon|txn(?:\s*id)?|reference|référence|ref|confirmation|code)\s*(?:no\.?|n[o°]?|#|id|:|=)*\s*([A-Za-z0-9]{5,})/i) ||
    text.match(/#\s*([A-Za-z0-9]{5,})/);
  return m ? m[1].toUpperCase() : null;
}

/** Numéro d'expéditeur haïtien (509 + 8 chiffres) ou séquence de 8 chiffres. */
export function parseSender(text: string): string | null {
  const m = text.match(/(?:\+?509[\s-]?)?(\d{4}[\s-]?\d{4})/);
  return m ? m[1].replace(/[\s-]/g, '') : null;
}

export function parseSms(provider: SmsProvider, raw: string): ParsedSms {
  const text = String(raw || '');
  return {
    provider,
    direction: parseDirection(text),
    amountCents: parseHtgAmountToCents(text),
    txId: parseTxId(text),
    sender: parseSender(text),
    senderName: parseSenderName(text),
    balanceCents: parseBalanceCents(text),
    raw: text,
  };
}
