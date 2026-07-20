import { Fragment, useState } from 'react';
import { Check, Copy, Eye, EyeOff, Ticket } from 'lucide-react';

/**
 * Contenu livré d'une commande, affiché DANS le compte du client.
 *
 * Pourquoi ce composant existe : jusqu'ici le code n'était transmis que par e-mail, et le
 * client ne le voyait nulle part dans son espace. Un e-mail qui n'arrive pas — filtre
 * anti-spam, adresse erronée, expéditeur non vérifié — signifiait une commande payée et
 * jamais reçue, sans recours. Le compte devient la source de vérité ; l'e-mail n'est plus
 * qu'une commodité.
 *
 * Les identifiants sont MASQUÉS par défaut. Un code de carte cadeau est un titre au porteur :
 * quiconque le lit peut l'utiliser. L'afficher d'office dans une liste de commandes
 * l'exposerait à toute personne regardant l'écran par-dessus l'épaule.
 */

interface DeliveredField {
  label: string;
  value: string;
  /** Un numéro de carte n'est pas secret au même titre qu'un PIN : il n'est pas masqué. */
  sensitive?: boolean;
}

interface CopyableFieldProps {
  field: DeliveredField;
  lang: 'FR' | 'HT';
}

function CopyableField({ field, lang }: CopyableFieldProps) {
  const [revealed, setRevealed] = useState(!field.sensitive);
  const [copied, setCopied] = useState(false);
  const t = (fr: string, ht: string) => (lang === 'FR' ? fr : ht);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(field.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refusé (contexte non sécurisé, permission) : on révèle au moins la valeur
      // pour que le client puisse la recopier à la main plutôt que de rester bloqué.
      setRevealed(true);
    }
  };

  return (
    <div className="flex items-center gap-2 bg-[var(--tt-surface-2)] border border-[var(--tt-border)] rounded-xl px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[9px] uppercase tracking-widest font-black text-[var(--tt-text-faint)]">
          {field.label}
        </p>
        <p className="text-sm font-bold text-[var(--tt-text)] font-mono truncate tabular-nums">
          {revealed ? field.value : '•'.repeat(Math.min(field.value.length, 16))}
        </p>
      </div>

      {field.sensitive && (
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          aria-label={revealed ? t('Masquer', 'Kache') : t('Afficher', 'Montre')}
          className="p-2 rounded-lg text-[var(--tt-text-muted)] hover:text-[var(--tt-text)] hover:bg-[var(--tt-surface-3)] transition-colors"
        >
          {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      )}

      <button
        type="button"
        onClick={copy}
        aria-label={t('Copier', 'Kopye')}
        className="p-2 rounded-lg text-[var(--tt-text-muted)] hover:text-[var(--tt-text)] hover:bg-[var(--tt-surface-3)] transition-colors"
      >
        {copied
          ? <Check className="w-4 h-4 text-[var(--tt-good)]" />
          : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}

export function DeliveryPanel({ order, lang }: { order: any; lang: 'FR' | 'HT' }) {
  const t = (fr: string, ht: string) => (lang === 'FR' ? fr : ht);

  // Les commandes livrées avant la séparation PIN / numéro n'ont que `deliveryCode` :
  // on retombe dessus pour qu'elles restent lisibles.
  const fields: DeliveredField[] = [];
  if (order.deliveryCardNumber) {
    fields.push({ label: t('Numéro de carte', 'Nimewo kat la'), value: String(order.deliveryCardNumber) });
  }
  if (order.deliveryPin) {
    fields.push({ label: t('Code PIN', 'Kòd PIN'), value: String(order.deliveryPin), sensitive: true });
  }
  if (!fields.length && order.deliveryCode) {
    fields.push({ label: t('Code de recharge', 'Kòd rechaj la'), value: String(order.deliveryCode), sensitive: true });
  }
  if (order.playerId) {
    fields.push({ label: t('Identifiant joueur', 'Idantifyan jwè'), value: String(order.playerId) });
  }

  if (!fields.length) return null;

  return (
    <section
      aria-label={t('Contenu de la commande', 'Kontni kòmand lan')}
      className="mt-3 rounded-2xl border border-[var(--tt-good)]/30 bg-[var(--tt-good-soft)] p-3.5"
    >
      <div className="flex items-center gap-2 mb-2.5">
        <Ticket className="w-4 h-4 text-[var(--tt-good)]" aria-hidden="true" />
        <h4 className="text-[11px] font-black uppercase tracking-widest text-[var(--tt-good)]">
          {t('Votre commande est livrée', 'Kòmand ou an livre')}
        </h4>
      </div>

      <div className="flex flex-col gap-2">
        {/* La `key` est portée par un Fragment : ce projet n'a pas @types/react, donc
            TypeScript ne sait pas que `key` est une prop réservée et la refuse sur un
            composant typé. Le Fragment ne crée aucun nœud DOM — l'espacement flex du
            parent s'applique donc toujours aux champs eux-mêmes. */}
        {fields.map((f) => (
          <Fragment key={f.label}>
            <CopyableField field={f} lang={lang} />
          </Fragment>
        ))}
      </div>

      {order.deliveryInstructions && (
        <p className="mt-2.5 text-[11px] leading-relaxed text-[var(--tt-text-muted)]">
          {String(order.deliveryInstructions)}
        </p>
      )}

      <p className="mt-2.5 text-[10px] leading-relaxed text-[var(--tt-text-faint)]">
        {t(
          'Conservez ces informations : elles restent disponibles ici à tout moment. Ne les partagez avec personne — quiconque les détient peut utiliser la recharge.',
          'Kenbe enfòmasyon sa yo : yo rete disponib isit la nenpòt lè. Pa pataje yo ak pèsòn — nenpòt moun ki genyen yo ka itilize rechaj la.',
        )}
      </p>
    </section>
  );
}
