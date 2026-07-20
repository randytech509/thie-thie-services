import { useId } from 'react';

/**
 * Icônes de statut — SVG ORIGINAUX, dessinés ici.
 *
 * Pourquoi pas une banque d'icônes (Flaticon & co) : leurs fichiers sont sous licence
 * propriétaire (attribution obligatoire ou abonnement) et les embarquer dans un dépôt
 * public engage juridiquement. Ceux-ci sont écrits à la main, donc libres d'usage.
 *
 * Pourquoi pas une requête réseau : un badge d'identité doit s'afficher instantanément et
 * hors ligne. Tout est inline — aucune requête, aucun CDN, aucun décalage de mise en page.
 *
 * Chaque dégradé reçoit un identifiant unique via useId() : deux badges sur la même page
 * partageraient sinon le même id, et le second écraserait le dégradé du premier.
 */

interface IconProps {
  className?: string;
  /** Rendu plat (couleur héritée) au lieu du dégradé — utile sur fond coloré. */
  flat?: boolean;
}

/** Bouclier — rôle administrateur. Le liseré clair simule une lumière rasante. */
export function AdminShieldIcon({ className = 'w-3.5 h-3.5', flat = false }: IconProps) {
  const id = useId();
  const g = `admin-${id}`;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="12" y1="1.5" x2="12" y2="22.5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#c084fc" />
          <stop offset="55%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <path
        d="M12 1.8 4.4 5v6.4c0 4.6 3.1 8.9 7.6 10.8 4.5-1.9 7.6-6.2 7.6-10.8V5L12 1.8Z"
        fill={flat ? 'currentColor' : `url(#${g})`}
      />
      {/* Reflet : bande claire sur la moitié gauche, pour donner du volume */}
      <path d="M12 1.8 4.4 5v6.4c0 3 1.3 5.9 3.4 8V3.6L12 1.8Z" fill="#fff" opacity="0.18" />
      {/* Étoile centrale, en négatif */}
      <path
        d="M12 7.4l1.36 2.76 3.04.44-2.2 2.15.52 3.03L12 14.35l-2.72 1.43.52-3.03-2.2-2.15 3.04-.44L12 7.4Z"
        fill="#fff"
        opacity="0.95"
      />
    </svg>
  );
}

/** Sceau festonné — identité vérifiée. La forme évoque une médaille officielle. */
export function VerifiedSealIcon({ className = 'w-3.5 h-3.5', flat = false }: IconProps) {
  const id = useId();
  const g = `verified-${id}`;
  // 12 pointes régulières : un cercle « denté » calculé plutôt que dessiné à la main,
  // pour que les pointes restent parfaitement équidistantes.
  const points = Array.from({ length: 24 }, (_, i) => {
    const r = i % 2 === 0 ? 10.6 : 8.8;
    const a = (Math.PI * 2 * i) / 24 - Math.PI / 2;
    return `${(12 + r * Math.cos(a)).toFixed(2)},${(12 + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="12" y1="1.4" x2="12" y2="22.6" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7fe8c8" />
          <stop offset="55%" stopColor="#12b98a" />
          <stop offset="100%" stopColor="#0b7a5c" />
        </linearGradient>
      </defs>
      <polygon points={points} fill={flat ? 'currentColor' : `url(#${g})`} />
      <path d="M12 1.4a10.6 10.6 0 0 0-9 5 10.6 10.6 0 0 1 18 0 10.6 10.6 0 0 0-9-5Z" fill="#fff" opacity="0.2" />
      <path
        d="M8.2 12.3l2.6 2.6 5-5.2"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Cadran — vérification en cours d'examen. */
export function PendingClockIcon({ className = 'w-3.5 h-3.5', flat = false }: IconProps) {
  const id = useId();
  const g = `pending-${id}`;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f7cf6b" />
          <stop offset="60%" stopColor="#f0a63c" />
          <stop offset="100%" stopColor="#9e5a08" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill={flat ? 'currentColor' : `url(#${g})`} />
      <path d="M12 2a10 10 0 0 0-8.5 4.7 10 10 0 0 1 17 0A10 10 0 0 0 12 2Z" fill="#fff" opacity="0.2" />
      <path d="M12 6.6V12l3.4 2" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Triangle — identité non vérifiée. Volontairement neutre : c'est une invitation, pas une faute. */
export function UnverifiedIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M12 3.4c.5 0 .96.27 1.2.7l7.5 13.2c.5.87-.13 1.95-1.2 1.95H4.5c-1.07 0-1.7-1.08-1.2-1.95l7.5-13.2c.24-.43.7-.7 1.2-.7Z"
        fill="currentColor"
        opacity="0.16"
      />
      <path
        d="M12 3.4c.5 0 .96.27 1.2.7l7.5 13.2c.5.87-.13 1.95-1.2 1.95H4.5c-1.07 0-1.7-1.08-1.2-1.95l7.5-13.2c.24-.43.7-.7 1.2-.7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 9.4v4.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16.3" r="1.15" fill="currentColor" />
    </svg>
  );
}

/** Croix — vérification refusée. */
export function RejectedIcon({ className = 'w-3.5 h-3.5', flat = false }: IconProps) {
  const id = useId();
  const g = `rejected-${id}`;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ff9fb0" />
          <stop offset="60%" stopColor="#ee3d62" />
          <stop offset="100%" stopColor="#a81a3c" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill={flat ? 'currentColor' : `url(#${g})`} />
      <path d="M12 2a10 10 0 0 0-8.5 4.7 10 10 0 0 1 17 0A10 10 0 0 0 12 2Z" fill="#fff" opacity="0.2" />
      <path d="M8.8 8.8l6.4 6.4M15.2 8.8l-6.4 6.4" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" />
    </svg>
  );
}
