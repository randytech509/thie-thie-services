import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { ThieThieLogo } from './ThieThieLogo';

/**
 * « À propos de l'application » — bloc d'identité en bas de la page À Propos.
 *
 * Ce qui n'y figure PAS, volontairement : la pile technique (base de données, hébergeur).
 * Elle n'appartient pas à la marque Thie Thie, et annoncer publiquement son moteur de
 * stockage revient à offrir de la reconnaissance gratuite à qui cherche une surface
 * d'attaque. Une page « à propos » parle du produit, pas de son infrastructure.
 */

/** Tenu à la main : c'est la version de la PLATEFORME, pas celle du package npm. */
const APP_VERSION = '3.2.0';
const APP_CHANNEL = 'Stable';
const PORTFOLIO_URL = 'https://randytech-agency.com';

interface AppInfoSectionProps {
  lang: 'FR' | 'HT';
}

export function AppInfoSection({ lang }: AppInfoSectionProps) {
  const t = (fr: string, ht: string) => (lang === 'FR' ? fr : ht);

  const rows: { label: string; value: ReactNode }[] = [
    {
      label: t("Version de l'application", 'Vèsyon aplikasyon an'),
      value: (
        <span className="inline-flex items-center gap-2">
          <span className="tabular-nums font-bold">{APP_VERSION}</span>
          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[var(--tt-good-soft)] text-[var(--tt-good)]">
            {APP_CHANNEL}
          </span>
        </span>
      ),
    },
    {
      label: t('Développement', 'Devlopman'),
      value: <span className="font-bold">Thie Thie Pro Team</span>,
    },
  ];

  return (
    <section
      aria-labelledby="app-info-title"
      className="mt-8 bg-[var(--tt-surface)] border border-[var(--tt-border)] rounded-2xl p-6 md:p-8 text-center"
    >
      <div className="flex justify-center mb-4">
        <ThieThieLogo variant="icon" size={84} />
      </div>

      <h3 id="app-info-title" className="text-lg font-black text-[var(--tt-text)]">
        Thie Thie Services
      </h3>

      <p className="mt-3 mx-auto max-w-md text-xs md:text-sm leading-relaxed text-[var(--tt-text-muted)]">
        {t(
          'La plateforme de recharge de jeux vidéo et de services de streaming la plus rapide et fiable en Haïti.',
          'Platfòm rechaj jwèt videyo ak sèvis streaming ki pi rapid e pi serye an Ayiti.',
        )}
      </p>

      <dl className="mt-7 mx-auto max-w-md text-left divide-y divide-[var(--tt-border)]">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4 py-3.5">
            <dt className="text-xs font-semibold text-[var(--tt-text-faint)]">{r.label}</dt>
            <dd className="text-sm text-[var(--tt-text)]">{r.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-7 pt-6 border-t border-[var(--tt-border)]">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--tt-text-faint)]">
          {t('Propulsé par', 'Pwopilse pa')}
        </p>
        {/* Lien suivable à dessein : c'est le backlink du portfolio. Surtout pas de
            rel="nofollow", qui en annulerait tout l'intérêt de référencement. */}
        <a
          href={PORTFOLIO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--tt-accent)] hover:underline focus-visible:underline"
        >
          RandyTech Solutions
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="sr-only">{t('(nouvel onglet)', '(nouvo onglè)')}</span>
        </a>
      </div>
    </section>
  );
}
