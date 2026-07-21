import React, { useState } from 'react';
import {
  Home,
  Heart,
  User,
  LogOut,
  Sun,
  Moon,
  Award,
  Sparkles,
  Percent,
  Truck,
  Copy,
  Check,
  Crown,
  Ticket,
  Gift,
  Wallet,
  Coins,
  Mail,
  ChevronDown,
  LayoutDashboard,
} from 'lucide-react';
import { ThieThieLogo } from './ThieThieLogo';
import type { User as FirebaseUser } from 'firebase/auth';

export type CategoryItem = {
  slug: string;
  name: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
};

type Reward = { id: string; titleFR: string; titleHT: string; cost: number; code: string; iconType: string };
type Coupon = { id: string; code: string; titleFR: string; titleHT: string; cost: number; claimedAt: string };
type PageId =
  | 'home' | 'category' | 'about' | 'contact' | 'faq' | 'privacy' | 'terms' | 'wishlist' | 'profile'
  | 'welcome' | 'login-screen' | 'register-screen' | 'forgot-password-screen' | 'admin';

interface SidebarProps {
  lang: 'FR' | 'HT';
  setLang: (l: 'FR' | 'HT') => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  currentPage: PageId;
  selectedCategorySlug: string | null;
  navigateToPage: (page: PageId) => void;
  isAdmin?: boolean;
  navigateToCategory: (slug: string) => void;
  categories: CategoryItem[];
  wishlistCount: number;
  user: FirebaseUser | null;
  walletBalanceCents: number;
  thieThiePoints: number;
  getLoyaltyLevel: (points: number) => { nameFR: string; nameHT: string; color: string; bg: string };
  availableRewards: Reward[];
  redeemedCoupons: Coupon[];
  redeemReward: (reward: Reward) => void;
  copyCouponToClipboard: (code: string) => void;
  copiedCouponCode: string | null;
  onLogin: () => void;
  onLogout: () => void;
}

const REWARD_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  percent: Percent,
  truck: Truck,
  gift: Gift,
};

export function Sidebar(props: SidebarProps) {
  const {
    lang, setLang, theme, toggleTheme,
    currentPage, selectedCategorySlug, navigateToPage, navigateToCategory, isAdmin,
    categories, wishlistCount, user, walletBalanceCents, thieThiePoints,
    getLoyaltyLevel, availableRewards, redeemedCoupons, redeemReward,
    copyCouponToClipboard, copiedCouponCode, onLogin, onLogout,
  } = props;

  const [loyaltyOpen, setLoyaltyOpen] = useState(false);
  const [loyaltyTab, setLoyaltyTab] = useState<'status' | 'redeem' | 'coupons'>('status');
  const level = getLoyaltyLevel(thieThiePoints);

  const navItem = (active: boolean, onClick: () => void, icon: React.ReactNode, label: string, count?: number) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-semibold transition-all border ${
        active
          ? 'bg-[var(--tt-accent-soft)] text-[var(--tt-accent-ink)] border-[var(--tt-accent)]/30'
          : 'text-[var(--tt-text-muted)] border-transparent hover:bg-[var(--tt-surface-2)] hover:text-[var(--tt-text)]'
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
      {typeof count === 'number' && count > 0 && (
        <span className="ml-auto text-[10px] font-bold bg-[var(--tt-surface-3)] text-[var(--tt-text-muted)] rounded-full px-1.5 py-0.5">
          {count}
        </span>
      )}
    </button>
  );

  return (
    <aside
      id="app-sidebar"
      className="hidden lg:flex w-[248px] shrink-0 flex-col gap-4 border-r border-[var(--tt-border)] bg-[var(--tt-surface)] h-screen sticky top-0 overflow-y-auto p-3.5"
    >
      {/* Brand */}
      <button
        onClick={() => navigateToPage('home')}
        className="flex items-center gap-2.5 px-1.5 py-2 select-none text-left border-b border-[var(--tt-border)] pb-3.5"
      >
        <ThieThieLogo variant="icon" size={34} />
        <div className="leading-none">
          <span className="block font-extrabold text-[13.5px] tracking-wide bg-gradient-to-r from-[var(--tt-text)] to-[var(--tt-accent)] bg-clip-text text-transparent">
            THIE THIE
          </span>
          <span className="block text-[9.5px] font-bold tracking-widest text-[var(--tt-text-faint)] mt-0.5 uppercase">
            Services
          </span>
        </div>
      </button>

      {/* Primary nav */}
      <nav className="flex flex-col gap-0.5">
        {navItem(currentPage === 'home', () => navigateToPage('home'), <Home className="w-4 h-4 shrink-0" />, lang === 'FR' ? 'Accueil' : 'Akèy')}
        {navItem(currentPage === 'wishlist', () => navigateToPage('wishlist'), <Heart className="w-4 h-4 shrink-0" />, lang === 'FR' ? 'Liste de souhaits' : 'Lis Souyè', wishlistCount)}
      </nav>

      {/* Categories */}
      <div className="flex flex-col gap-0.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--tt-text-faint)] px-2.5 mb-0.5">
          {lang === 'FR' ? 'Catégories' : 'Kategori'}
        </p>
        {categories.map((cat) => {
          const Icon = cat.icon;
          const active = currentPage === 'category' && selectedCategorySlug === cat.slug;
          return (
            <React.Fragment key={cat.slug}>
              {navItem(active, () => navigateToCategory(cat.slug), <Icon className="w-4 h-4 shrink-0" />, cat.name)}
            </React.Fragment>
          );
        })}
      </div>

      {/* Account */}
      <div className="flex flex-col gap-0.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--tt-text-faint)] px-2.5 mb-0.5">
          {lang === 'FR' ? 'Compte' : 'Kont'}
        </p>
        {navItem(currentPage === 'profile', () => navigateToPage('profile'), <User className="w-4 h-4 shrink-0" />, lang === 'FR' ? 'Profil & KYC' : 'Pwofil & KYC')}
        {navItem(currentPage === 'contact', () => navigateToPage('contact'), <Mail className="w-4 h-4 shrink-0" />, lang === 'FR' ? 'Contact' : 'Kontak')}
        {isAdmin && navItem(currentPage === 'admin', () => navigateToPage('admin'), <LayoutDashboard className="w-4 h-4 shrink-0" />, 'Back-office')}
      </div>

      <div className="mt-auto flex flex-col gap-3">
        {/* Loyalty (compact, expandable) */}
        <div className="rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface-2)] overflow-hidden">
          <button
            onClick={() => setLoyaltyOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
          >
            <div className="relative">
              <Coins className="w-4 h-4 text-[var(--tt-accent)]" />
              <Sparkles className="w-2 h-2 text-[var(--tt-accent)] absolute -top-1 -right-1" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11.5px] font-black leading-none text-[var(--tt-text)]">
                {thieThiePoints} <span className="text-[9px] text-[var(--tt-accent)] font-extrabold">PTS</span>
              </p>
              <p className={`text-[9px] font-extrabold leading-none mt-1 ${level.color}`}>
                {lang === 'FR' ? level.nameFR : level.nameHT}
              </p>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-[var(--tt-text-faint)] transition-transform ${loyaltyOpen ? 'rotate-180' : ''}`} />
          </button>

          {loyaltyOpen && (
            <div className="px-2.5 pb-2.5">
              <div className="grid grid-cols-3 gap-1 bg-black/10 p-1 rounded-lg mb-2 border border-[var(--tt-border)]">
                {(['status', 'redeem', 'coupons'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setLoyaltyTab(tab)}
                    className={`py-1.5 text-[9px] font-bold rounded-md transition-all ${
                      loyaltyTab === tab
                        ? 'bg-[var(--tt-accent)] text-[var(--tt-on-accent)] shadow-sm'
                        : 'text-[var(--tt-text-muted)] hover:text-[var(--tt-text)]'
                    }`}
                  >
                    {tab === 'status' && (lang === 'FR' ? 'Niveau' : 'Nivo')}
                    {tab === 'redeem' && <><Gift className="w-3 h-3 inline-block -mt-0.5 mr-1" />{lang === 'FR' ? 'Boutique' : 'Kado'}</>}
                    {tab === 'coupons' && <><Ticket className="w-3 h-3 inline-block -mt-0.5 mr-1" />{lang === 'FR' ? 'Codes' : 'Kòd'} ({redeemedCoupons.length})</>}
                  </button>
                ))}
              </div>

              {loyaltyTab === 'status' && (
                <div className="flex items-center gap-2 px-1 py-1">
                  <Award className="w-5 h-5 text-[var(--tt-accent)]" />
                  {thieThiePoints >= 2500 ? (
                    <p className="text-[10px] font-extrabold text-emerald-400 flex items-center gap-1">
                      <Crown className="w-3.5 h-3.5" /> {lang === 'FR' ? 'Niveau maximal atteint' : 'Pi gwo nivo'}
                    </p>
                  ) : (
                    <p className="text-[10px] text-[var(--tt-text-muted)] leading-snug">
                      {lang === 'FR' ? 'Achète pour gagner plus de points.' : 'Achte pou genyen plis pwen.'}
                    </p>
                  )}
                </div>
              )}

              {loyaltyTab === 'redeem' && (
                <div className="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto pr-0.5">
                  {availableRewards.map((reward) => {
                    const Icon = REWARD_ICON[reward.iconType] || Gift;
                    const affordable = thieThiePoints >= reward.cost;
                    return (
                      <div key={reward.id} className={`flex items-center justify-between p-1.5 rounded-lg bg-black/5 border border-[var(--tt-border)] ${!affordable ? 'opacity-60' : ''}`}>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Icon className="w-3.5 h-3.5 text-[var(--tt-accent)] shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold text-[var(--tt-text)] truncate">{lang === 'FR' ? reward.titleFR : reward.titleHT}</p>
                            <p className="text-[8.5px] text-[var(--tt-accent)] font-black">{reward.cost} PTS</p>
                          </div>
                        </div>
                        <button
                          disabled={!affordable}
                          onClick={() => redeemReward(reward)}
                          className={`px-2 py-1 text-[8.5px] font-black rounded-md shrink-0 ${
                            affordable ? 'bg-[var(--tt-accent)] text-[var(--tt-on-accent)]' : 'bg-[var(--tt-surface-3)] text-[var(--tt-text-faint)]'
                          }`}
                        >
                          {lang === 'FR' ? 'Échanger' : 'Chanje'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {loyaltyTab === 'coupons' && (
                <div className="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto pr-0.5">
                  {redeemedCoupons.length === 0 ? (
                    <p className="text-[9.5px] text-[var(--tt-text-faint)] text-center py-3">
                      {lang === 'FR' ? 'Aucun code réclamé.' : 'Ou pa gen kòd.'}
                    </p>
                  ) : (
                    redeemedCoupons.map((coupon, idx) => (
                      <div key={idx} className="bg-black/10 border border-[var(--tt-border)] rounded-lg p-1.5 flex items-center justify-between gap-1.5">
                        <span className="font-mono text-[9.5px] font-black text-[var(--tt-accent)] truncate">{coupon.code}</span>
                        <button onClick={() => copyCouponToClipboard(coupon.code)} className="p-1 rounded text-[var(--tt-text-muted)] hover:text-[var(--tt-text)] shrink-0">
                          {copiedCouponCode === coupon.code ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Wallet balance */}
        {user && (
          <div className="rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface-2)] p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--tt-text-faint)] flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                {lang === 'FR' ? 'Solde' : 'Balans'}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </div>
            <span className="text-[17px] font-extrabold tabular-nums text-[var(--tt-text)]">
              {(walletBalanceCents / 100).toLocaleString('fr-FR')} <span className="text-[11px] text-emerald-400">HTG</span>
            </span>
            <button
              onClick={() => navigateToPage('profile')}
              className="text-[11px] font-bold bg-[var(--tt-accent)] text-[var(--tt-on-accent)] rounded-lg py-1.5"
            >
              + {lang === 'FR' ? 'Ajouter des fonds' : 'Ajoute lajan'}
            </button>
          </div>
        )}

        {/* Footer: lang / theme / account */}
        <div className="flex items-center gap-1.5 pt-1">
          <div className="flex bg-[var(--tt-surface-2)] border border-[var(--tt-border)] rounded-lg p-0.5 text-[10.5px] font-bold">
            <button onClick={() => setLang('FR')} className={`px-2 py-1 rounded-md ${lang === 'FR' ? 'bg-[var(--tt-surface)] text-[var(--tt-text)] shadow-sm' : 'text-[var(--tt-text-faint)]'}`}>FR</button>
            <button onClick={() => setLang('HT')} className={`px-2 py-1 rounded-md ${lang === 'HT' ? 'bg-[var(--tt-surface)] text-[var(--tt-text)] shadow-sm' : 'text-[var(--tt-text-faint)]'}`}>HT</button>
          </div>
          <button
            onClick={toggleTheme}
            className="p-1.5 bg-[var(--tt-surface-2)] border border-[var(--tt-border)] rounded-lg text-[var(--tt-text-muted)]"
            aria-label={theme === 'dark' ? 'Mode Clair' : 'Mode Sombre'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-500" />}
          </button>
          <div className="ml-auto">
            {user ? (
              <button onClick={onLogout} title={lang === 'FR' ? 'Déconnexion' : 'Dekoneksyon'} className="p-1.5 bg-[var(--tt-surface-2)] border border-[var(--tt-border)] rounded-lg text-[var(--tt-text-muted)] hover:text-red-400 hover:border-red-500/40">
                <LogOut className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={onLogin} className="px-2.5 py-1.5 bg-[var(--tt-accent)] text-[var(--tt-on-accent)] rounded-lg text-[11px] font-extrabold">
                {lang === 'FR' ? 'Connexion' : 'Koneksyon'}
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
