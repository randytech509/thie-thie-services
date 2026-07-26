import { AnimatePresence, motion } from 'motion/react';
import { Sun, Moon } from 'lucide-react';

/**
 * Icône du bouton jour/nuit avec transition animée : l'icône sortante pivote + rétrécit +
 * disparaît, la nouvelle arrive en pivotant (lune ⇄ soleil). `mode="wait"` enchaîne sortie
 * puis entrée ; `initial={false}` évite d'animer au premier rendu. Neutralisé par
 * prefers-reduced-motion (framer-motion le respecte).
 */
export function AnimatedThemeIcon({ theme }: { theme: 'dark' | 'light' }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={theme}
        initial={{ rotate: -90, scale: 0.3, opacity: 0 }}
        animate={{ rotate: 0, scale: 1, opacity: 1 }}
        exit={{ rotate: 90, scale: 0.3, opacity: 0 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center justify-center"
      >
        {theme === 'dark'
          ? <Sun className="w-4 h-4 text-amber-400" />
          : <Moon className="w-4 h-4 text-indigo-500" />}
      </motion.span>
    </AnimatePresence>
  );
}
