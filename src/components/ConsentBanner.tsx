import { useEffect, useState } from 'react';
import { denyAnalytics, grantAndInit, initAnalytics, isAnalyticsConfigured, readConsent } from '../lib/analytics';

/**
 * Bandeau de consentement à la mesure d'audience.
 *
 * Le refus est traité comme un choix de premier rang : même poids visuel que l'acceptation,
 * pas de bouton grisé ni de croix ambiguë. Un bandeau qui rend le refus pénible n'est pas un
 * consentement, et c'est exactement ce qui fait tomber ce genre de dispositif.
 *
 * Ne s'affiche QUE si des identifiants de mesure sont configurés : sans eux, rien n'est chargé,
 * donc rien à consentir — inutile d'imposer une question sans objet.
 */
export function ConsentBanner({ lang }: { lang: 'FR' | 'HT' }) {
  const [visible, setVisible] = useState(false);
  const t = (fr: string, ht: string) => (lang === 'FR' ? fr : ht);

  useEffect(() => {
    if (!isAnalyticsConfigured()) return;
    const consent = readConsent();
    if (consent === 'granted') initAnalytics(); // visiteur déjà consentant : on recharge les scripts
    else if (consent === null) setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t('Consentement à la mesure d’audience', 'Konsantman pou mezi odyans')}
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-xl rounded-2xl border border-[var(--tt-border)] bg-[var(--tt-surface)] p-4 md:p-5"
      style={{ boxShadow: 'var(--tt-shadow)' }}
    >
      <p className="text-xs leading-relaxed text-[var(--tt-text-muted)]">
        {t(
          'Nous aimerions mesurer la fréquentation du site pour l’améliorer. Cela dépose des cookies et enregistre votre navigation de façon anonyme. Le site fonctionne normalement si vous refusez.',
          'Nou ta renmen mezire vizit sou sit la pou nou amelyore l. Sa depoze cookies epi anrejistre navigasyon ou anonimman. Sit la ap mache nòmalman si ou refize.',
        )}
      </p>
      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <button
          onClick={() => { denyAnalytics(); setVisible(false); }}
          className="flex-1 rounded-xl border border-[var(--tt-border)] px-4 py-2.5 text-xs font-bold text-[var(--tt-text)] hover:bg-[var(--tt-surface-2)] transition-colors"
        >
          {t('Refuser', 'Refize')}
        </button>
        <button
          onClick={() => { grantAndInit(); setVisible(false); }}
          className="flex-1 rounded-xl bg-[var(--tt-accent)] px-4 py-2.5 text-xs font-bold text-white hover:opacity-90 transition-opacity"
        >
          {t('Accepter', 'Aksepte')}
        </button>
      </div>
    </div>
  );
}
