import React from 'react';

/** Bloc de squelette animé (shimmer) — remplace un spinner pour les listes/cartes en chargement. */
export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`tt-skeleton ${className}`} />;
}

/** Ligne de type "carte commande/transaction" en chargement : avatar + 2 lignes de texte + montant. */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl border border-white/[0.06] bg-[#0c0714]/30">
      <SkeletonBlock className="w-10 h-10 rounded-xl shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        <SkeletonBlock className="h-3 w-1/2 rounded" />
        <SkeletonBlock className="h-2.5 w-1/3 rounded" />
      </div>
      <SkeletonBlock className="h-4 w-16 rounded shrink-0" />
    </div>
  );
}

/** Liste de N lignes de squelette (historique commandes/transactions). */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
