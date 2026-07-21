import React from 'react';
import { Home, LayoutGrid, Heart, User, Mail } from 'lucide-react';

type PageId =
  | 'home' | 'category' | 'about' | 'contact' | 'faq' | 'privacy' | 'terms' | 'wishlist' | 'profile'
  | 'welcome' | 'login-screen' | 'register-screen' | 'forgot-password-screen';

interface BottomTabBarProps {
  lang: 'FR' | 'HT';
  currentPage: PageId;
  navigateToPage: (page: PageId) => void;
  wishlistCount: number;
}

export function BottomTabBar({ lang, currentPage, navigateToPage, wishlistCount }: BottomTabBarProps) {
  const tabs: { id: PageId; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
    { id: 'home', label: lang === 'FR' ? 'Accueil' : 'Akèy', icon: Home },
    { id: 'category', label: lang === 'FR' ? 'Catégories' : 'Kategori', icon: LayoutGrid },
    { id: 'wishlist', label: lang === 'FR' ? 'Souhaits' : 'Souyè', icon: Heart, count: wishlistCount },
    { id: 'profile', label: lang === 'FR' ? 'Profil' : 'Pwofil', icon: User },
    { id: 'contact', label: lang === 'FR' ? 'Contact' : 'Kontak', icon: Mail },
  ];

  return (
    <nav
      id="mobile-bottom-tabbar"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex border-t border-[var(--tt-border)] bg-[var(--tt-surface)]/95 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {tabs.map((tab, idx) => {
        const Icon = tab.icon;
        const active = currentPage === tab.id;
        return (
          <button
            key={idx}
            onClick={() => navigateToPage(tab.id)}
            className={`relative flex-1 flex flex-col items-center gap-0.5 py-2 text-[9.5px] font-bold transition-colors ${
              active ? 'text-[var(--tt-accent)]' : 'text-[var(--tt-text-faint)]'
            }`}
          >
            <span className="relative">
              <Icon className="w-[18px] h-[18px]" />
              {!!tab.count && (
                <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[var(--tt-accent)] text-[8px] font-black text-[var(--tt-on-accent)] flex items-center justify-center">
                  {tab.count}
                </span>
              )}
            </span>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
