import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Gamepad2,
  Diamond,
  Search,
  Heart,
  ShoppingBag,
  User,
  Globe,
  Menu,
  X,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Star,
  Clock,
  ShieldCheck,
  Zap,
  HelpCircle,
  Send,
  Coins,
  Gift,
  Smartphone,
  Tv,
  Filter,
  Check,
  Info,
  CreditCard,
  Trash2,
  HeartCrack,
  AlertTriangle,
  Mail,
  History,
  Sun,
  Moon,
  Award,
  Sparkles,
  Percent,
  Truck,
  Copy,
  LogOut,
  Camera,
  Phone,
  UserCheck,
  Lock,
  Loader2,
  Bell,
  Wallet,
  Flame,
  Trophy,
  Film,
  MapPin,
  Monitor,
  Target,
  Cog,
  Crown,
  Ticket,
  Apple,
  Joystick
} from 'lucide-react';

// Components
import { UserProfile } from './components/UserProfile';
import { AdminPanel } from './components/AdminPanel';
import { PromoPage } from './components/PromoPage';
import { ThieThieLogo } from './components/ThieThieLogo';
import { Sidebar } from './components/Sidebar';
import { BottomTabBar } from './components/BottomTabBar';

// Firebase imports
import { auth, db, storage, googleProvider, OperationType, handleFirestoreError } from './firebase';
import { placeOrder, redeemReward as redeemRewardApi } from './lib/api';
import { listenForForegroundPush } from './lib/push';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  updateProfile,
  onAuthStateChanged,
  signInWithPopup,
  sendPasswordResetEmail,
  sendEmailVerification,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy,
  serverTimestamp,
  addDoc,
  onSnapshot
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from 'firebase/storage';

import freeFire3DHero from './assets/images/free_fire_3d_gamer_hero_1782735072162.jpg';
import freeFireCategoryBanner from './assets/images/free_fire_category_banner_1782736851764.jpg';
import pubgOvergrownHelmet from './assets/images/pubg_mobile_helmet_overgrown.jpg';
import meruOgImage from './assets/images/meru_og_image.png';

// ==========================================
// DATA & TYPES
// ==========================================

export interface ProductOption {
  amount: string;
  priceUSD: number;
}

export interface Product {
  id: string;
  name: string;
  categorySlug: string;
  image: string;
  isPromo?: boolean;
  discountBadge?: string;
  rating: number;
  deliveryTime: string;
  regions: string[];
  options: ProductOption[];
  descriptionFR: string;
  descriptionHT: string;
  stockStatus: 'instock' | 'outofstock';
  /** Produits issus de Firestore (import Reloadly) : achat via ce doc id, prix exact en centimes. */
  fsProductId?: string;
  fsPriceCents?: number;
}

// 14 Premium Categories
const CATEGORIES = [
  { slug: 'free-fire', name: 'Free Fire', count: 11, icon: Gamepad2, gradient: 'from-[#a855f7] to-[#c084fc]' },
  { slug: 'pubg', name: 'PUBG UC', count: 6, icon: ShieldCheck, gradient: 'from-[#8b5cf6] to-[#7c3aed]' },
  { slug: 'robux', name: 'Roblox', count: 5, icon: Coins, gradient: 'from-[#7c3aed] to-[#a855f7]' },
  { slug: 'netflix', name: 'Netflix', count: 4, icon: Tv, gradient: 'from-[#ef4444] to-[#7c3aed]' },
  { slug: 'meru', name: 'Meru Services', count: 4, icon: Smartphone, gradient: 'from-[#10b981] to-[#8b5cf6]' },
  { slug: 'google-play', name: 'Google Play', count: 4, icon: Gift, gradient: 'from-[#c084fc] to-[#10b981]' },
  { slug: 'apple', name: 'Apple Gift Card', count: 4, icon: ShieldCheck, gradient: 'from-[#a855f7] to-[#8b5cf6]' },
  { slug: 'playstation', name: 'PlayStation', count: 4, icon: Gamepad2, gradient: 'from-[#8b5cf6] to-[#3b1a6e]' },
  { slug: 'xbox', name: 'Xbox Live', count: 3, icon: Gamepad2, gradient: 'from-[#10b981] to-[#064e3b]' },
  { slug: 'steam', name: 'Steam Wallet', count: 3, icon: Coins, gradient: 'from-[#4b5563] to-[#111827]' },
  { slug: 'valorant', name: 'Valorant Points', count: 4, icon: ShieldCheck, gradient: 'from-[#f43f5e] to-[#991b1b]' },
  { slug: 'mobile-legends', name: 'Mobile Legends', count: 4, icon: Gamepad2, gradient: 'from-[#06b6d4] to-[#4f46e5]' },
  { slug: 'efootball', name: 'eFootball', count: 6, icon: Gamepad2, gradient: 'from-[#0ea5e9] to-[#0369a1]' },
  { slug: 'cod-mobile', name: 'COD Mobile', count: 6, icon: ShieldCheck, gradient: 'from-[#78716c] to-[#44403c]' },
  { slug: 'gift-cards', name: 'Cartes cadeaux', count: 0, icon: Gift, gradient: 'from-[#a855f7] to-[#ec4899]' }
];

const isGameCategoryRequiringPlayerId = (categorySlug: string): boolean => {
  return ['free-fire', 'pubg', 'valorant', 'mobile-legends', 'efootball', 'cod-mobile', 'robux'].includes(categorySlug);
};

const getPlayerIdHelperText = (categorySlug: string, lang: string): string => {
  if (categorySlug === 'free-fire') {
    return lang === 'FR' 
      ? "Entrez votre Free Fire Player ID." 
      : lang === 'HT' 
      ? "Antre Free Fire Player ID ou." 
      : "Enter your Free Fire Player ID.";
  }
  if (categorySlug === 'pubg') {
    return lang === 'FR' 
      ? "Entrez votre PUBG Mobile Player ID." 
      : lang === 'HT' 
      ? "Antre PUBG Mobile Player ID ou." 
      : "Enter your PUBG Mobile Player ID.";
  }
  const cat = CATEGORIES.find(c => c.slug === categorySlug);
  const name = cat ? cat.name : 'jeu';
  return lang === 'FR' 
    ? `Entrez votre ID de joueur ${name}.` 
    : lang === 'HT' 
    ? `Antre ID jwè ${name} ou.` 
    : `Enter your ${name} Player ID.`;
};

const PRODUCTS: Product[] = [
  {
    id: 'ff-diamonds',
    name: 'Free Fire Diamonds',
    categorySlug: 'free-fire',
    image: freeFireCategoryBanner,
    isPromo: true,
    discountBadge: '-15%',
    rating: 4.9,
    deliveryTime: '1-5 Min',
    regions: ['Global', 'LATAM', 'USA', 'EU'],
    stockStatus: 'instock',
    descriptionFR: 'Crédits de jeu officiels pour Garena Free Fire. Rechargez votre ID de joueur instantanément.',
    descriptionHT: 'Kredi jwèt ofisyèl pou Garena Free Fire. Chaje ID jwè ou byen vit.',
    options: [
      { amount: '100 +10 Diamonds', priceUSD: 175 / 145 },
      { amount: '200 +20 Diamonds', priceUSD: 350 / 145 },
      { amount: '300 +41 Diamonds', priceUSD: 500 / 145 },
      { amount: '520 +52 Diamonds', priceUSD: 850 / 145 },
      { amount: '1060 +106 Diamonds', priceUSD: 1750 / 145 },
      { amount: '2180 +218 Diamonds', priceUSD: 3500 / 145 },
      { amount: '5600 +560 Diamonds', priceUSD: 8500 / 145 }
    ]
  },
  {
    id: 'ff-subscriptions',
    name: 'Free Fire Subscriptions',
    categorySlug: 'free-fire',
    image: freeFireCategoryBanner,
    isPromo: false,
    rating: 4.9,
    deliveryTime: '1-5 Min',
    regions: ['Global', 'LATAM', 'USA', 'EU'],
    stockStatus: 'instock',
    descriptionFR: 'Abonnements et cartes de membre pour Garena Free Fire. Obtenez des diamants quotidiens et des récompenses exclusives.',
    descriptionHT: 'Abònman ak kat manm pou Garena Free Fire. Jwenn dyamant chak jou ak lòt bèl kado.',
    options: [
      { amount: 'Weekly Membership', priceUSD: 500 / 145 },
      { amount: 'Monthly Membership', priceUSD: 1700 / 145 },
      { amount: 'VIP Membership', priceUSD: 2150 / 145 },
      { amount: 'Booyah Pass', priceUSD: 600 / 145 }
    ]
  },
  {
    id: 'pubg-uc',
    name: 'PUBG Mobile UC',
    categorySlug: 'pubg',
    image: pubgOvergrownHelmet,
    isPromo: true,
    discountBadge: '-10%',
    rating: 4.8,
    deliveryTime: '2-7 Min',
    regions: ['Global', 'Middle East', 'USA'],
    stockStatus: 'instock',
    descriptionFR: 'Unknown Cash pour PUBG Mobile. Équipez votre personnage des meilleurs skins de combat.',
    descriptionHT: 'Kredi Unknown Cash pou PUBG Mobile. Ekipe pèsonaj ou ak pi bèl rad konba.',
    options: [
      { amount: '60 UC', priceUSD: 1.10 },
      { amount: '325 UC', priceUSD: 5.30 },
      { amount: '660 UC', priceUSD: 10.50 },
      { amount: '1800 UC', priceUSD: 26.00 },
      { amount: '3850 UC', priceUSD: 51.00 },
      { amount: '8100 UC', priceUSD: 99.00 }
    ]
  },
  {
    id: 'roblox-robux',
    name: 'Robux Gift Code',
    categorySlug: 'robux',
    image: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&q=80&w=400',
    isPromo: false,
    rating: 4.7,
    deliveryTime: '5-10 Min',
    regions: ['Global'],
    stockStatus: 'instock',
    descriptionFR: 'Robux Roblox pour débloquer de nouveaux mondes de jeu et habiller votre avatar.',
    descriptionHT: 'Robux Roblox pou debloke nouvo mond jwèt epi abiye avatar ou.',
    options: [
      { amount: '400 Robux', priceUSD: 5.50 },
      { amount: '800 Robux', priceUSD: 10.50 },
      { amount: '1700 Robux', priceUSD: 21.00 },
      { amount: '4500 Robux', priceUSD: 51.00 },
      { amount: '10000 Robux', priceUSD: 102.00 }
    ]
  },
  {
    id: 'netflix-premium',
    name: 'Netflix Premium Account',
    categorySlug: 'netflix',
    image: 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?auto=format&fit=crop&q=80&w=400',
    isPromo: true,
    discountBadge: 'POPULAR',
    rating: 4.9,
    deliveryTime: '5 Min',
    regions: ['Global', 'Haiti'],
    stockStatus: 'outofstock',
    descriptionFR: 'Accès premium Netflix Ultra HD 4K. Écrans partagés ou privés de haute qualité.',
    descriptionHT: 'Aksè premium Netflix Ultra HD 4K. Ekran prive oswa pataje ak meyè kalite.',
    options: [
      { amount: '1 Month Ultra HD', priceUSD: 6.00 },
      { amount: '3 Months Ultra HD', priceUSD: 16.50 },
      { amount: '6 Months Ultra HD', priceUSD: 31.00 },
      { amount: '12 Months Ultra HD', priceUSD: 58.00 }
    ]
  },
  {
    id: 'meru-services',
    name: 'Meru Credits Pack',
    categorySlug: 'meru',
    image: meruOgImage,
    isPromo: false,
    rating: 4.6,
    deliveryTime: '10-15 Min',
    regions: ['Haiti Only'],
    stockStatus: 'instock',
    descriptionFR: 'Forfaits et jetons Meru Services adaptés aux transactions locales.',
    descriptionHT: 'Fòfè ak jton Meru Services pou tranzaksyon fasil lokal yo.',
    options: [
      { amount: '100 Credits', priceUSD: 2.20 },
      { amount: '300 Credits', priceUSD: 5.80 },
      { amount: '600 Credits', priceUSD: 11.00 },
      { amount: '1300 Credits', priceUSD: 21.50 }
    ]
  },
  {
    id: 'google-play-card',
    name: 'Google Play Gift Card',
    categorySlug: 'google-play',
    image: 'https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?auto=format&fit=crop&q=80&w=400',
    isPromo: true,
    discountBadge: 'PROMO',
    rating: 4.8,
    deliveryTime: '1-3 Min',
    regions: ['USA', 'FRANCE', 'CANADA'],
    stockStatus: 'instock',
    descriptionFR: 'Code numérique Google Play instantané pour vos applications, livres et abonnements.',
    descriptionHT: 'Kòd nimerik Google Play imedyat pou jwèt, aplikasyon, ak abònman.',
    options: [
      { amount: '$10 Card', priceUSD: 10.50 },
      { amount: '$25 Card', priceUSD: 26.00 },
      { amount: '$50 Card', priceUSD: 51.50 },
      { amount: '$100 Card', priceUSD: 102.00 }
    ]
  },
  {
    id: 'apple-gift-card',
    name: 'Apple Store Gift Card',
    categorySlug: 'apple',
    image: 'https://images.unsplash.com/photo-1621761191319-c6fb62004040?auto=format&fit=crop&q=80&w=600',
    isPromo: false,
    rating: 4.9,
    deliveryTime: '1-3 Min',
    regions: ['USA', 'CANADA'],
    stockStatus: 'instock',
    descriptionFR: 'Idéal pour recharger votre compte iCloud, acheter des apps sur App Store ou musique iTunes.',
    descriptionHT: 'Pafè pou rechaje kont iCloud ou, achte app sou App Store oswa mizik iTunes.',
    options: [
      { amount: '$10 Gift Card', priceUSD: 10.50 },
      { amount: '$25 Gift Card', priceUSD: 26.00 },
      { amount: '$50 Gift Card', priceUSD: 51.50 },
      { amount: '$100 Gift Card', priceUSD: 102.00 }
    ]
  },
  {
    id: 'playstation-network',
    name: 'PlayStation Network Card',
    categorySlug: 'playstation',
    image: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?auto=format&fit=crop&q=80&w=400',
    isPromo: false,
    rating: 4.8,
    deliveryTime: '2-5 Min',
    regions: ['USA', 'EUROPE'],
    stockStatus: 'instock',
    descriptionFR: 'Rechargez votre portefeuille PlayStation Store pour acheter des jeux PS4/PS5 exclusifs.',
    descriptionHT: 'Kat PlayStation Store pou achte jwèt ak ekspansyon eksklizif PS4/PS5.',
    options: [
      { amount: '$10 PSN Card', priceUSD: 10.50 },
      { amount: '$25 PSN Card', priceUSD: 26.00 },
      { amount: '$50 PSN Card', priceUSD: 51.00 },
      { amount: '$100 PSN Card', priceUSD: 101.50 }
    ]
  },
  {
    id: 'xbox-live-card',
    name: 'Xbox Gift Card',
    categorySlug: 'xbox',
    image: 'https://images.unsplash.com/photo-1605901309584-818e25960a8f?auto=format&fit=crop&q=80&w=400',
    isPromo: true,
    discountBadge: 'VRAI',
    rating: 4.7,
    deliveryTime: '3-5 Min',
    regions: ['USA', 'GLOBAL'],
    stockStatus: 'instock',
    descriptionFR: 'Accédez au Game Pass, téléchargez des nouveautés Xbox Series X|S et Xbox One.',
    descriptionHT: 'Pran abònman Game Pass oswa telechaje nouvo jwèt Xbox Series X|S byen fasil.',
    options: [
      { amount: '$10 Gift Card', priceUSD: 10.50 },
      { amount: '$25 Gift Card', priceUSD: 26.00 },
      { amount: '$50 Gift Card', priceUSD: 51.00 }
    ]
  },
  {
    id: 'steam-wallet',
    name: 'Steam Wallet Card',
    categorySlug: 'steam',
    image: 'https://images.unsplash.com/photo-1580234810907-b40315b76418?auto=format&fit=crop&q=80&w=400',
    isPromo: false,
    rating: 4.9,
    deliveryTime: '1-3 Min',
    regions: ['Global', 'USA'],
    stockStatus: 'instock',
    descriptionFR: 'Recharge de portefeuille Steam pour des milliers de jeux PC indépendants et AAA.',
    descriptionHT: 'Rechaj bous Steam pou achte plizyè milye jwèt PC ak lòt amizman.',
    options: [
      { amount: '$10 Steam Card', priceUSD: 10.50 },
      { amount: '$20 Steam Card', priceUSD: 20.50 },
      { amount: '$50 Steam Card', priceUSD: 51.00 }
    ]
  },
  {
    id: 'valorant-points',
    name: 'Valorant Points Pack',
    categorySlug: 'valorant',
    image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&q=80&w=400',
    isPromo: false,
    rating: 4.8,
    deliveryTime: '5 Min',
    regions: ['USA', 'LATAM', 'EU'],
    stockStatus: 'instock',
    descriptionFR: 'Débloquez des skins d\'armes Radianite et des passes de combat sur le jeu de tir tactique de Riot.',
    descriptionHT: 'Debloke bèl rad zam ak batay pas nan jwèt taktik Riot la.',
    options: [
      { amount: '475 VP', priceUSD: 5.50 },
      { amount: '1000 VP', priceUSD: 11.00 },
      { amount: '2050 VP', priceUSD: 21.50 },
      { amount: '5350 VP', priceUSD: 52.00 }
    ]
  },
  {
    id: 'mobile-legends-diamonds',
    name: 'Mobile Legends Diamonds',
    categorySlug: 'mobile-legends',
    image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=600',
    isPromo: true,
    discountBadge: 'OBLIGÉ',
    rating: 4.8,
    deliveryTime: '2-5 Min',
    regions: ['Global'],
    stockStatus: 'instock',
    descriptionFR: 'Diamants de recharge officielle pour Mobile Legends: Bang Bang. Idéal pour skins légendaires.',
    descriptionHT: 'Dyamant ofisyèl pou Mobile Legends: Bang Bang. Pafè pou achte bèl aparans ewo yo.',
    options: [
      { amount: '86 Diamonds', priceUSD: 2.00 },
      { amount: '172 Diamonds', priceUSD: 4.00 },
      { amount: '257 Diamonds', priceUSD: 6.00 },
      { amount: '706 Diamonds', priceUSD: 15.50 }
    ]
  },
  {
    id: 'efootball-coins',
    name: 'eFootball Coins',
    categorySlug: 'efootball',
    image: 'https://image.api.playstation.com/vulcan/ap/rnd/202308/2513/1908ef918e69d95f87b328a6fdf94291c95f19c29ca52e9f.png',
    isPromo: true,
    discountBadge: 'HOT',
    rating: 4.8,
    deliveryTime: '2-5 Min',
    regions: ['Global', 'Haiti'],
    stockStatus: 'instock',
    descriptionFR: 'Pièces de monnaie eFootball officielles pour recruter les meilleurs joueurs et entraineurs de football.',
    descriptionHT: 'Kwen eFootball ofisyèl pou achte pi bon jwè ak antrenè pou ekip ou.',
    options: [
      { amount: '130 Coins', priceUSD: 1.50 },
      { amount: '550 Coins', priceUSD: 6.00 },
      { amount: '1040 Coins', priceUSD: 11.50 },
      { amount: '2130 Coins', priceUSD: 22.00 },
      { amount: '3250 Coins', priceUSD: 32.50 },
      { amount: '5700 Coins', priceUSD: 55.00 }
    ]
  },
  {
    id: 'cod-mobile-cp',
    name: 'Call of Duty: Mobile CP',
    categorySlug: 'cod-mobile',
    image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=600',
    isPromo: true,
    discountBadge: '-10%',
    rating: 4.9,
    deliveryTime: '2-5 Min',
    regions: ['Global', 'USA', 'LATAM'],
    stockStatus: 'instock',
    descriptionFR: 'Points CP officiels pour Call of Duty: Mobile. Achetez des passes de combat et des skins d\'armes légendaires.',
    descriptionHT: 'Pwen CP ofisyèl pou Call of Duty: Mobile. Achte batay pas ak bèl tiraj zam.',
    options: [
      { amount: '80 CP', priceUSD: 1.10 },
      { amount: '420 CP', priceUSD: 5.50 },
      { amount: '880 CP', priceUSD: 11.00 },
      { amount: '2400 CP', priceUSD: 27.00 },
      { amount: '5000 CP', priceUSD: 52.00 },
      { amount: '10000 CP', priceUSD: 102.00 }
    ]
  }
];

// Multilingual Dictionary (FR Default, HT Haitian Creole)
const DICTIONARY: Record<string, Record<string, string>> = {
  FR: {
    accueil: 'Accueil',
    products: 'Produits',
    freeFire: 'Free Fire',
    pubg: 'PUBG',
    robux: 'Roblox',
    netflix: 'Netflix',
    meru: 'Meru',
    giftCards: 'Cartes Cadeaux',
    contact: 'Contact',
    searchPlaceholder: 'Rechercher un jeu ou une carte cadeau...',
    exclusiveTitle: 'OFFRES EXCLUSIVES',
    exclusiveSubtitle: 'Ne ratez pas nos offres limitées !',
    recentTitle: 'Produits récemment ajoutés',
    whyChooseUs: 'Pourquoi nous choisir ?',
    whySubtitle: 'Le partenaire de confiance pour tous vos besoins de jeu numérique',
    instantDelivery: 'Livraison Instantanée',
    instantDeliveryDesc: 'Vos codes de jeu livrés par e-mail en moins de 5 minutes chrono.',
    securePayments: 'Paiements Ultra Sécurisés',
    securePaymentsDesc: 'Alimentez votre wallet via MonCash, NatCash ou USDT, puis payez vos commandes en un clic depuis votre solde.',
    support247: 'Service Client 24/7',
    support247Desc: 'Une équipe dynamique disponible à tout moment pour résoudre vos problèmes.',
    trustedStore: 'Boutique Certifiée',
    trustedStoreDesc: 'Des milliers de clients satisfaits à travers le pays nous recommandent.',
    ordersCount: '1000+ Commandes',
    happyCustomers: '500+ Clients Satisfaits',
    testimonialsTitle: 'Ce que disent nos clients',
    partnersTitle: 'Nos Partenaires Principaux',
    copyright: 'Thie Thie Services. Tous droits réservés.',
    footerDesc: 'Thie Thie Services est votre boutique de confiance en Haïti pour toutes vos recharges de jeux vidéo, abonnements de streaming et cartes cadeaux internationales.',
    viewAll: 'Voir tout',
    stock: 'En Stock',
    outOfStock: 'Rupture',
    deliveryTime: 'Temps moyen',
    filters: 'Filtres de recherche',
    region: 'Région',
    amount: 'Montant',
    price: 'Prix',
    buyOnWhatsapp: 'Commander sur WhatsApp',
    priceSelect: 'Montant sélectionné',
    selectRegion: 'Sélectionner la région',
    selectAmount: 'Sélectionner la recharge',
    paymentMethods: 'Modes de Paiement Acceptés',
    relatedProducts: 'Produits Similaires',
    searchResultFor: 'Résultats pour',
    noResults: 'Aucun produit trouvé. Essayez un autre mot-clé.',
    aboutTitle: 'À Propos de Thie Thie Services',
    ourStory: 'Notre Histoire',
    ourStoryDesc: 'Créé par des passionnés de jeux vidéo, Thie Thie Services est né de la volonté de simplifier l\'accès aux contenus numériques mondiaux en Haïti. Nous offrons une solution rapide et fiable, éliminant les barrières de paiement traditionnelles.',
    ourMission: 'Notre Mission',
    ourMissionDesc: 'Fournir un service de recharge numérique d\'excellence, instantané et sécurisé, tout en garantissant des tarifs hautement compétitifs adaptés aux réalités de nos joueurs.',
    contactTitle: 'Contactez notre Équipe',
    name: 'Votre Nom',
    email: 'Adresse Email',
    message: 'Message',
    sendMessage: 'Envoyer le message',
    messageSuccess: 'Merci pour votre message ! Notre équipe vous répondra par email ou WhatsApp très rapidement.',
    faqTitle: 'Foire Aux Questions (FAQ)',
    termsTitle: 'Conditions Générales de Vente',
    privacyTitle: 'Politique de Confidentialité',
    currencyToggle: 'Devise globale',
    langLabel: 'Langue',
    currLabel: 'Devise',
    allRegions: 'Toutes les régions',
    sortPriceAsc: 'Prix : Croissant',
    sortPriceDesc: 'Prix : Décroissant',
    sortName: 'Nom : A-Z'
  },
  HT: {
    accueil: 'Paj Prensipal',
    products: 'Pwodwi yo',
    freeFire: 'Free Fire',
    pubg: 'PUBG',
    robux: 'Roblox',
    netflix: 'Netflix',
    meru: 'Meru',
    giftCards: 'Kat Kado',
    contact: 'Kontak',
    searchPlaceholder: 'Chache yon jwèt oswa yon kat kado...',
    exclusiveTitle: 'OF CHOKAN YO',
    exclusiveSubtitle: 'Pa rate of limit nou yo pou jodi a !',
    recentTitle: 'Pwodwi nou fèk ajoute yo',
    whyChooseUs: 'Poukisa pou chwazi nou ?',
    whySubtitle: 'Boutik ki pi serye pou tout bezwen nimerik ou ak jwèt videyo',
    instantDelivery: 'Livrezon Imedyat',
    instantDeliveryDesc: 'Kòd jwèt ou yo ap livre pa imèl nan mwens pase 5 minit.',
    securePayments: 'Peman ki Serye nèt',
    securePaymentsDesc: 'Chaje wallet ou ak MonCash, NatCash oswa USDT, epi peye kòmand ou yo an yon klik ak balans ou.',
    support247: 'Sipò Kliyan 24/7',
    support247Desc: 'Yon ekip solid ki la pou ede w nenpòt lè, lajounen kou lannwit.',
    trustedStore: 'Boutik sètifye',
    trustedStoreDesc: 'Plizyè milye kliyan kontan nan tout peyi a fè nou konfyans.',
    ordersCount: '1000+ Kòmand',
    happyCustomers: '500+ Kliyan ki Kontan',
    testimonialsTitle: 'Sa kliyan nou yo di',
    partnersTitle: 'Gwo Patnè nou yo',
    copyright: 'Thie Thie Services. Tout dwa rezève.',
    footerDesc: 'Thie Thie Services se boutik ki pi serye an Ayiti pou tout rechaj jwèt videyo ou yo, abònman streaming ak kat kado entènasyonal.',
    viewAll: 'Wè tout',
    stock: 'Disponib',
    outOfStock: 'Fini',
    deliveryTime: 'Livrezon nan',
    filters: 'Filtre rechèch la',
    region: 'Rejyon',
    amount: 'Kantite',
    price: 'Pri',
    buyOnWhatsapp: 'Kòmande sou WhatsApp',
    priceSelect: 'Kantite ou chwazi a',
    selectRegion: 'Chwazi rejyon',
    selectAmount: 'Chwazi kantite rechaj la',
    paymentMethods: 'Mwayen Peman nou Aksepte',
    relatedProducts: 'Lòt Pwodwi Similè',
    searchResultFor: 'Rezilta pou',
    noResults: 'Nou pa jwenn anyen. Chache yon lòt mo.',
    aboutTitle: 'Kiyès nou ye - Thie Thie Services',
    ourStory: 'Istwa nou',
    ourStoryDesc: 'Thie Thie Services fèt grasa pasyon nou genyen pou jwèt videyo. Nou te vle rann li fasil pou tout jwè an Ayiti jwenn aksè ak jwèt entènasyonal san kè sote ak mwayen peman lokal yo.',
    ourMission: 'Misyon nou',
    ourMissionDesc: 'Ofri yon sèvis livrezon nimerik ki rapid, sekirize, ak pi bon pri sou mache a pou satisfè kominote jwè nou yo.',
    contactTitle: 'Kontakte Ekip nou an',
    name: 'Non ou',
    email: 'Adrès Imèl',
    message: 'Mesaj ou',
    sendMessage: 'Voye mesaj la',
    messageSuccess: 'Mèsi pou mesaj la! Ekip nou an ap kontakte w sou WhatsApp oswa imèl byen vit.',
    faqTitle: 'Kesyon moun poze souvan (FAQ)',
    termsTitle: 'Kondisyon Jeneral pou Sèvi ak Sit la',
    privacyTitle: 'Règ sou Konfidansyalite',
    currencyToggle: 'Chanje lajan',
    langLabel: 'Lang',
    currLabel: 'Lajan',
    allRegions: 'Tout rejyon yo',
    sortPriceAsc: 'Pri : Pi ba pou pi wo',
    sortPriceDesc: 'Pri : Pi wo pou pi ba',
    sortName: 'Non : A-Z'
  }
};

const HERO_SLIDES = [
  {
    id: 1,
    title: 'Free Fire Diamonds',
    subtitle: 'Recharge Instantanée ID',
    subtitleIcon: Flame,
    desc: 'Recevez vos diamants directement sur votre compte Free Fire de manière sécurisée en Haïti.',
    descHT: 'Rechaje dyamant ou yo dirèkteman sou kont Free Fire ou byen rapid epi san pwoblèm an Ayiti.',
    gradient: 'from-[#3b1a6e] to-[#7c3aed]',
    cta: 'Commander',
    image: freeFire3DHero,
    slug: 'free-fire'
  },
  {
    id: 2,
    title: 'PUBG UC Pack',
    subtitle: 'Battle Royale Dominance',
    subtitleIcon: Trophy,
    desc: 'Unknown Cash pas cher avec livraison éclair par e-mail sur votre identifiant de jeu PUBG.',
    descHT: 'Achite Unknown Cash ak pi bon pri sou mache a epi livrezon rapid pa imèl.',
    gradient: 'from-[#0d1b2a] to-[#241640]',
    cta: 'Commander',
    image: pubgOvergrownHelmet,
    slug: 'pubg'
  },
  {
    id: 3,
    title: 'Netflix Premium Ultra HD',
    subtitle: 'Cinéma à la maison',
    subtitleIcon: Film,
    desc: 'Abonnements 100% garantis pour regarder vos séries et films préférés sans interruption.',
    descHT: 'Abònman garanti 100% pou gade tout bèl fim ak seri ou pi renmen yo san koupe.',
    gradient: 'from-[#ef4444] to-[#111827]',
    cta: 'Commander',
    image: 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?auto=format&fit=crop&q=80&w=800',
    slug: 'netflix'
  },
  {
    id: 4,
    title: 'Meru Services',
    subtitle: 'Recharge Rapide Locale',
    subtitleIcon: MapPin,
    desc: 'Faites le plein de jetons de crédit Meru pour débloquer de nouveaux services instantanés.',
    descHT: 'Pran gwo pakèt kredi Meru pou debloke tout sèvis lokal yo fasil an Ayiti.',
    gradient: 'from-[#10b981] to-[#3b1a6e]',
    cta: 'Commander',
    image: meruOgImage,
    slug: 'meru'
  }
];

const HIGHLIGHTED_CATEGORIES = [
  {
    slug: 'free-fire',
    name: 'Free Fire',
    taglineFR: 'Recharges Diamants ultra-rapides pour votre ID Garena',
    taglineHT: 'Chajman Dyamant ultra-rapid sou ID Garena ou',
    image: freeFireCategoryBanner,
    badgeFR: 'Meilleure Vente',
    badgeHT: 'Pi gwo lavant',
    color: '#a855f7',
    gradient: 'from-[#a855f7]/20 to-transparent'
  },
  {
    slug: 'pubg',
    name: 'PUBG UC',
    taglineFR: 'Unknown Cash instantané, livré par e-mail',
    taglineHT: 'Unknown Cash rapid, livre pa imèl',
    image: pubgOvergrownHelmet,
    badgeFR: 'Populaire',
    badgeHT: 'Popilè',
    color: '#8b5cf6',
    gradient: 'from-[#8b5cf6]/20 to-transparent'
  },
  {
    slug: 'robux',
    name: 'Robux Roblox',
    taglineFR: 'Alimentez votre compte Roblox en toute sécurité',
    taglineHT: 'Rechaje kont Roblox ou an sekirite nèt',
    image: 'https://images.unsplash.com/photo-1585647347483-22b66260dfff?auto=format&fit=crop&q=80&w=600',
    badgeFR: 'Sécurisé',
    badgeHT: 'Sekirite',
    color: '#7c3aed',
    gradient: 'from-[#7c3aed]/20 to-transparent'
  },
  {
    slug: 'netflix',
    name: 'Netflix Premium',
    taglineFR: 'Codes d\'activation et abonnements Ultra HD',
    taglineHT: 'Kòd Netflix ak abònman Ultra HD',
    image: 'https://images.unsplash.com/photo-1574375927938-d5a98e8edd86?auto=format&fit=crop&q=80&w=600',
    badgeFR: 'Cinéma',
    badgeHT: 'Sinema',
    badgeIcon: Film,
    color: '#ef4444',
    gradient: 'from-[#ef4444]/20 to-transparent'
  },
  {
    slug: 'google-play',
    name: 'Google Play',
    taglineFR: 'Cartes cadeaux pour applications et jeux Android',
    taglineHT: 'Kat kado pou aplikasyon ak jwèt Android',
    image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=600',
    badgeFR: 'Android',
    badgeHT: 'Android',
    color: '#10b981',
    gradient: 'from-[#10b981]/20 to-transparent'
  },
  {
    slug: 'playstation',
    name: 'PlayStation Store',
    taglineFR: 'Débloquez vos jeux favoris sur console PS4 et PS5',
    taglineHT: 'Debloke jwèt pi renmen ou yo sou PS4 ak PS5',
    image: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?auto=format&fit=crop&q=80&w=600',
    badgeFR: 'Console',
    badgeHT: 'Konsòl',
    badgeIcon: Gamepad2,
    color: '#8b5cf6',
    gradient: 'from-[#8b5cf6]/20 to-transparent'
  },
  {
    slug: 'steam',
    name: 'Steam Wallet',
    taglineFR: 'Ajoutez des fonds à votre portefeuille de jeux PC',
    taglineHT: 'Mete kòb sou bous jwèt PC ou fasil',
    image: 'https://images.unsplash.com/photo-1612287230202-1bf1d85d1bdf?auto=format&fit=crop&q=80&w=600',
    badgeFR: 'Gamer PC',
    badgeHT: 'Jwè PC',
    badgeIcon: Monitor,
    color: '#a855f7',
    gradient: 'from-[#a855f7]/20 to-transparent'
  },
  {
    slug: 'efootball',
    name: 'eFootball',
    taglineFR: 'Pièces eFootball instantanées, livrées par e-mail',
    taglineHT: 'Kwen eFootball rapid, livre pa imèl',
    image: 'https://image.api.playstation.com/vulcan/ap/rnd/202308/2513/1908ef918e69d95f87b328a6fdf94291c95f19c29ca52e9f.png',
    badgeFR: 'Nouveau',
    badgeHT: 'Nouvo',
    color: '#0ea5e9',
    gradient: 'from-[#0ea5e9]/20 to-transparent'
  },
  {
    slug: 'cod-mobile',
    name: 'COD Mobile',
    taglineFR: 'Rechargez vos points COD CP de manière ultra-sécurisée',
    taglineHT: 'Rechaje pwen COD CP ou yo an sekirite nèt',
    image: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&q=80&w=1200',
    badgeFR: 'Populaire',
    badgeHT: 'Popilè',
    color: '#78716c',
    gradient: 'from-[#78716c]/20 to-transparent'
  }
];

const PARTNERS = [
  { name: 'GARENA', icon: Flame, color: '#ef4444' },
  { name: 'PUBG MOBILE', icon: Target, color: '#8b5cf6' },
  { name: 'NETFLIX', icon: Tv, color: '#ef4444' },
  { name: 'GOOGLE', icon: Diamond, color: '#10b981' },
  { name: 'APPLE', icon: Apple, color: '#e5e7eb' },
  { name: 'STEAM', icon: Cog, color: '#a855f7' },
  { name: 'PLAYSTATION', icon: Gamepad2, color: '#8b5cf6' },
  { name: 'XBOX', icon: Joystick, color: '#22c55e' }
];

const TESTIMONIALS = [
  {
    name: 'Samuel Noel',
    stars: 5,
    text: 'Service super rapide ! J\'ai reçu mes 1080 diamants Free Fire en moins de 3 minutes sur mon ID.',
    textHT: 'Sèvis la rapid anpil! Mwen jwenn 1080 dyamant Free Fire mwen yo nan mwens pase 3 minit.',
    role: 'Joueur Pro'
  },
  {
    name: 'Jessica St-Hilaire',
    stars: 5,
    text: 'Mon compte Netflix premium fonctionne à merveille. Le paiement par MonCash est ultra simple.',
    textHT: 'Kont Netflix premium mwen an mache byen nèt. Peman ak MonCash la ekstrèmman senp.',
    role: 'Abonné Premium'
  },
  {
    name: 'Jean-Pierre L.',
    stars: 5,
    text: 'Les meilleurs tarifs en Haïti pour les cartes cadeau Google Play et PlayStation. Je recommande vivement !',
    textHT: 'Pi bon pri nan peyi a pou kat kado Google Play ak PlayStation. Mwen konseye tout moun sèvi ak yo!',
    role: 'Gamer Casual'
  }
];

const FAQS = [
  {
    qFR: 'Comment se déroule la livraison ?',
    qHT: 'Kouman livrezon an fèt ?',
    aFR: 'La livraison est instantanée. Vous payez votre commande depuis votre wallet Thie Thie (que vous alimentez via MonCash, NatCash ou USDT), et nous vous envoyons votre code par e-mail ou rechargeons votre compte de jeu en moins de 5 minutes.',
    aHT: 'Livrezon an fèt byen vit. Ou peye kòmand ou an ak wallet Thie Thie ou (ke ou chaje ak MonCash, NatCash oswa USDT), epi nou voye kòd la oswa chaje kont jwèt ou an nan mwens pase 5 minit.'
  },
  {
    qFR: 'Quels sont les modes de paiement acceptés ?',
    qHT: 'Ki mwayen peman nou aksepte ?',
    aFR: 'Le paiement de vos commandes se fait depuis votre wallet Thie Thie. Vous alimentez ce wallet via MonCash (Haïti), NatCash (Haïti) ou USDT (réseau TRC20) pour nos clients internationaux, puis vous réglez vos achats en un clic depuis votre solde.',
    aHT: 'Peman kòmand yo fèt ak wallet Thie Thie ou. Ou chaje wallet la ak MonCash (Ayiti), NatCash (Ayiti) oswa USDT (rezo TRC20) pou kliyan entènasyonal yo, epi ou peye acha ou yo an yon klik ak balans ou.'
  },
  {
    qFR: 'Est-ce sécurisé et légal ?',
    qHT: 'Èske li sekirize ak legal ?',
    aFR: 'Oui, absolument. Toutes nos recharges proviennent de partenaires agréés officiellement par Garena, PUBG Mobile, Google et Netflix. Aucun risque de bannissement de votre compte.',
    aHT: 'Wi, 100%. Tout rechaj nou yo soti dirèkteman nan patnè ofisyèl Garena, PUBG Mobile, Google ak Netflix. Pa gen okenn risk pou yo ta bloke kont ou.'
  },
  {
    qFR: 'Que faire en cas de problème lors de ma commande ?',
    qHT: 'Kisa pou m fè si m gen yon pwoblèm ?',
    aFR: 'Notre service client est à votre écoute 24h/24 et 7j/7 sur WhatsApp au +50943231463 ou par email. Nous résolvons 99% des soucis instantanément.',
    aHT: 'Sèvis sipò nou an disponib 24/7 sou WhatsApp nan +50943231463 oswa pa imèl. Nou rezoud tout ti pwoblèm yo imedyatman.'
  }
];


// ==========================================
// COMPONENT IMPLEMENTATION
// ==========================================

// Reusable Product Image with Shimmer Skeleton Loader
interface ProductImageWithSkeletonProps {
  src: string;
  alt: string;
  className?: string;
  imgClassName?: string;
}

function ProductImageWithSkeleton({
  src,
  alt,
  className = '',
  imgClassName = ''
}: ProductImageWithSkeletonProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div className={`relative overflow-hidden w-full h-full bg-[#1e293b]/50 ${className}`}>
      {/* Skeleton overlay */}
      {!loaded && (
        <div className="absolute inset-0 z-10 bg-[#0c0714] flex flex-col items-center justify-center">
          {/* Shimmer sweep */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent -translate-x-full animate-shimmer" />
          
          {/* Pulsing indicator icon */}
          <div className="w-8 h-8 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center animate-pulse">
            <Gamepad2 className="w-4 h-4 text-white/20" />
          </div>
        </div>
      )}

      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setLoaded(true);
          setError(true);
        }}
        referrerPolicy="no-referrer"
        className={`${imgClassName} w-full h-full object-cover transition-all duration-500 ${
          loaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        loading="lazy"
      />

      {error && (
        <div className="absolute inset-0 z-10 bg-[#0c0714] flex flex-col items-center justify-center p-4 text-center">
          <Info className="w-5 h-5 text-white/30 mb-1" />
          <span className="text-[9px] text-white/40 uppercase tracking-wider">Image indisponible</span>
        </div>
      )}
    </div>
  );
}

// Interactive 3D Tilt Card using motion/react
interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  key?: string | number;
}

function TiltCard({ children, className = '', onClick }: TiltCardProps) {
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const box = card.getBoundingClientRect();
    const x = e.clientX - box.left - box.width / 2;
    const y = e.clientY - box.top - box.height / 2;
    
    // Normalize values to a small degree of rotation for subtlety
    const rotY = (x / (box.width / 2)) * 12; // max 12 degrees
    const rotX = -(y / (box.height / 2)) * 12; // max 12 degrees
    
    setRotateX(rotX);
    setRotateY(rotY);
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
  };

  return (
    <motion.div
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      animate={{
        rotateX: rotateX,
        rotateY: rotateY,
        transformPerspective: 800,
        scale: 1.05,
      }}
      transition={{
        type: 'spring',
        stiffness: 220,
        damping: 20,
        mass: 0.2,
      }}
      whileHover={{
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(168, 85, 247, 0.15)',
        borderColor: 'rgba(168, 85, 247, 0.4)',
      }}
      style={{
        transformStyle: 'preserve-3d',
      }}
      className={`relative cursor-pointer select-none ${className}`}
    >
      {children}
    </motion.div>
  );
}

const gridContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const gridItemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { 
    opacity: 1, 
    y: 0, 
    transition: { 
      type: 'spring', 
      stiffness: 100, 
      damping: 15 
    } 
  }
};

export default function App() {
  // Global States
  const [lang, setLang] = useState<'FR' | 'HT'>('FR');
  const [currency, setCurrency] = useState<'USD' | 'HTG'>('HTG');
  // Taux de change lu depuis config/fx (défini par l'admin via setFxRate) et propagé EN TEMPS
  // RÉEL à tout le site via onSnapshot — modifier le taux dans le back-office se reflète
  // immédiatement (bandeau, convertisseur, formatPrice) sans rechargement. Fallback 145.
  const [exchangeRate, setExchangeRate] = useState<number>(145);
  useEffect(() => {
    return onSnapshot(doc(db, 'config', 'fx'), (snap) => {
      const cents = snap.data()?.htgCentsPerUsd;
      if (typeof cents === 'number' && cents > 0) setExchangeRate(cents / 100);
    }, () => {});
  }, []);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const stored = localStorage.getItem('theme');
      return (stored === 'light' || stored === 'dark') ? stored : 'dark';
    } catch (e) {
      return 'dark';
    }
  });

  useEffect(() => {
    try {
      if (theme === 'light') {
        document.body.classList.add('light');
        document.documentElement.classList.add('light');
      } else {
        document.body.classList.remove('light');
        document.documentElement.classList.remove('light');
      }
      localStorage.setItem('theme', theme);
    } catch (e) {
      console.error('Failed to write theme to localStorage', e);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Thie Thie Points Loyalty Program State
  const [thieThiePoints, setThieThiePoints] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('thieThiePoints');
      return stored ? parseInt(stored, 10) : 350;
    } catch (e) {
      return 350;
    }
  });

  const [pointsToast, setPointsToast] = useState<{ show: boolean; msg: string; points: number } | null>(null);

  // Solde wallet HTG (centimes) — source de vérité serveur (users/{uid}.walletBalanceCents)
  const [walletBalanceCents, setWalletBalanceCents] = useState<number>(0);
  const [walletPaying, setWalletPaying] = useState<boolean>(false);

  // Get current loyalty level / status
  const getLoyaltyLevel = (points: number) => {
    if (points < 250) return { nameFR: 'Joueur Bronze', nameHT: 'Jwè Bronze', color: 'text-amber-600', bg: 'bg-amber-500/10 border-amber-500/20' };
    if (points < 1000) return { nameFR: 'Gamer d\'Argent', nameHT: 'Jwè Argant', color: 'text-slate-400', bg: 'bg-slate-400/10 border-slate-400/20' };
    if (points < 2500) return { nameFR: 'Champion d\'Or', nameHT: 'Chanpyon Lò', color: 'text-[#c084fc]', bg: 'bg-[#c084fc]/10 border-[#c084fc]/20' };
    return { nameFR: 'Légende Thie Thie', nameHT: 'Lejann Thie Thie', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' };
  };

  // Auto-dismiss points toast
  useEffect(() => {
    if (pointsToast?.show) {
      const t = setTimeout(() => {
        setPointsToast(null);
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [pointsToast]);

  // AVAILABLE LOYALTY REWARDS
  const AVAILABLE_REWARDS = [
    {
      id: 'promo10',
      titleFR: '10% de réduction',
      titleHT: '10% rabè',
      cost: 100,
      code: 'THIE10',
      iconType: 'percent'
    },
    {
      id: 'freeship',
      titleFR: 'Livraison Gratuite',
      titleHT: 'Livrezon Gratis',
      cost: 200,
      code: 'THIEFREE',
      iconType: 'truck'
    },
    {
      id: 'promo25',
      titleFR: '25% de réduction',
      titleHT: '25% rabè',
      cost: 500,
      code: 'THIE25',
      iconType: 'percent'
    },
    {
      id: 'voucher10',
      titleFR: 'Bon d\'achat de $10',
      titleHT: 'Kado $10 USD',
      cost: 1000,
      code: 'THIEV10',
      iconType: 'gift'
    }
  ];

  const [redeemedCoupons, setRedeemedCoupons] = useState<{ id: string; code: string; titleFR: string; titleHT: string; cost: number; claimedAt: string }[]>(() => {
    try {
      const stored = localStorage.getItem('redeemedCoupons');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  const [copiedCouponCode, setCopiedCouponCode] = useState<string | null>(null);

  // J2 (invariant 2/3) : la rédemption passe par la Cloud Function `redeemReward`
  // (débit des points serveur + émission du coupon, atomique et idempotent). Le
  // client ne mute NI les points NI les coupons (firestore.rules les refuse).
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const redeemReward = async (reward: typeof AVAILABLE_REWARDS[0]) => {
    if (!user) { setAuthMode('login'); setAuthModalOpen(true); return; }
    // Garde UX côté client ; l'autorité reste le serveur.
    if (thieThiePoints < reward.cost) {
      alert(lang === 'FR'
        ? `Points insuffisants ! Vous avez besoin de ${reward.cost} PTS, mais vous n'avez que ${thieThiePoints} PTS.`
        : `Pwen pa ase ! Ou bezwen ${reward.cost} PTS, men ou gen sèlman ${thieThiePoints} PTS.`
      );
      return;
    }

    setRedeeming(reward.id);
    try {
      const res = await redeemRewardApi({
        rewardId: reward.id,
        idempotencyKey: (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `${reward.id}-${Date.now()}`,
      });

      // Source de vérité serveur : solde de points renvoyé par la Function.
      setThieThiePoints(res.pointsAfter);

      const nowStr = new Date().toLocaleDateString(lang === 'FR' ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' });
      setRedeemedCoupons((prev) => {
        if (prev.some((c) => c.id === res.couponId)) return prev;
        return [...prev, {
          id: res.couponId,
          code: res.code,
          titleFR: reward.titleFR,
          titleHT: reward.titleHT,
          cost: res.cost,
          claimedAt: nowStr,
        }];
      });

      setPointsToast({
        show: true,
        msg: lang === 'FR'
          ? `Récompense obtenue ! Utilisez le code: ${res.code}`
          : `Ou jwenn kado sa a ! Sèvi ak kòd: ${res.code}`,
        points: -res.cost,
      });
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      const insufficient = /insufficient-points|points insuffisants|failed-precondition/i.test(String(err?.code || '') + msg);
      alert(insufficient
        ? (lang === 'FR' ? 'Points insuffisants pour cette récompense.' : 'Pwen pa ase pou kado sa a.')
        : (lang === 'FR' ? 'Échec de la rédemption : ' : 'Echwe : ') + msg);
    } finally {
      setRedeeming(null);
    }
  };

  const copyCouponToClipboard = (code: string) => {
    try {
      navigator.clipboard.writeText(code);
      setCopiedCouponCode(code);
      setTimeout(() => setCopiedCouponCode(null), 2500);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState<'welcome' | 'login-screen' | 'register-screen' | 'forgot-password-screen' | 'home' | 'category' | 'about' | 'contact' | 'faq' | 'privacy' | 'terms' | 'wishlist' | 'profile' | 'admin'>('welcome');
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string | null>(null);
  const [quickFilter, setQuickFilter] = useState<'ALL' | 'PROMO' | 'POPULAR' | 'UNDER_10' | 'LATEST'>('ALL');

  // --- Firebase User & Profile States ---
  const [user, setUser] = useState<FirebaseUser | null>(null);
  // Autorité admin = custom claim `admin` (invariant 6). Sert à router vers le back-office.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    user.getIdTokenResult().then((r) => setIsAdmin(r.claims.admin === true)).catch(() => setIsAdmin(false));
  }, [user]);
  const [authChecking, setAuthChecking] = useState(true);
  const [profilePhone, setProfilePhone] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  
  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  // Register fields
  const [registerFullName, setRegisterFullName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [registerError, setRegisterError] = useState<string | null>(null);

  // Forgot password fields
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  
  // --- Purchase History state ---
  const [firebaseOrders, setFirebaseOrders] = useState<any[]>([]);
  const [firebaseOrdersLoading, setFirebaseOrdersLoading] = useState(false);
  const [orderToast, setOrderToast] = useState<{ show: boolean; orderId: string; productName: string; qty?: number } | null>(null);
  const firebaseOrdersRef = useRef<Map<string, any> | null>(null);
  
  // Standalone Currency Calculator State & Handlers
  const [calcMode, setCalcMode] = useState<'USD' | 'HTG'>('USD');
  const [calcUSD, setCalcUSD] = useState<string>('10');
  const [calcHTG, setCalcHTG] = useState<string>('1450');

  useEffect(() => {
    setCalcMode(currency);
  }, [currency]);

  const handleUSDCalcChange = (val: string) => {
    // allow digits, single dot/comma
    const sanitized = val.replace(/,/g, '.').replace(/[^\d.]/g, '');
    setCalcUSD(sanitized);
    if (sanitized === '') {
      setCalcHTG('');
      return;
    }
    const parsed = parseFloat(sanitized);
    if (!isNaN(parsed)) {
      setCalcHTG(Math.round(parsed * exchangeRate).toString());
    } else {
      setCalcHTG('');
    }
  };

  const handleHTGCalcChange = (val: string) => {
    const sanitized = val.replace(/,/g, '.').replace(/[^\d.]/g, '');
    setCalcHTG(sanitized);
    if (sanitized === '') {
      setCalcUSD('');
      return;
    }
    const parsed = parseFloat(sanitized);
    if (!isNaN(parsed)) {
      setCalcUSD((parsed / exchangeRate).toFixed(2).replace(/\.00$/, ''));
    } else {
      setCalcUSD('');
    }
  };

  const handlePresetClick = (usdVal: number) => {
    setCalcUSD(usdVal.toString());
    setCalcHTG(Math.round(usdVal * exchangeRate).toString());
  };
  
  // Recent Searches State
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('recentSearches');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('Failed to load recent searches from localStorage', e);
      return [];
    }
  });

  const addRecentSearch = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      const filtered = prev.filter((s) => s.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...filtered].slice(0, 5);
      try {
        localStorage.setItem('recentSearches', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save recent searches to localStorage', e);
      }
      return updated;
    });
  };

  // ==========================================
  // FIREBASE AUTH, PROFILE & ORDERS SERVICES
  // ==========================================

  // Auto-dismiss order status completion toast
  useEffect(() => {
    if (orderToast?.show) {
      const timer = setTimeout(() => {
        setOrderToast(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [orderToast]);

  // Real-time listener for user orders & status transition checking
  useEffect(() => {
    if (!user) {
      setFirebaseOrders([]);
      firebaseOrdersRef.current = null;
      return;
    }

    setFirebaseOrdersLoading(true);
    const ordersRef = collection(db, 'orders');
    const q = query(
      ordersRef,
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedOrders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];

      // Check for status transitions: "Pending Verification" -> "Completed"
      if (firebaseOrdersRef.current !== null) {
        const prevOrdersMap = firebaseOrdersRef.current;
        loadedOrders.forEach(order => {
          const prevOrder = prevOrdersMap.get(order.id);
          if (prevOrder) {
            const prevStatus = prevOrder.status;
            const newStatus = order.status;
            if (prevStatus === 'Pending Verification' && newStatus === 'Completed') {
              // Trigger order completion toast!
              setOrderToast({
                show: true,
                orderId: order.id,
                productName: order.productName || 'eFootball Coins'
              });
            }
          }
        });
      }

      // Update the reference with current orders mapping
      const orderMap = new Map<string, any>();
      loadedOrders.forEach(order => {
        orderMap.set(order.id, order);
      });
      firebaseOrdersRef.current = orderMap;

      setFirebaseOrders(loadedOrders);
      setFirebaseOrdersLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'orders');
      setFirebaseOrdersLoading(false);
    });

    return () => {
      unsubscribe();
      firebaseOrdersRef.current = null;
    };
  }, [user]);

  const fetchUserOrders = async (userId: string) => {
    setFirebaseOrdersLoading(true);
    try {
      const ordersRef = collection(db, 'orders');
      const q = query(
        ordersRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      const querySnap = await getDocs(q);
      const loadedOrders = querySnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setFirebaseOrders(loadedOrders);
    } catch (error) {
      console.error('Error fetching orders from Firestore:', error);
    } finally {
      setFirebaseOrdersLoading(false);
    }
  };

  // Redirect to home and show auth if accessing profile page while logged out
  // Redirect to home and show auth if accessing profile page while logged out
  useEffect(() => {
    if (authChecking) return;
    
    if (user) {
      // Automatically redirect authenticated users to the Home screen on start / login
      if (currentPage === 'welcome' || currentPage === 'login-screen' || currentPage === 'register-screen' || currentPage === 'forgot-password-screen') {
        setCurrentPage('home');
      }
    } else {
      // Allow unauthenticated users to browse the site, but protect the profile page
      if (currentPage === 'profile') {
        setCurrentPage('welcome');
      }
    }
  }, [user, authChecking, currentPage]);

  // Listen to Auth State Changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setProfileLoading(true);
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          
          let userSnap;
          try {
            userSnap = await getDoc(userRef);
            console.log('Successfully fetched user profile snap');
          } catch (e: any) {
            console.error('Failed to getDoc userRef:', e.message || e);
            throw e;
          }
          
          if (userSnap.exists()) {
            const userData = userSnap.data();
            if (userData.thieThiePoints !== undefined) {
              setThieThiePoints(userData.thieThiePoints);
            }
            if (typeof userData.walletBalanceCents === 'number') {
              setWalletBalanceCents(userData.walletBalanceCents);
            }
            if (userData.phoneNumber !== undefined) {
              setProfilePhone(userData.phoneNumber);
            }
          } else {
            // Generously migrate current local points to their cloud profile!
            const initialPoints = thieThiePoints > 0 ? thieThiePoints : 0;
            const profileToCreate = {
              uid: currentUser.uid,
              fullName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Joueur',
              displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Joueur',
              email: currentUser.email || '',
              role: 'customer',
              photoURL: currentUser.photoURL || '',
              thieThiePoints: 0, // J0 (invariant 2) : points serveur-only — création forcée à 0
              phoneNumber: currentUser.phoneNumber || '',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            
            try {
              await setDoc(userRef, profileToCreate);
              console.log('Successfully created user profile document in Firestore');
            } catch (e: any) {
              console.error('Failed to setDoc userRef:', e.message || e, 'Payload:', JSON.stringify(profileToCreate));
              throw e;
            }
            
            if (initialPoints > 0) {
              setThieThiePoints(initialPoints);
            }
          }

          // Fetch user's claimed coupons from subcollection
          const couponsRef = collection(db, 'users', currentUser.uid, 'coupons');
          let couponsSnap;
          try {
            couponsSnap = await getDocs(couponsRef);
            console.log('Successfully fetched user coupons subcollection');
          } catch (e: any) {
            console.error('Failed to getDocs couponsRef:', e.message || e);
            throw e;
          }
          
          if (!couponsSnap.empty) {
            const loadedCoupons = couponsSnap.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            })) as any[];
            setRedeemedCoupons(loadedCoupons);
          }
          
          // Fetch user orders history
          try {
            await fetchUserOrders(currentUser.uid);
            console.log('Successfully fetched user orders');
          } catch (e: any) {
            console.error('Failed to fetchUserOrders:', e.message || e);
            throw e;
          }
          
        } catch (error: any) {
          console.error('Error loading user Firestore profile: ', error.message || error);
        } finally {
          setProfileLoading(false);
          setAuthChecking(false);
        }
      } else {
        setFirebaseOrders([]);
        // Reload points from localStorage when logged out
        try {
          const stored = localStorage.getItem('thieThiePoints');
          setThieThiePoints(stored ? Number(stored) : 0);
          const storedCoupons = localStorage.getItem('redeemedCoupons');
          setRedeemedCoupons(storedCoupons ? JSON.parse(storedCoupons) : []);
        } catch (e) {
          console.error(e);
        }
        setAuthChecking(false);
      }
    });
    
    return () => unsubscribe();
  }, []);

  // Notifications push (FCM) — affiche les messages reçus pendant que l'onglet est au premier
  // plan (le service worker gère déjà l'arrière-plan, voir public/firebase-messaging-sw.js).
  // Effet indépendant de l'auth state ci-dessus : n'affecte jamais son comportement déjà testé.
  useEffect(() => {
    if (!user) return;
    let unsubscribe: (() => void) | undefined;
    listenForForegroundPush((title, body) => {
      try { new Notification(title, { body }); } catch { /* permission pas encore accordée */ }
    }).then((fn) => { unsubscribe = fn; });
    return () => unsubscribe?.();
  }, [user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      setAuthError(lang === 'FR' ? 'Veuillez remplir tous les champs.' : 'Tanpri ranpli tout jaden yo.');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, authEmail, authPassword);
      setAuthModalOpen(false);
      setAuthEmail('');
      setAuthPassword('');
    } catch (err: any) {
      console.error(err);
      setAuthError(
        lang === 'FR' 
          ? 'Échec de la connexion. Vérifiez votre e-mail et votre mot de passe.' 
          : 'Koneksyon echwe. Verifye imel ak mo de pas ou.'
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword || !authDisplayName) {
      setAuthError(lang === 'FR' ? 'Veuillez remplir tous les champs.' : 'Tanpri ranpli tout jaden yo.');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      const currentUser = userCredential.user;
      
      await updateProfile(currentUser, { displayName: authDisplayName });
      
      const userRef = doc(db, 'users', currentUser.uid);
      await setDoc(userRef, {
        uid: currentUser.uid,
        fullName: authDisplayName,
        displayName: authDisplayName,
        email: currentUser.email,
        role: 'customer',
        photoURL: '',
        thieThiePoints: 0, // J0 (invariant 2) : points serveur-only — création forcée à 0
        phoneNumber: authPhone || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Envoi de l'e-mail de vérification (best-effort) — requis pour les actions sensibles.
      try { await sendEmailVerification(currentUser); } catch (e) { console.warn('Envoi vérif e-mail:', e); }

      setAuthModalOpen(false);
      setAuthEmail('');
      setAuthPassword('');
      setAuthDisplayName('');
      setAuthPhone('');
    } catch (err: any) {
      console.error(err);
      setAuthError(
        lang === 'FR' 
          ? `Échec de l'inscription: ${err.message}` 
          : `Echwe enskripsyon: ${err.message}`
      );
    } finally {
      setAuthLoading(false);
    }
  };

  // --- Screen-Specific Auth Handlers ---
  const handleEmailSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      setLoginError(lang === 'FR' ? 'Veuillez remplir tous les champs.' : 'Tanpri ranpli tout jaden yo.');
      return;
    }
    setAuthLoading(true);
    setLoginError(null);
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      // Clean up fields
      setLoginEmail('');
      setLoginPassword('');
      setCurrentPage('home');
    } catch (err: any) {
      console.error(err);
      let errMsg = lang === 'FR' 
        ? 'Échec de la connexion. Vérifiez votre e-mail et votre mot de passe.' 
        : 'Koneksyon echwe. Verifye imel ak mo de pas ou.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errMsg = lang === 'FR'
          ? 'E-mail ou mot de passe incorrect.'
          : 'Imel oswa mo de pas la pa kòrèk.';
      } else if (err.code === 'auth/invalid-email') {
        errMsg = lang === 'FR'
          ? 'Adresse e-mail invalide.'
          : 'Adrès imel la pa valab.';
      }
      setLoginError(errMsg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);

    // Validate fields
    if (!registerFullName.trim()) {
      setRegisterError(lang === 'FR' ? 'Le nom complet est requis.' : 'Non konplè a nesesè.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(registerEmail)) {
      setRegisterError(lang === 'FR' ? 'Veuillez entrer une adresse e-mail valide.' : 'Tanpri antre yon imel ki valab.');
      return;
    }
    if (registerPassword.length < 8) {
      setRegisterError(lang === 'FR' ? 'Le mot de passe doit contenir au moins 8 caractères.' : 'Mo de pas la dwe gen omwen 8 karaktè.');
      return;
    }
    if (registerPassword !== registerConfirmPassword) {
      setRegisterError(lang === 'FR' ? 'Les mots de passe ne correspondent pas.' : 'Mo de pas yo pa koresponn.');
      return;
    }

    setAuthLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, registerEmail, registerPassword);
      const currentUser = userCredential.user;
      
      await updateProfile(currentUser, { displayName: registerFullName });
      
      const userRef = doc(db, 'users', currentUser.uid);
      await setDoc(userRef, {
        uid: currentUser.uid,
        fullName: registerFullName,
        displayName: registerFullName,
        email: currentUser.email,
        role: 'customer',
        photoURL: '',
        thieThiePoints: 0, // J0 (invariant 2) : points serveur-only — création forcée à 0
        phoneNumber: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Envoi de l'e-mail de vérification (best-effort). La vérif est exigée par les règles
      // pour les actions sensibles (dépôts, commandes, KYC) — voir isEmailVerified().
      try { await sendEmailVerification(currentUser); } catch (e) { console.warn('Envoi vérif e-mail:', e); }

      // Clear fields
      setRegisterFullName('');
      setRegisterEmail('');
      setRegisterPassword('');
      setRegisterConfirmPassword('');
      setCurrentPage('home');
    } catch (err: any) {
      console.error(err);
      let errMsg = lang === 'FR' 
        ? `Échec de l'inscription: ${err.message}` 
        : `Echwe enskripsyon: ${err.message}`;
      if (err.code === 'auth/email-already-in-use') {
        errMsg = lang === 'FR'
          ? 'Cette adresse e-mail est déjà utilisée.'
          : 'Adrès imel sa a deja itilize.';
      } else if (err.code === 'auth/weak-password') {
        errMsg = lang === 'FR'
          ? 'Le mot de passe est trop faible.'
          : 'Mo de pas la twò fèb.';
      }
      setRegisterError(errMsg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) {
      setForgotError(lang === 'FR' ? 'Veuillez saisir votre e-mail.' : 'Tanpri antre imel ou.');
      return;
    }
    setAuthLoading(true);
    setForgotError(null);
    setForgotSuccess(false);
    try {
      await sendPasswordResetEmail(auth, forgotEmail);
      setForgotSuccess(true);
      setForgotEmail('');
    } catch (err: any) {
      console.error(err);
      let errMsg = lang === 'FR' 
        ? `Une erreur est survenue : ${err.message}` 
        : `Gen yon erè ki fèt : ${err.message}`;
      if (err.code === 'auth/user-not-found') {
        errMsg = lang === 'FR'
          ? 'Aucun utilisateur trouvé avec cette adresse e-mail.'
          : 'Pa gen okenn itilizatè ki gen imel sa a.';
      } else if (err.code === 'auth/invalid-email') {
        errMsg = lang === 'FR'
          ? 'Adresse e-mail invalide.'
          : 'Adrès imel sa a pa valab.';
      }
      setForgotError(errMsg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setLoginError(null);
    setRegisterError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const currentUser = result.user;
      
      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid: currentUser.uid,
          fullName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Joueur',
          displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Joueur',
          email: currentUser.email,
          role: 'customer',
          photoURL: currentUser.photoURL || '',
          thieThiePoints: 0, // J0 (invariant 2) : points serveur-only — création forcée à 0
          phoneNumber: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      setCurrentPage('home');
    } catch (err: any) {
      console.error(err);
      const errMsg = lang === 'FR' 
        ? `Échec de l'authentification Google : ${err.message}` 
        : `Echwe Google autentifikasyon : ${err.message}`;
      if (currentPage === 'login-screen') {
        setLoginError(errMsg);
      } else if (currentPage === 'register-screen') {
        setRegisterError(errMsg);
      } else {
        alert(errMsg);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigateToPage('home');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleUpdateProfileDetails = async (displayName: string, phone: string) => {
    if (!user) return;
    setProfileLoading(true);
    try {
      await updateProfile(user, { displayName });
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName,
        phoneNumber: phone,
        updatedAt: new Date().toISOString()
      });
      setProfilePhone(phone);
      setUser({ ...auth.currentUser } as FirebaseUser);
    } catch (error) {
      console.error('Error updating profile: ', error);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleProfilePictureUpload = async (file: File) => {
    if (!user) return;
    setProfileLoading(true);
    try {
      // Chemin aligné sur storage.rules (match /avatars/{uid}/{fileId}, lecture publique).
      // `profiles/` tombait dans le default-deny → upload 403 silencieux → photo jamais enregistrée.
      const fileRef = ref(storage, `avatars/${user.uid}/${Date.now()}-${file.name}`);
      const uploadResult = await uploadBytes(fileRef, file);
      const downloadURL = await getDownloadURL(uploadResult.ref);

      await updateProfile(user, { photoURL: downloadURL });

      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        photoURL: downloadURL,
        updatedAt: new Date().toISOString()
      });

      setUser({ ...auth.currentUser } as FirebaseUser);
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      setProfileLoading(false);
    }
  };

  // === Paiement WALLET (invariant 3) — SEUL flux de commande retenu (rien en externe) ===
  // Le client calcule l'ID de variante déterministe et appelle la Cloud Function `placeOrder`
  // qui résout prix + stock côté serveur, débite le wallet en une transaction atomique
  // (solde ≥ 0), écrit la commande « completed » et le ledger. Prix/stock JAMAIS de confiance client.
  const handleWalletPay = async () => {
    if (!selectedProduct) return;
    if (!user) { setAuthMode('login'); setAuthModalOpen(true); return; }

    // ID de joueur requis pour les recharges de jeux
    if (isGameCategoryRequiringPlayerId(selectedProduct.categorySlug)) {
      if (!validateFreeFirePlayerId(freeFirePlayerId, selectedProduct.categorySlug)) {
        const gameName = CATEGORIES.find(c => c.slug === selectedProduct.categorySlug)?.name || 'Game';
        alert(lang === 'FR'
          ? `Veuillez entrer un ID de joueur ${gameName} valide.`
          : `Tanpri antre yon ID jwè ${gameName} ki valab.`);
        return;
      }
    }

    const optIndex = selectedAmountIndex;
    const opt = selectedProduct.options[optIndex] || selectedProduct.options[0];
    // Cartes cadeaux Firestore : achat via leur doc id réel ; sinon convention variante `id__index`.
    const variantId = selectedProduct.fsProductId ?? `${selectedProduct.id}__${optIndex}`;
    const region = selectedProduct.regions[selectedRegionIndex] || 'Global';

    setWalletPaying(true);
    try {
      const res = await placeOrder({
        productId: variantId,
        quantity: 1,
        idempotencyKey: (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `${variantId}-${Date.now()}`,
        playerId: isGameCategoryRequiringPlayerId(selectedProduct.categorySlug) ? freeFirePlayerId : undefined,
        region,
        optionLabel: opt.amount,
      });

      setWalletBalanceCents(res.balanceAfterCents);
      // Points fidélité : octroyés SERVEUR dans placeOrder (invariant 2). On reflète le retour.
      if (res.pointsEarned > 0) {
        setThieThiePoints((prev) => prev + res.pointsEarned);
        setPointsToast({
          show: true,
          msg: lang === 'FR'
            ? `Félicitations ! Vous avez gagné +${res.pointsEarned} Points Thie Thie !`
            : `Félicitasyon ! Ou jwenn +${res.pointsEarned} Pwen Thie Thie !`,
          points: res.pointsEarned,
        });
      }
      if (user) await fetchUserOrders(user.uid);
      setOrderToast({ show: true, orderId: res.orderId, productName: selectedProduct.name });
      setSelectedProduct(null);
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      const insufficient = String(err?.code || '').includes('failed-precondition') || /insuffisant|insufficient/i.test(msg);
      if (insufficient) {
        alert(lang === 'FR'
          ? "Solde wallet insuffisant. Rechargez votre wallet (dépôt), puis réessayez."
          : "Balans wallet ou pa ase. Rechaje wallet ou (depo), epi eseye ankò.");
      } else {
        alert((lang === 'FR' ? 'Échec du paiement : ' : 'Peman echwe : ') + msg);
      }
    } finally {
      setWalletPaying(false);
    }
  };

  const [categorySearchFocused, setCategorySearchFocused] = useState(false);
  
  // Detail Modal State
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedRegionIndex, setSelectedRegionIndex] = useState<number>(0);
  const [selectedAmountIndex, setSelectedAmountIndex] = useState<number>(2); // Default to middle-ish package
  // « Tout sur le site » : le wallet est le seul mode de paiement des commandes (rien en externe).
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'wallet'>('wallet'); // wallet = seul mode de paiement




  // Issue reporting states
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportIssueType, setReportIssueType] = useState<string>('PRICE_ERROR');
  const [reportIssueDetails, setReportIssueDetails] = useState<string>('');

  // Free Fire Player ID state
  const [freeFirePlayerId, setFreeFirePlayerId] = useState('');
  const [freeFirePlayerIdError, setFreeFirePlayerIdError] = useState<string | null>(null);

  const validateFreeFirePlayerId = (id: string, categorySlug: string = 'free-fire'): boolean => {
    if (!isGameCategoryRequiringPlayerId(categorySlug)) {
      setFreeFirePlayerIdError(null);
      return true;
    }

    if (!id || !id.trim()) {
      setFreeFirePlayerIdError(
        lang === 'FR' 
          ? 'Le Player ID est requis.' 
          : 'ID jwè a obligatwa.'
      );
      return false;
    }

    // Direct top-ups like Free Fire and PUBG Mobile are numeric. Other games can have alphanumeric player IDs (e.g. tag system).
    if (categorySlug === 'free-fire' || categorySlug === 'pubg') {
      const numericRegex = /^\d+$/;
      if (!numericRegex.test(id)) {
        const gameName = categorySlug === 'free-fire' ? 'Free Fire' : 'PUBG Mobile';
        setFreeFirePlayerIdError(
          lang === 'FR' 
            ? `Le Player ID ${gameName} doit contenir uniquement des chiffres.` 
            : `${gameName} Player ID la dwe genyen chif sèlman.`
        );
        return false;
      }
    }

    setFreeFirePlayerIdError(null);
    return true;
  };

  useEffect(() => {
    if (selectedProduct && isGameCategoryRequiringPlayerId(selectedProduct.categorySlug)) {
      setFreeFirePlayerIdError(null);
      if (user) {
        const fetchUserProfileForPlayerId = async () => {
          try {
            const userRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              const data = userSnap.data();
              if (data.freeFirePlayerId) {
                setFreeFirePlayerId(data.freeFirePlayerId);
              } else {
                setFreeFirePlayerId('');
              }
            } else {
              setFreeFirePlayerId('');
            }
          } catch (error) {
            console.error('Error fetching freeFirePlayerId from profile:', error);
            setFreeFirePlayerId('');
          }
        };
        fetchUserProfileForPlayerId();
      } else {
        setFreeFirePlayerId('');
      }
    } else {
      setFreeFirePlayerId('');
      setFreeFirePlayerIdError(null);
    }
  }, [selectedProduct, user]);

  // Stock alert states
  const [alertEmail, setAlertEmail] = useState('');
  const [alertSubmitted, setAlertSubmitted] = useState(false);
  const [alertLoading, setAlertLoading] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);

  // Reset stock alert state when product changes
  useEffect(() => {
    if (selectedProduct) {
      setAlertEmail(user?.email || '');
      setAlertSubmitted(false);
      setAlertError(null);
      setAlertLoading(false);
    } else {
      setAlertEmail('');
      setAlertSubmitted(false);
      setAlertError(null);
    }
  }, [selectedProduct, user]);

  const handleStockAlertSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    if (!alertEmail || !alertEmail.includes('@') || !alertEmail.includes('.')) {
      setAlertError(lang === 'FR' ? 'Veuillez saisir une adresse e-mail valide.' : 'Tanpri antre yon adrès imel ki valab.');
      return;
    }

    setAlertLoading(true);
    setAlertError(null);

    const alertId = 'alert-' + Math.floor(100000 + Math.random() * 900000);
    const path = `stock_alerts/${alertId}`;
    try {
      await setDoc(doc(db, 'stock_alerts', alertId), {
        alertId,
        userId: user?.uid || 'anonymous',
        email: alertEmail.trim(),
        productSlug: selectedProduct.id,
        productName: selectedProduct.name,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      setAlertSubmitted(true);
      setAlertLoading(false);
    } catch (err: any) {
      console.error('Failed to submit stock alert:', err);
      setAlertLoading(false);
      try {
        handleFirestoreError(err, OperationType.CREATE, path);
      } catch (nestedErr: any) {
        setAlertError(lang === 'FR' ? 'Une erreur de permission ou système est survenue.' : 'Yon erè pèmisyon oswa sistèm fèt.');
      }
    }
  };

  // Reset reporting states when product changes/modal closes
  useEffect(() => {
    setShowReportForm(false);
    setReportIssueType('PRICE_ERROR');
    setReportIssueDetails('');
    

  }, [selectedProduct, selectedPaymentMethod]);

  // Dynamic Schema.org Product structured data (JSON-LD) for rich search snippets
  useEffect(() => {
    if (!selectedProduct) {
      const existingScript = document.getElementById('product-schema-jsonld');
      if (existingScript) {
        existingScript.remove();
      }
      return;
    }

    const prices = selectedProduct.options.map((_opt, i) => priceOf(selectedProduct, i));
    const lowPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const highPrice = prices.length > 0 ? Math.max(...prices) : 0;

    const schemaData = {
      '@context': 'https://schema.org/',
      '@type': 'Product',
      'name': selectedProduct.name,
      'image': selectedProduct.image.startsWith('http') 
        ? selectedProduct.image 
        : `${window.location.origin}${selectedProduct.image}`,
      'description': lang === 'FR' ? selectedProduct.descriptionFR : selectedProduct.descriptionHT,
      'sku': selectedProduct.id,
      'mpn': selectedProduct.id,
      'brand': {
        '@type': 'Brand',
        'name': 'Thie Thie Services'
      },
      'aggregateRating': {
        '@type': 'AggregateRating',
        'ratingValue': selectedProduct.rating || 4.9,
        'bestRating': '5',
        'worstRating': '1',
        'ratingCount': 38
      },
      'offers': {
        '@type': 'AggregateOffer',
        'priceCurrency': 'USD',
        'lowPrice': lowPrice,
        'highPrice': highPrice,
        'offerCount': selectedProduct.options.length,
        'availability': selectedProduct.stockStatus === 'outofstock' 
          ? 'https://schema.org/OutOfStock' 
          : 'https://schema.org/InStock',
        'url': window.location.href,
        'priceValidUntil': '2027-12-31',
        'seller': {
          '@type': 'Organization',
          'name': 'Thie Thie Services'
        }
      }
    };

    let script = document.getElementById('product-schema-jsonld') as HTMLScriptElement;
    if (!script) {
      script = document.createElement('script');
      script.id = 'product-schema-jsonld';
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.text = JSON.stringify(schemaData);

    return () => {
      const existingScript = document.getElementById('product-schema-jsonld');
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, [selectedProduct, lang]);

  // Newsletter Signup State
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterStatus, setNewsletterStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [newsletterMsg, setNewsletterMsg] = useState('');

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newsletterEmail.trim().toLowerCase();
    if (!email) return;

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setNewsletterStatus('error');
      setNewsletterMsg(lang === 'FR' ? 'Veuillez saisir une adresse email valide.' : 'Tanpri antre yon adrès imel ki valab.');
      return;
    }

    setNewsletterStatus('loading');
    try {
      await setDoc(doc(db, 'newsletter_subscribers', email), {
        email,
        lang,
        createdAt: new Date().toISOString(),
      });
      setNewsletterStatus('success');
      setNewsletterMsg(lang === 'FR' ? 'Merci pour votre inscription !' : 'Mèsi pou enskripsyon ou !');
      setNewsletterEmail('');
    } catch (err: any) {
      // Un e-mail déjà abonné retombe sur "update" (refusé par les règles, capture seule
      // autorisée en "create") — on le traite comme un succès idempotent, pas une erreur.
      if (err?.code === 'permission-denied') {
        setNewsletterStatus('success');
        setNewsletterMsg(lang === 'FR' ? 'Cette adresse est déjà abonnée.' : 'Adrès sa a deja enskri.');
        setNewsletterEmail('');
      } else {
        setNewsletterStatus('error');
        setNewsletterMsg(lang === 'FR' ? 'Échec de l\'inscription — réessayez.' : 'Enskripsyon echwe — eseye ankò.');
      }
    }
  };

  // Slider State
  const [currentHeroSlide, setCurrentHeroSlide] = useState(0);

  // Category Highlights Auto-Playing Carousel State
  const [categoryCarouselIndex, setCategoryCarouselIndex] = useState(0);
  const [isCategoryCarouselHovered, setIsCategoryCarouselHovered] = useState(false);

  useEffect(() => {
    if (currentPage !== 'home' || isCategoryCarouselHovered) return;
    const timer = setInterval(() => {
      setCategoryCarouselIndex((prev) => (prev + 1) % HIGHLIGHTED_CATEGORIES.length);
    }, 3500);
    return () => clearInterval(timer);
  }, [currentPage, isCategoryCarouselHovered]);

  // Search Input State for Live Suggestions
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);

  // Wishlist Storage State
  const [wishlist, setWishlist] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('thie_thie_wishlist');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Contact Form State
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSuccess, setContactSuccess] = useState(false);

  // Accordion FAQ states
  const [expandedFaqIndex, setExpandedFaqIndex] = useState<number | null>(null);

  // Filters for Category page
  const [filterRegion, setFilterRegion] = useState('ALL');
  const [filterSort, setFilterSort] = useState('DEFAULT');

  // Sticky navbar state
  const [scrolled, setScrolled] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);


  // Sync Wishlist to local storage
  useEffect(() => {
    localStorage.setItem('thie_thie_wishlist', JSON.stringify(wishlist));
  }, [wishlist]);


  // Autoplay Slider
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentHeroSlide((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  // Listen to scroll for transparency styling and scroll-to-top visibility
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Helper dictionary getter
  const t = (key: string): string => {
    return DICTIONARY[lang]?.[key] || key;
  };

  // Pricing helper
  const formatPrice = (usd: number): string => {
    if (currency === 'USD') {
      return `$${usd.toFixed(2)}`;
    } else {
      const htg = usd * exchangeRate;
      return `${Math.round(htg).toLocaleString('en-US')} HTG`;
    }
  };

  /* --- Catalogue Firestore (source de vérité prix/dispo/stock) --------------
   * On garde la structure/images codées en dur, mais on SURCHARGE prix, dispo et
   * stock depuis Firestore `products` (lecture publique). Le variantId déterministe
   * `${productId}__${optionIndex}` fait le pont — même clé que placeOrder côté
   * serveur → le prix affiché == le prix facturé. Fallback sur le codé-en-dur.
   * ------------------------------------------------------------------------ */
  const [fsCatalog, setFsCatalog] = useState<Record<string, { priceCents: number; available: boolean; stock: number }>>({});
  // Cartes cadeaux importées de Reloadly (catégorie 'gift-cards') : docs Firestore convertis en Product,
  // achat via leur doc id réel (fsProductId), prix exact en centimes (fsPriceCents).
  const [giftCardProducts, setGiftCardProducts] = useState<Product[]>([]);

  useEffect(() => {
    getDocs(collection(db, 'products'))
      .then((snap) => {
        const map: Record<string, { priceCents: number; available: boolean; stock: number }> = {};
        const cards: Product[] = [];
        snap.forEach((d) => {
          const v = d.data() as any;
          if (typeof v.priceCents === 'number') {
            map[d.id] = {
              priceCents: v.priceCents,
              available: v.available !== false,
              stock: typeof v.stock === 'number' ? v.stock : 999,
            };
          }
          // Produits Firestore autonomes (import Reloadly) → catégorie Cartes cadeaux.
          if (v.category === 'gift-cards' && v.available !== false && (v.stock ?? 0) > 0 && typeof v.priceCents === 'number') {
            cards.push({
              id: d.id,
              name: String(v.name ?? 'Carte cadeau'),
              categorySlug: 'gift-cards',
              image: String(v.image ?? ''),
              rating: 5,
              deliveryTime: String(v.deliveryTime ?? '1-5 Min'),
              regions: Array.isArray(v.regions) && v.regions.length ? v.regions : ['Global'],
              options: [{ amount: String(v.optionLabel ?? ''), priceUSD: v.priceCents / 14500 }],
              descriptionFR: `Carte cadeau ${v.name ?? ''} — livraison par e-mail.`,
              descriptionHT: `Kat kado ${v.name ?? ''} — livrezon pa imel.`,
              stockStatus: 'instock',
              fsProductId: d.id,
              fsPriceCents: v.priceCents,
            });
          }
        });
        cards.sort((a, b) => (a.fsPriceCents ?? 0) - (b.fsPriceCents ?? 0));
        setFsCatalog(map);
        setGiftCardProducts(cards);
      })
      .catch(() => { /* échec de lecture → on conserve le catalogue codé en dur */ });
  }, []);

  const _variant = (product: Product, optIndex: number) => fsCatalog[`${product.id}__${optIndex}`];
  // Prix effectif d'une option en USD (Firestore sinon codé-en-dur).
  const priceOf = (product: Product, optIndex: number): number => {
    if (product.fsPriceCents != null) return product.fsPriceCents / 14500;
    const v = _variant(product, optIndex);
    return v ? v.priceCents / 14500 : (product.options[optIndex] ?? product.options[0]).priceUSD;
  };
  // Prix effectif en centimes HTG (exact, aligné sur placeOrder).
  const centsOf = (product: Product, optIndex: number): number => {
    if (product.fsPriceCents != null) return product.fsPriceCents;
    const v = _variant(product, optIndex);
    return v ? v.priceCents : Math.round((product.options[optIndex] ?? product.options[0]).priceUSD * 14500);
  };
  // Disponibilité effective (Firestore) — true par défaut si absent.
  const availOf = (product: Product, optIndex: number): boolean => {
    if (product.fsProductId) return true; // cartes Firestore déjà filtrées (available && stock>0)
    const v = _variant(product, optIndex);
    return v ? (v.available && v.stock > 0) : true;
  };

  const toggleWishlist = (productId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setWishlist((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  // Dynamic products list matching query or category
  const filteredProducts = useMemo(() => {
    let result: Product[];

    // Category slug filter — la catégorie Cartes cadeaux est alimentée par Firestore.
    if (currentPage === 'category' && selectedCategorySlug === 'gift-cards') {
      result = giftCardProducts;
    } else {
      result = PRODUCTS;
      if (currentPage === 'category' && selectedCategorySlug) {
        result = result.filter((p) => p.categorySlug === selectedCategorySlug);
      }
    }

    // Search query filter
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.descriptionFR.toLowerCase().includes(q) ||
          p.descriptionHT.toLowerCase().includes(q) ||
          p.categorySlug.toLowerCase().includes(q)
      );
    }

    // Region filter
    if (currentPage === 'category' && filterRegion !== 'ALL') {
      result = result.filter((p) => p.regions.includes(filterRegion));
    }

    // Quick Filters
    if (currentPage === 'category' && quickFilter !== 'ALL') {
      if (quickFilter === 'PROMO') {
        result = result.filter((p) => p.isPromo);
      } else if (quickFilter === 'POPULAR') {
        result = result.filter((p) => p.rating >= 4.8);
      } else if (quickFilter === 'UNDER_10') {
        result = result.filter((p) => p.options.some((o) => o.priceUSD < 10));
      } else if (quickFilter === 'LATEST') {
        const latestIds = PRODUCTS.slice(0, 12).map((p) => p.id);
        result = result.filter((p) => latestIds.includes(p.id));
      }
    }

    // Sort
    if (currentPage === 'category') {
      if (filterSort === 'PRICE_ASC') {
        result = [...result].sort((a, b) => a.options[0].priceUSD - b.options[0].priceUSD);
      } else if (filterSort === 'PRICE_DESC') {
        result = [...result].sort((a, b) => b.options[0].priceUSD - a.options[0].priceUSD);
      } else if (filterSort === 'NAME') {
        result = [...result].sort((a, b) => a.name.localeCompare(b.name));
      }
    }

    // Masque les produits épuisés/indisponibles : un produit codé en dur marqué 'outofstock'
    // (ou rendu indisponible via Firestore) est retiré de la vitrine — il est remplacé par
    // l'équivalent Reloadly dans la catégorie Cartes cadeaux. Les cartes Firestore sont déjà filtrées.
    result = result.filter((p) => (p.fsProductId ? true : (availOf(p, 0) && p.stockStatus !== 'outofstock')));

    return result;
  }, [currentPage, selectedCategorySlug, searchQuery, filterRegion, filterSort, quickFilter, giftCardProducts, fsCatalog]);

  // Suggested search queries
  const searchSuggestions = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    return PRODUCTS.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 5);
  }, [searchQuery]);

  // WhatsApp link generator
  // WhatsApp issue report link generator
  const getWhatsAppReportLink = (product: Product, issueType: string, details: string) => {
    let typeText = '';
    if (lang === 'FR') {
      typeText = issueType === 'PRICE_ERROR' ? 'Option de prix incorrecte' :
                 issueType === 'DELIVERY_DELAY' ? 'Problème de livraison / Retard' :
                 issueType === 'PAYMENT_ISSUE' ? 'Moyen de paiement indisponible' : 'Autre problème';
    } else {
      typeText = issueType === 'PRICE_ERROR' ? 'Opsyon pri ki pa kòrèk' :
                 issueType === 'DELIVERY_DELAY' ? 'Pwoblèm livrezon / Reta' :
                 issueType === 'PAYMENT_ISSUE' ? 'Mwayen peman pa disponib' : 'Lòt pwoblèm';
    }
    
    const text = `Bonjour Thie Thie Services 👋\n\n⚠️ SIGNALEMENT DE PROBLÈME / RAPÒTE YON PWOBLÈM\n\nProduit concerné : ${product.name}\nType de problème : ${typeText}\n\nDétails :\n${details || 'Aucun détail fourni.'}\n\nMerci de corriger cela.`;
    return `https://wa.me/50943231463?text=${encodeURIComponent(text)}`;
  };

  // Quick category navigating
  const navigateToCategory = (slug: string) => {
    setSelectedCategorySlug(slug);
    setCurrentPage('category');
    setFilterRegion('ALL');
    setFilterSort('DEFAULT');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Main Page navigation
  const navigateToPage = (page: typeof currentPage) => {
    setCurrentPage(page);
    setSelectedCategorySlug(null);
    setSearchQuery('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName || !contactEmail || !contactMessage) return;
    setContactSuccess(true);
    setTimeout(() => {
      setContactSuccess(false);
      setContactName('');
      setContactEmail('');
      setContactMessage('');
    }, 4000);
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#070310] flex flex-col items-center justify-center p-6 text-center">
        <div className="relative flex items-center justify-center w-28 h-28 mb-4">
          <ThieThieLogo variant="icon" size={110} animated={true} />
        </div>
        <h2 className="text-xl font-extrabold text-white mt-6 tracking-wider bg-gradient-to-r from-white via-white to-[#a855f7] bg-clip-text text-transparent uppercase font-sans">
          THIE THIE SERVICES
        </h2>
        <p className="text-[10px] text-white/50 mt-2 font-mono uppercase tracking-widest">
          SÉCURISATION DU PROFIL...
        </p>
        <div className="flex items-center gap-2 mt-6 px-4 py-2 bg-white/[0.02] border border-white/[0.05] rounded-full">
          <Loader2 className="w-4 h-4 text-[#a855f7] animate-spin" />
          <span className="text-xs font-semibold text-white/60">Veuillez patienter</span>
        </div>
      </div>
    );
  }

  const isAuthPage = currentPage === 'welcome' || currentPage === 'login-screen' || currentPage === 'register-screen' || currentPage === 'forgot-password-screen';

  // Page promo publique (?promo=<id>) — rendue avant tout gate d'auth (accessible à tous).
  const promoId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('promo') : null;
  if (promoId) {
    return <PromoPage id={promoId} />;
  }

  // Back-office admin plein écran (gate serveur = custom claim ; ce garde client évite juste
  // l'affichage — toute action passe par des callables qui revérifient requireAdmin).
  if (user && isAdmin && currentPage === 'admin') {
    return <AdminPanel user={user} navigateToPage={navigateToPage} formatPrice={formatPrice} />;
  }

  if (!user && isAuthPage) {
    return (
      <div className="min-h-screen bg-[#070310] text-white flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
        {/* Ambient background glows */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#a855f7]/5 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#7c3aed]/5 rounded-full blur-[120px] pointer-events-none"></div>

        <div className="w-full max-w-md bg-[#1c1030]/85 backdrop-blur-xl border border-white/[0.08] rounded-3xl shadow-2xl p-6 md:p-8 relative z-10">
          
          {/* WELCOME SCREEN */}
          {currentPage === 'welcome' && (
            <div className="flex flex-col items-center text-center">
              {/* App logo */}
              <div className="relative flex items-center justify-center w-24 h-24 mb-4">
                <ThieThieLogo variant="icon" size={96} />
              </div>

              <h1 className="text-2xl md:text-3xl font-black tracking-tight leading-none bg-gradient-to-r from-white via-white to-[#a855f7] bg-clip-text text-transparent uppercase">
                Thie Thie Services
              </h1>
              <span className="block text-xs font-bold tracking-widest text-[#a855f7] mt-1.5 uppercase font-mono">
                Gaming Recharge & Points
              </span>

              <p className="text-sm text-white/60 mt-6 leading-relaxed max-w-sm">
                {lang === 'FR' 
                  ? 'Connectez-vous pour commencer à recharger vos jeux favoris et accumuler des points Thie Thie !' 
                  : 'Konekte pou n kòmanse achte kredi jwèt ou yo epi fè pwen Thie Thie !'
                }
              </p>

              {/* Action Buttons */}
              <div className="w-full flex flex-col gap-3.5 mt-8">
                <button
                  id="welcome-signin-btn"
                  onClick={() => { setCurrentPage('login-screen'); setLoginError(null); }}
                  className="w-full bg-[#a855f7] hover:bg-[#c084fc] text-black font-extrabold text-sm py-4 rounded-2xl text-center flex items-center justify-center gap-2.5 shadow-lg shadow-[#a855f7]/10 hover:shadow-[#a855f7]/20 hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  <Lock className="w-4 h-4" />
                  <span>{lang === 'FR' ? 'Se Connecter' : 'Konekte'}</span>
                </button>

                <button
                  id="welcome-signup-btn"
                  onClick={() => { setCurrentPage('register-screen'); setRegisterError(null); }}
                  className="w-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 text-white font-extrabold text-sm py-4 rounded-2xl text-center flex items-center justify-center gap-2.5 hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  <UserCheck className="w-4 h-4 text-[#a855f7]" />
                  <span>{lang === 'FR' ? 'Créer un Compte' : 'Kreye yon Kont'}</span>
                </button>

                {/* Divider */}
                <div className="flex items-center my-3.5 select-none">
                  <div className="flex-grow border-t border-white/[0.08]"></div>
                  <span className="px-4 text-[10px] font-mono text-white/35 uppercase tracking-widest">OU</span>
                  <div className="flex-grow border-t border-white/[0.08]"></div>
                </div>

                {/* Continue with Google */}
                <button
                  id="welcome-google-btn"
                  onClick={handleGoogleSignIn}
                  disabled={authLoading}
                  className="w-full bg-[#1e2a3e] hover:bg-[#25354e] border border-white/[0.08] hover:border-white/15 text-white font-bold text-sm py-4 rounded-2xl text-center flex items-center justify-center gap-2.5 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {authLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                  )}
                  <span>{lang === 'FR' ? 'Continuer avec Google' : 'Kontinye ak Google'}</span>
                </button>

                {/* Continue as guest */}
                <button
                  id="welcome-guest-btn"
                  onClick={() => setCurrentPage('home')}
                  className="w-full mt-2 bg-gradient-to-r from-amber-500/10 to-orange-500/10 hover:from-amber-500/20 hover:to-orange-500/20 border border-amber-500/30 hover:border-amber-500/50 text-[#a855f7] font-black text-sm py-4 rounded-2xl text-center flex items-center justify-center gap-2.5 transition-all cursor-pointer"
                >
                  <Globe className="w-4 h-4 text-[#a855f7]" />
                  <span>{lang === 'FR' ? 'Visiter la boutique (Invité)' : 'Vizite boutik la (Envite)'}</span>
                </button>
              </div>
            </div>
          )}

          {/* SIGN IN SCREEN */}
          {currentPage === 'login-screen' && (
            <div>
              <div className="flex items-center gap-3.5 mb-6">
                <button
                  onClick={() => { setCurrentPage('welcome'); setLoginError(null); }}
                  className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h2 className="text-xl font-black text-white leading-tight">
                    {lang === 'FR' ? 'Se Connecter' : 'Konekte ou'}
                  </h2>
                  <p className="text-xs text-white/50 font-medium font-sans">
                    {lang === 'FR' ? 'Accédez à votre compte gamer' : 'Antre sou kont jwè ou'}
                  </p>
                </div>
              </div>

              {loginError && (
                <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <form onSubmit={handleEmailSignInSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="block text-[10px] text-white/40 uppercase tracking-wider font-extrabold mb-1.5">
                    {lang === 'FR' ? 'Adresse E-mail' : 'Adrès Imel'}
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="gamer@gmail.com"
                      required
                      className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none pl-10"
                    />
                    <Mail className="w-4 h-4 text-white/30 absolute left-3.5 top-3.5" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-[10px] text-white/40 uppercase tracking-wider font-extrabold">
                      {lang === 'FR' ? 'Mot de passe' : 'Mo de pas'}
                    </label>
                    <button
                      type="button"
                      onClick={() => { setCurrentPage('forgot-password-screen'); setForgotError(null); setForgotSuccess(false); }}
                      className="text-[10px] text-[#a855f7] hover:underline font-extrabold cursor-pointer"
                    >
                      {lang === 'FR' ? 'Mot de passe oublié ?' : 'Mo de pas bliye ?'}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none pl-10"
                    />
                    <Lock className="w-4 h-4 text-white/30 absolute left-3.5 top-3.5" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full mt-2 bg-[#a855f7] hover:bg-[#c084fc] text-black font-extrabold text-xs py-4 rounded-xl text-center flex items-center justify-center gap-2 shadow-lg shadow-[#a855f7]/10 hover:shadow-[#a855f7]/20 hover:-translate-y-0.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {authLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{lang === 'FR' ? 'Connexion en cours...' : 'Ap konekte...'}</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>{lang === 'FR' ? 'Se Connecter' : 'Konekte'}</span>
                    </>
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center my-4 select-none">
                <div className="flex-grow border-t border-white/[0.08]"></div>
                <span className="px-4 text-[10px] font-mono text-white/35">OU</span>
                <div className="flex-grow border-t border-white/[0.08]"></div>
              </div>

              {/* Google Sign-In */}
              <button
                onClick={handleGoogleSignIn}
                disabled={authLoading}
                className="w-full bg-[#1e2a3e] hover:bg-[#25354e] border border-white/[0.08] hover:border-white/15 text-white font-bold text-sm py-3.5 rounded-xl text-center flex items-center justify-center gap-2.5 transition-all disabled:opacity-50 cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Google</span>
              </button>
            </div>
          )}

          {/* SIGN UP SCREEN */}
          {currentPage === 'register-screen' && (
            <div>
              <div className="flex items-center gap-3.5 mb-6">
                <button
                  onClick={() => { setCurrentPage('welcome'); setRegisterError(null); }}
                  className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h2 className="text-xl font-black text-white leading-tight">
                    {lang === 'FR' ? "S'inscrire" : 'Kreye yon Kont'}
                  </h2>
                  <p className="text-xs text-white/50 font-medium">
                    {lang === 'FR' ? 'Créez votre profil joueur gratuit' : 'Kreye pwofil jwè gratis ou a'}
                  </p>
                </div>
              </div>

              {registerError && (
                <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{registerError}</span>
                </div>
              )}

              <form onSubmit={handleEmailSignUpSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="block text-[10px] text-white/40 uppercase tracking-wider font-extrabold mb-1.5">
                    {lang === 'FR' ? 'Nom Complet' : 'Non Konplè'}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={registerFullName}
                      onChange={(e) => setRegisterFullName(e.target.value)}
                      placeholder="e.g. Jean Baptiste"
                      required
                      className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none pl-10"
                    />
                    <User className="w-4 h-4 text-white/30 absolute left-3.5 top-3.5" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-white/40 uppercase tracking-wider font-extrabold mb-1.5">
                    {lang === 'FR' ? 'Adresse E-mail' : 'Adrès Imel'}
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      placeholder="gamer@gmail.com"
                      required
                      className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none pl-10"
                    />
                    <Mail className="w-4 h-4 text-white/30 absolute left-3.5 top-3.5" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-white/40 uppercase tracking-wider font-extrabold mb-1.5">
                    {lang === 'FR' ? 'Mot de passe' : 'Mo de pas'}
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      placeholder="•••••••• (Min. 8 car.)"
                      required
                      className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none pl-10"
                    />
                    <Lock className="w-4 h-4 text-white/30 absolute left-3.5 top-3.5" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-white/40 uppercase tracking-wider font-extrabold mb-1.5">
                    {lang === 'FR' ? 'Confirmer le mot de passe' : 'Konfime mo de pas la'}
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={registerConfirmPassword}
                      onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none pl-10"
                    />
                    <Lock className="w-4 h-4 text-white/30 absolute left-3.5 top-3.5" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full mt-2 bg-[#a855f7] hover:bg-[#c084fc] text-black font-extrabold text-xs py-4 rounded-xl text-center flex items-center justify-center gap-2 shadow-lg shadow-[#a855f7]/10 hover:shadow-[#a855f7]/20 hover:-translate-y-0.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {authLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{lang === 'FR' ? 'Création du compte...' : 'Ap kreye kont...'}</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>{lang === 'FR' ? "S'inscrire" : 'Enskri'}</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* FORGOT PASSWORD SCREEN */}
          {currentPage === 'forgot-password-screen' && (
            <div>
              <div className="flex items-center gap-3.5 mb-6">
                <button
                  onClick={() => { setCurrentPage('login-screen'); setForgotError(null); setForgotSuccess(false); }}
                  className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h2 className="text-xl font-black text-white leading-tight">
                    {lang === 'FR' ? 'Mot de passe oublié' : 'Mo de pas bliye'}
                  </h2>
                  <p className="text-xs text-white/50 font-medium">
                    {lang === 'FR' ? 'Récupérez votre mot de passe' : 'Rekipere mo de pas ou'}
                  </p>
                </div>
              </div>

              {forgotError && (
                <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{forgotError}</span>
                </div>
              )}

              {forgotSuccess ? (
                <div className="text-center py-6 flex flex-col items-center">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 animate-bounce">
                    <Check className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-extrabold text-white">
                    {lang === 'FR' ? 'E-mail envoyé !' : 'Imel la voye !'}
                  </h3>
                  <p className="text-xs text-white/60 mt-2 max-w-xs leading-relaxed">
                    {lang === 'FR' 
                      ? 'Un lien de réinitialisation a été envoyé à votre adresse e-mail. Veuillez vérifier votre boîte de réception.' 
                      : 'Nou voye yon lyen pou chanje mo de pas la sou imel ou. Tanpri verifye bwat mesaj ou.'
                    }
                  </p>
                  <button
                    onClick={() => { setCurrentPage('login-screen'); setForgotSuccess(false); }}
                    className="mt-6 w-full py-3.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 text-white text-xs font-extrabold rounded-xl transition-all cursor-pointer"
                  >
                    {lang === 'FR' ? 'Retour à la connexion' : 'Retounen nan koneksyon'}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPasswordSubmit} className="flex flex-col gap-4">
                  <p className="text-xs text-white/60 leading-relaxed mb-2">
                    {lang === 'FR' 
                      ? 'Entrez votre adresse e-mail ci-dessous et nous vous enverrons un lien pour réinitialiser votre mot de passe.' 
                      : 'Antre imel ou anba a epi n ap voye yon lyen pou w ka chanje mo de pas ou.'
                    }
                  </p>

                  <div>
                    <label className="block text-[10px] text-white/40 uppercase tracking-wider font-extrabold mb-1.5">
                      {lang === 'FR' ? 'Adresse E-mail' : 'Adrès Imel'}
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="gamer@gmail.com"
                        required
                        className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none pl-10"
                      />
                      <Mail className="w-4 h-4 text-white/30 absolute left-3.5 top-3.5" />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full mt-2 bg-[#a855f7] hover:bg-[#c084fc] text-black font-extrabold text-xs py-4 rounded-xl text-center flex items-center justify-center gap-2 shadow-lg shadow-[#a855f7]/10 hover:shadow-[#a855f7]/20 hover:-translate-y-0.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {authLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{lang === 'FR' ? 'Envoi en cours...' : 'Ap voye...'}</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>{lang === 'FR' ? 'Envoyer le lien' : 'Voye lyen an'}</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

        </div>
      </div>
    );
  }

  return (
    <div id="app-root" className="min-h-screen flex bg-[var(--tt-bg)]">
      <Sidebar
        lang={lang}
        setLang={setLang}
        theme={theme}
        toggleTheme={toggleTheme}
        currentPage={currentPage}
        selectedCategorySlug={selectedCategorySlug}
        navigateToPage={navigateToPage}
        navigateToCategory={navigateToCategory}
        isAdmin={isAdmin}
        categories={CATEGORIES}
        wishlistCount={wishlist.length}
        user={user}
        walletBalanceCents={walletBalanceCents}
        thieThiePoints={thieThiePoints}
        getLoyaltyLevel={getLoyaltyLevel}
        availableRewards={AVAILABLE_REWARDS}
        redeemedCoupons={redeemedCoupons}
        redeemReward={redeemReward}
        copyCouponToClipboard={copyCouponToClipboard}
        copiedCouponCode={copiedCouponCode}
        onLogin={() => { setAuthMode('login'); setAuthModalOpen(true); }}
        onLogout={handleLogout}
      />

      <div className="flex-1 min-w-0 flex flex-col justify-between pb-16 lg:pb-0">

      {/* GLOBAL TICKER / MOCK RATE INFO */}
      <div className="bg-gradient-to-r from-[#a855f7]/10 via-[#7c3aed]/10 to-[#8b5cf6]/10 text-xs py-1.5 px-4 text-center border-b border-white/[0.05] flex justify-center items-center gap-4 text-[#c9d1d9] overflow-hidden select-none">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#a855f7] animate-pulse"></span>
          Taux du Jour: <strong className="text-white">1 USD = {exchangeRate} HTG</strong>
        </span>
        <span className="hidden md:inline text-white/40">|</span>
        <span className="hidden md:inline flex items-center gap-1 text-white">
          <Zap className="w-3.5 h-3.5" /> Livraison garantie en moins de 5 min par e-mail
        </span>
      </div>

      {/* STICKY NAV HEADER */}
      <header
        id="navbar-sticky"
        className={`sticky top-0 z-50 transition-all duration-300 border-b ${
          scrolled
            ? 'bg-[#0c0714]/95 backdrop-blur-md shadow-xl border-white/[0.08] py-3'
            : 'bg-transparent border-transparent py-5'
        }`}
      >
        <div className="max-w-[1440px] mx-auto px-4 flex justify-between items-center gap-3">

          {/* Logo Brand Left (mobile only — desktop l'a dans la Sidebar) */}
          <div
            id="logo-brand-header"
            onClick={() => navigateToPage('home')}
            className="lg:hidden flex items-center gap-2.5 cursor-pointer select-none group"
          >
            <div className="relative flex items-center justify-center w-11 h-11">
              <ThieThieLogo variant="icon" size={44} />
            </div>
            <div className="whitespace-nowrap">
              <span className="block font-extrabold text-base md:text-lg tracking-wider leading-none bg-gradient-to-r from-white via-white to-[#a855f7] bg-clip-text text-transparent">
                THIE THIE
              </span>
              <span className="block text-[10px] font-bold tracking-widest text-white/60 mt-0.5 uppercase">
                Services
              </span>
            </div>
          </div>

          {/* Search, Currency Toggle & Lang selector (nav principale déportée dans Sidebar/BottomTabBar) */}
          <div id="right-side-actions" className="flex items-center gap-2 md:gap-3">
            
            {/* Search Input Button */}
            <div className="relative hidden md:block">
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onFocus={() => setShowSearchSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSearchSuggestions(false), 200)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (currentPage !== 'category') {
                    setCurrentPage('category');
                    setSelectedCategorySlug(null);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addRecentSearch(searchQuery);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="bg-[#1c1030]/80 border border-white/[0.08] text-xs px-4 py-2 pl-9 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-[#a855f7]/50 focus:ring-1 focus:ring-[#a855f7]/20 w-36 lg:w-52 transition-all"
              />
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-white/40" />
              
              {/* Dynamic Search Suggestions & Recent Searches Popover */}
              {showSearchSuggestions && (
                <div className="absolute top-12 left-0 w-full bg-[#1c1030] border border-white/[0.08] rounded-xl shadow-2xl p-2 z-50 max-h-72 overflow-y-auto">
                  {searchQuery ? (
                    searchSuggestions.length > 0 ? (
                      searchSuggestions.map((p) => (
                        <div
                          key={p.id}
                          onMouseDown={() => {
                            addRecentSearch(searchQuery);
                            setSelectedProduct(p);
                            setSelectedRegionIndex(0);
                            setSelectedAmountIndex(Math.floor(p.options.length / 2));
                          }}
                          className="flex items-center gap-3 p-2 hover:bg-white/[0.04] rounded-lg cursor-pointer transition-colors"
                        >
                          <img src={p.image} className="w-8 h-8 rounded object-cover" alt="" referrerPolicy="no-referrer" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold truncate text-white">{p.name}</p>
                            <p className="text-[10px] text-white/50">{formatPrice(priceOf(p, 0))}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-white/50 p-2 text-center">Aucun résultat</p>
                    )
                  ) : (
                    /* Display Recent Searches when focused but empty */
                    <div className="flex flex-col gap-1 p-1">
                      <div className="flex items-center justify-between px-1 py-1 border-b border-white/[0.04] mb-1">
                        <span className="text-[10px] uppercase tracking-wider font-extrabold text-white/40">
                          {lang === 'FR' ? 'Recherches récentes' : 'Chache ki sot pase yo'}
                        </span>
                        {recentSearches.length > 0 && (
                          <button
                            onMouseDown={(e) => {
                              e.preventDefault(); // prevent input blur
                              e.stopPropagation();
                              setRecentSearches([]);
                              localStorage.removeItem('recentSearches');
                            }}
                            className="text-[9px] font-black text-[#a855f7] hover:text-[#a855f7]/85 transition-colors uppercase tracking-wider"
                          >
                            {lang === 'FR' ? 'Effacer tout' : 'Klè tout'}
                          </button>
                        )}
                      </div>
                      {recentSearches.length > 0 ? (
                        recentSearches.map((term, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-2 hover:bg-white/[0.04] rounded-lg cursor-pointer transition-colors group/item"
                            onMouseDown={() => {
                              setSearchQuery(term);
                              if (currentPage !== 'category') {
                                setCurrentPage('category');
                                setSelectedCategorySlug(null);
                              }
                            }}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <History className="w-3.5 h-3.5 text-white/30 group-hover/item:text-[#a855f7] transition-colors" />
                              <span className="text-xs font-semibold text-white/85 truncate">{term}</span>
                            </div>
                            <button
                              onMouseDown={(e) => {
                                e.preventDefault(); // prevent blur
                                e.stopPropagation(); // prevent setting search query
                                setRecentSearches((prev) => {
                                  const updated = prev.filter((_, i) => i !== index);
                                  localStorage.setItem('recentSearches', JSON.stringify(updated));
                                  return updated;
                                });
                              }}
                              className="p-1 opacity-0 group-hover/item:opacity-100 text-white/35 hover:text-white transition-opacity"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="text-[10px] text-white/35 p-3 text-center italic">
                          {lang === 'FR' ? 'Aucune recherche récente' : 'Pa gen ankenn chache resan'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* CURRENCY TOGGLE (USD / HTG) */}
            <div id="currency-toggle-wrapper" className="flex bg-[#1c1030] border border-white/[0.08] rounded-xl p-[3px] select-none">
              <button
                onClick={() => setCurrency('USD')}
                className={`px-2.5 py-1 text-[11px] font-extrabold rounded-lg transition-all ${
                  currency === 'USD'
                    ? 'bg-[#a855f7] text-[#0c0714] shadow-md'
                    : 'text-[#c9d1d9] hover:text-white'
                }`}
              >
                USD
              </button>
              <button
                onClick={() => setCurrency('HTG')}
                className={`px-2.5 py-1 text-[11px] font-extrabold rounded-lg transition-all ${
                  currency === 'HTG'
                    ? 'bg-[#a855f7] text-[#0c0714] shadow-md'
                    : 'text-[#c9d1d9] hover:text-white'
                }`}
              >
                HTG
              </button>
            </div>

            {/* LANGUAGE SELECTOR (mobile — desktop l'a dans la Sidebar) */}
            <div id="language-toggle-wrapper" className="lg:hidden flex bg-[#1c1030] border border-white/[0.08] rounded-xl p-[3px] select-none">
              <button
                onClick={() => setLang('FR')}
                className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  lang === 'FR' ? 'bg-[#8b5cf6] text-white shadow-md' : 'text-[#c9d1d9] hover:text-white'
                }`}
              >
                FR
              </button>
              <button
                onClick={() => setLang('HT')}
                className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  lang === 'HT' ? 'bg-[#8b5cf6] text-white shadow-md' : 'text-[#c9d1d9] hover:text-white'
                }`}
              >
                HT
              </button>
            </div>

            {/* THEME TOGGLE (mobile — desktop l'a dans la Sidebar) */}
            <button
              onClick={toggleTheme}
              className="lg:hidden p-2 bg-[#1c1030] border border-white/[0.08] rounded-xl text-[#c9d1d9] hover:text-white hover:bg-white/[0.04] transition-all flex items-center justify-center active:scale-95"
              title={theme === 'dark' ? (lang === 'FR' ? 'Mode Clair' : 'Mòd Klè') : (lang === 'FR' ? 'Mode Sombre' : 'Mòd Fènwa')}
              aria-label="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-500" />}
            </button>

            {/* Wallet, fidélité, auth, wishlist : déplacés dans Sidebar (desktop) / BottomTabBar (mobile) */}
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main id="main-content-flow" className="flex-grow">
        
        {/* ==========================================
            1. HOME VIEW STATE
            ========================================== */}
        {currentPage === 'home' && (
          <div id="home-view" className="animate-fadeIn">
            
            {/* HERO CAROUSEL */}
            <section id="hero-slider-section" className="relative max-w-7xl mx-auto px-4 mt-6">
              <div className="relative h-[420px] md:h-[580px] lg:h-[650px] w-full rounded-3xl overflow-hidden shadow-2xl border border-white/[0.08]">
                
                {HERO_SLIDES.map((slide, idx) => {
                  const isActive = idx === currentHeroSlide;
                  return (
                    <div
                      key={slide.id}
                      className={`absolute inset-0 w-full h-full flex flex-col md:flex-row items-center transition-opacity duration-700 ease-in-out ${
                        isActive ? 'opacity-100 z-20' : 'opacity-0 z-0 pointer-events-none'
                      }`}
                      aria-hidden={!isActive}
                    >
                      {/* Left Gradient content */}
                      <div className={`absolute inset-0 bg-gradient-to-tr ${slide.gradient} opacity-90 z-0`} />
                      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent z-0" />

                      <div className="relative z-20 flex-1 h-full flex flex-col justify-center px-6 md:px-16 lg:px-24 text-left max-w-2xl">
                        <span className="inline-flex items-center gap-1.5 bg-[#a855f7] text-black font-extrabold text-[10px] md:text-xs uppercase tracking-widest px-3 py-1 rounded-full mb-4 w-max">
                          <slide.subtitleIcon className="w-3 h-3 md:w-3.5 md:h-3.5" />
                          {slide.subtitle}
                        </span>
                        <h2 className="text-3xl md:text-5xl lg:text-6xl font-black text-white tracking-tight mb-4 drop-shadow-md">
                          {slide.title}
                        </h2>
                        <p className="text-sm md:text-base text-white/80 max-w-lg mb-8 leading-relaxed font-medium">
                          {lang === 'FR' ? slide.desc : slide.descHT}
                        </p>
                        
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => navigateToCategory(slide.slug)}
                            className="bg-[#a855f7] hover:bg-[#a855f7]/90 text-[#0c0714] font-extrabold text-sm px-8 py-3.5 rounded-2xl shadow-xl hover:shadow-[#a855f7]/20 transition-all hover:-translate-y-0.5"
                          >
                            {slide.cta} {lang === 'FR' ? 'Maintenant' : 'Kounye a'}
                          </button>
                        </div>
                      </div>

                      {/* Right artwork image (adapted dynamically for mobile as an ambient background) */}
                      <div className="absolute inset-0 md:left-auto md:right-0 md:w-1/2 z-10 pointer-events-none overflow-hidden">
                        {/* Shading filters to maximize text contrast */}
                        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/40 to-transparent md:hidden" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 md:hidden" />
                        <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-black/30 to-transparent hidden md:block" />
                        <img
                          src={slide.image}
                          alt={slide.title}
                          className="w-full h-full object-cover opacity-35 md:opacity-65 transition-opacity duration-700"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Left/Right Manual Navigation Controls */}
                <button
                  onClick={() =>
                    setCurrentHeroSlide((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length)
                  }
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-black/40 hover:bg-[#a855f7] text-white hover:text-black flex items-center justify-center backdrop-blur-sm border border-white/10 hover:border-transparent transition-all"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setCurrentHeroSlide((prev) => (prev + 1) % HERO_SLIDES.length)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-black/40 hover:bg-[#a855f7] text-white hover:text-black flex items-center justify-center backdrop-blur-sm border border-white/10 hover:border-transparent transition-all"
                >
                  <ArrowRight className="w-5 h-5" />
                </button>

                {/* Bottom Pagination Dots */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-2.5">
                  {HERO_SLIDES.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentHeroSlide(idx)}
                      className={`h-2.5 rounded-full transition-all duration-300 ${
                        idx === currentHeroSlide ? 'bg-[#a855f7] w-8' : 'bg-white/40 w-2.5'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </section>

            {/* CATEGORY HIGHLIGHTS AUTO-PLAYING CAROUSEL */}
            <section 
              id="category-carousel-section" 
              className="max-w-7xl mx-auto px-4 mt-16"
              onMouseEnter={() => setIsCategoryCarouselHovered(true)}
              onMouseLeave={() => setIsCategoryCarouselHovered(false)}
            >
              <div className="flex justify-between items-end mb-6">
                <div>
                  <h3 className="text-xl md:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#a855f7] animate-pulse" />
                    {lang === 'FR' ? 'En Vedette' : 'Seksyon an Vedèt'}
                  </h3>
                  <p className="text-xs text-white/50 mt-1">
                    {lang === 'FR' ? 'Accédez directement à nos univers gaming les plus populaires' : 'Aksè rapid sou pi bon kategori jwèt nou yo'}
                  </p>
                </div>
                
                {/* Carousel Navigation Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setCategoryCarouselIndex((prev) => 
                        prev === 0 ? HIGHLIGHTED_CATEGORIES.length - 1 : prev - 1
                      );
                    }}
                    className="w-10 h-10 rounded-xl bg-[#1c1030] border border-white/[0.08] text-white/70 hover:text-white hover:bg-[#a855f7] hover:text-black flex items-center justify-center transition-all shadow-md active:scale-95"
                    aria-label="Previous Highlight"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setCategoryCarouselIndex((prev) => (prev + 1) % HIGHLIGHTED_CATEGORIES.length);
                    }}
                    className="w-10 h-10 rounded-xl bg-[#1c1030] border border-white/[0.08] text-white/70 hover:text-white hover:bg-[#a855f7] hover:text-black flex items-center justify-center transition-all shadow-md active:scale-95"
                    aria-label="Next Highlight"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Slider Viewport */}
              <div className="overflow-hidden rounded-3xl border border-white/[0.06] bg-[#0c1017] relative group">
                <div 
                  className="flex transition-transform duration-700 ease-out"
                  style={{
                    transform: `translateX(-${categoryCarouselIndex * 100}%)`,
                  }}
                >
                  {HIGHLIGHTED_CATEGORIES.map((cat, idx) => {
                    const tagline = lang === 'FR' ? cat.taglineFR : cat.taglineHT;
                    const badge = lang === 'FR' ? cat.badgeFR : cat.badgeHT;
                    const BadgeIcon = cat.badgeIcon;
                    
                    return (
                      <div 
                        key={cat.slug} 
                        className="w-full shrink-0 p-6 md:p-10 min-h-[220px] md:min-h-[280px] flex flex-col justify-between relative overflow-hidden cursor-pointer"
                        onClick={() => navigateToCategory(cat.slug)}
                      >
                        {/* Background Image with Ambient Glow overlay */}
                        <div className="absolute inset-0 z-0">
                          <img 
                            src={cat.image} 
                            alt={cat.name} 
                            className="w-full h-full object-cover object-center group-hover:scale-102 transition-transform duration-1000 opacity-30"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-gradient-to-r from-[#0c0714] via-[#0c0714]/90 to-transparent" />
                          <div className={`absolute -right-20 -bottom-20 w-80 h-80 rounded-full bg-gradient-to-tr ${cat.gradient} opacity-20 blur-3xl`} />
                        </div>

                        {/* Slide Content */}
                        <div className="relative z-10 max-w-lg flex flex-col justify-between h-full gap-4">
                          <div>
                            {/* Premium Badge */}
                            <span
                              className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md mb-3"
                              style={{ backgroundColor: `${cat.color}20`, color: cat.color, border: `1px solid ${cat.color}35` }}
                            >
                              {BadgeIcon && <BadgeIcon className="w-2.5 h-2.5" />}
                              {badge}
                            </span>
                            
                            {/* Category Title */}
                            <h4 className="text-xl md:text-3xl font-black text-white tracking-tight leading-none mb-2">
                              {cat.name}
                            </h4>
                            
                            {/* Tagline */}
                            <p className="text-xs md:text-sm text-white/60 font-medium">
                              {tagline}
                            </p>
                          </div>

                          {/* Quick Action button */}
                          <div className="mt-4">
                            <span 
                              className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider px-5 py-3 rounded-xl transition-all"
                              style={{ backgroundColor: cat.color, color: '#0c0714' }}
                            >
                              <span>{lang === 'FR' ? "Explorer la Section" : "Antre nan Seksyon sa"}</span>
                              <ArrowRight className="w-4 h-4 text-[#0c0714]" />
                            </span>
                          </div>
                        </div>

                        {/* Top corner slide index indicator for micro visual flair */}
                        <div className="absolute top-6 right-8 text-[11px] font-mono text-white/20 font-bold">
                          {String(idx + 1).padStart(2, '0')} / {String(HIGHLIGHTED_CATEGORIES.length).padStart(2, '0')}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Micro pagination selector indicators */}
                <div className="absolute bottom-6 right-8 z-20 flex gap-1.5">
                  {HIGHLIGHTED_CATEGORIES.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCategoryCarouselIndex(idx);
                      }}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        idx === categoryCarouselIndex 
                          ? 'bg-[#a855f7] w-6' 
                          : 'bg-white/20 w-1.5 hover:bg-white/40'
                      }`}
                      aria-label={`Go to slide ${idx + 1}`}
                    />
                  ))}
                </div>
              </div>
            </section>

            {/* CATEGORIES GRID */}
            <section id="categories-grid-section" className="max-w-7xl mx-auto px-4 mt-16">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
                <div>
                  <h3 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                    {lang === 'FR' ? 'Catégories Populaires' : 'Kategori ki Popilè yo'}
                  </h3>
                  <p className="text-xs text-white/50 mt-1">
                    {lang === 'FR' ? 'Explorez nos recharges de jeux vidéo et abonnements' : 'Gade tout bèl sèvis nimerik ak jwèt videyo yo'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {CATEGORIES.map((cat) => {
                  const IconComponent = cat.icon;
                  return (
                    <TiltCard
                      key={cat.slug}
                      onClick={() => navigateToCategory(cat.slug)}
                      className="group bg-[#1c1030] border border-white/[0.08] rounded-2xl p-5 overflow-hidden flex flex-col items-center text-center"
                    >
                      {/* background ambient glow */}
                      <div className={`absolute -right-8 -bottom-8 w-24 h-24 rounded-full bg-gradient-to-tr ${cat.gradient} opacity-5 blur-2xl group-hover:scale-125 transition-transform duration-500`} />

                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${cat.gradient} flex items-center justify-center text-black font-extrabold mb-4 group-hover:scale-110 transition-transform`}>
                        <IconComponent className="w-6 h-6 text-black" />
                      </div>

                      <h4 className="text-sm font-extrabold text-white group-hover:text-[#a855f7] transition-colors truncate w-full">
                        {cat.name}
                      </h4>
                      <p className="text-[10px] text-white/40 font-semibold mt-1">
                        {cat.count} Products
                      </p>
                    </TiltCard>
                  );
                })}
              </div>
            </section>

            {/* EXCLUSIVE OFFERS */}
            <section id="exclusive-offers-section" className="max-w-7xl mx-auto px-4 mt-20">
              <div className="text-center mb-12">
                <span className="text-[#a855f7] text-xs font-black tracking-widest uppercase bg-[#a855f7]/10 px-3.5 py-1.5 rounded-full">
                  {t('exclusiveTitle')}
                </span>
                <h3 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight mt-3">
                  {t('exclusiveSubtitle')}
                </h3>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                {PRODUCTS.filter((p) => p.isPromo).slice(0, 4).map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedProduct(p);
                      setSelectedRegionIndex(0);
                      setSelectedAmountIndex(Math.floor(p.options.length / 2));
                    }}
                    className="group bg-[#1c1030] border border-white/[0.08] hover:border-[#a855f7]/30 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 transform hover:-translate-y-1.5 hover:scale-[1.03] hover:shadow-2xl"
                  >
                    <div className="relative aspect-square overflow-hidden bg-slate-900">
                      <ProductImageWithSkeleton
                        src={p.image}
                        alt={p.name}
                        imgClassName="group-hover:scale-110 transition-transform duration-500"
                      />
                      {/* Gradient mask */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      
                      {/* Promo Badge */}
                      <span className="absolute top-3 left-3 bg-gradient-to-r from-[#a855f7] to-[#c084fc] text-[#0c0714] font-black text-[10px] uppercase px-2.5 py-1 rounded-md shadow-md animate-pulse">
                        PROMO {p.discountBadge}
                      </span>

                      {/* Top Right Wishlist action button */}
                      <button
                        onClick={(e) => toggleWishlist(p.id, e)}
                        className="absolute top-3 right-3 p-2 rounded-lg bg-black/40 hover:bg-black/60 text-white backdrop-blur-sm transition-colors"
                      >
                        <Heart
                          className={`w-4.5 h-4.5 ${
                            wishlist.includes(p.id) ? 'fill-[#a855f7] text-[#a855f7]' : 'text-white'
                          }`}
                        />
                      </button>

                      {/* Rating Badge */}
                      <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-[#0c0714]/80 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-bold text-[#c084fc]">
                        <Star className="w-3 h-3 fill-current" />
                        <span>{p.rating}</span>
                      </div>
                    </div>

                    <div className="p-4">
                      <p className="text-[10px] font-bold text-[#8b5cf6] uppercase tracking-wider">
                        {p.regions[0]}
                      </p>
                      <h4 className="text-sm font-extrabold text-white mt-1 group-hover:text-[#a855f7] transition-colors truncate">
                        {p.name}
                      </h4>
                      
                      {/* Pricing Display */}
                      <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-base font-black text-white tabular-nums">
                          {formatPrice(priceOf(p, 0))}
                        </span>
                        <span className="text-xs text-white/40 line-through tabular-nums">
                          {formatPrice(priceOf(p, 0) * 1.2)}
                        </span>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-2 text-[10px] text-white/50 border-t border-white/[0.05] pt-3">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-[#c084fc]" />
                          {p.deliveryTime}
                        </span>
                        <span className="bg-[#10b981]/10 text-[#10b981] font-bold px-2 py-0.5 rounded-full uppercase">
                          {t('stock')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* RECENT PRODUCTS */}
            <section id="recent-products-section" className="max-w-7xl mx-auto px-4 mt-20">
              <div className="flex justify-between items-end mb-8">
                <div>
                  <h3 className="text-xl md:text-3xl font-black text-white tracking-tight">
                    {t('recentTitle')}
                  </h3>
                  <p className="text-xs text-white/50 mt-1">
                    {lang === 'FR' ? 'Accès direct aux dernières nouveautés de recharge' : 'Rechaje jwèt ak dènye of yo fasil'}
                  </p>
                </div>
                <button
                  onClick={() => navigateToPage('category')}
                  className="bg-white/[0.04] hover:bg-white/[0.08] text-white text-xs font-bold px-5 py-2.5 rounded-xl border border-white/[0.05] transition-all flex items-center gap-2"
                >
                  <span>{t('viewAll')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {PRODUCTS.slice(0, 12).map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedProduct(p);
                      setSelectedRegionIndex(0);
                      setSelectedAmountIndex(Math.floor(p.options.length / 2));
                    }}
                    className="group bg-[#1c1030] border border-white/[0.08] hover:border-[#a855f7]/30 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 transform hover:-translate-y-1 hover:scale-[1.03] hover:shadow-xl"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-slate-900">
                      <ProductImageWithSkeleton
                        src={p.image}
                        alt={p.name}
                        imgClassName="group-hover:scale-105 transition-transform duration-300"
                      />
                      <button
                        onClick={(e) => toggleWishlist(p.id, e)}
                        className="absolute top-2 right-2 p-1.5 rounded bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 transition-colors"
                      >
                        <Heart className={`w-4 h-4 ${wishlist.includes(p.id) ? 'fill-[#a855f7] text-[#a855f7]' : 'text-white'}`} />
                      </button>
                    </div>

                    <div className="p-3">
                      <span className="text-[9px] font-bold text-[#a855f7] bg-[#a855f7]/10 px-1.5 py-0.5 rounded uppercase">
                        {p.regions[0]}
                      </span>
                      <h4 className="text-xs font-extrabold text-white mt-1.5 truncate group-hover:text-[#a855f7] transition-colors">
                        {p.name}
                      </h4>
                      <div className="mt-2 text-xs font-bold text-[#10b981] tabular-nums">
                        {formatPrice(priceOf(p, 0))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* WHY CHOOSE US & ANIMATED STATS */}
            <section id="why-choose-us-section" className="bg-[#1c1030]/40 border-y border-white/[0.04] mt-24 py-20">
              <div className="max-w-7xl mx-auto px-4">
                
                <div className="text-center max-w-2xl mx-auto mb-16">
                  <h3 className="text-2xl md:text-4xl font-extrabold tracking-tight text-white">
                    {t('whyChooseUs')}
                  </h3>
                  <p className="text-xs md:text-sm text-white/50 mt-3 leading-relaxed">
                    {t('whySubtitle')}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="bg-[#1c1030] border border-white/[0.06] rounded-2xl p-6 relative overflow-hidden group">
                    <div className="w-12 h-12 rounded-xl bg-[#a855f7]/10 flex items-center justify-center text-[#a855f7] mb-5">
                      <Zap className="w-6 h-6" />
                    </div>
                    <h4 className="text-base font-extrabold text-white mb-2">{t('instantDelivery')}</h4>
                    <p className="text-xs text-white/50 leading-relaxed">{t('instantDeliveryDesc')}</p>
                  </div>

                  <div className="bg-[#1c1030] border border-white/[0.06] rounded-2xl p-6 relative overflow-hidden group">
                    <div className="w-12 h-12 rounded-xl bg-[#8b5cf6]/10 flex items-center justify-center text-[#8b5cf6] mb-5">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <h4 className="text-base font-extrabold text-white mb-2">{t('securePayments')}</h4>
                    <p className="text-xs text-white/50 leading-relaxed">{t('securePaymentsDesc')}</p>
                  </div>

                  <div className="bg-[#1c1030] border border-white/[0.06] rounded-2xl p-6 relative overflow-hidden group">
                    <div className="w-12 h-12 rounded-xl bg-[#7c3aed]/10 flex items-center justify-center text-[#7c3aed] mb-5">
                      <HelpCircle className="w-6 h-6" />
                    </div>
                    <h4 className="text-base font-extrabold text-white mb-2">{t('support247')}</h4>
                    <p className="text-xs text-white/50 leading-relaxed">{t('support247Desc')}</p>
                  </div>
                </div>

                {/* Animated Stats banner */}
                <div className="grid grid-cols-3 gap-4 bg-[#1c1030] border border-white/[0.06] rounded-2xl mt-12 p-6 md:p-8 text-center">
                  <div>
                    <p className="text-2xl md:text-4xl font-black text-[#a855f7] tabular-nums">1000+</p>
                    <p className="text-[10px] md:text-xs text-white/40 font-bold uppercase mt-1">Commandes</p>
                  </div>
                  <div>
                    <p className="text-2xl md:text-4xl font-black text-[#8b5cf6] tabular-nums">500+</p>
                    <p className="text-[10px] md:text-xs text-white/40 font-bold uppercase mt-1">Joueurs Heureux</p>
                  </div>
                  <div>
                    <p className="text-2xl md:text-4xl font-black text-[#7c3aed] tabular-nums">24/7</p>
                    <p className="text-[10px] md:text-xs text-white/40 font-bold uppercase mt-1">Assistance Live</p>
                  </div>
                </div>

              </div>
            </section>

            {/* TESTIMONIALS */}
            <section id="testimonials-section" className="max-w-7xl mx-auto px-4 mt-20">
              <div className="text-center mb-12">
                <h3 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
                  {t('testimonialsTitle')}
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {TESTIMONIALS.map((test, index) => (
                  <div key={index} className="bg-[#1c1030] border border-white/[0.08] rounded-2xl p-6 flex flex-col justify-between">
                    <div>
                      <div className="flex gap-1 mb-4 text-[#c084fc]">
                        {[...Array(test.stars)].map((_, i) => (
                          <Star key={i} className="w-4 h-4 fill-current" />
                        ))}
                      </div>
                      <p className="text-xs text-white/80 leading-relaxed italic">
                        "{lang === 'FR' ? test.text : test.textHT}"
                      </p>
                    </div>

                    <div className="flex items-center gap-3 mt-6 border-t border-white/[0.05] pt-4">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#a855f7] to-[#7c3aed] flex items-center justify-center font-bold text-xs text-black">
                        {test.name[0]}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white flex items-center gap-1.5">
                          {test.name} <MapPin className="w-3 h-3 text-white/40" />
                        </p>
                        <p className="text-[10px] text-white/40 font-semibold">{test.role}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* PARTNERS */}
            <section id="partners-section" className="max-w-7xl mx-auto px-4 mt-24 mb-16 overflow-hidden">
              <div className="text-center mb-8">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40">
                  {t('partnersTitle')}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-6 md:gap-12 opacity-50 hover:opacity-80 transition-opacity">
                {PARTNERS.map((partner, index) => (
                  <span key={index} className="inline-flex items-center gap-1.5 text-xs md:text-sm font-black tracking-widest text-white select-none">
                    <partner.icon className="w-3.5 h-3.5 md:w-4 md:h-4" style={{ color: partner.color }} />
                    {partner.name}
                  </span>
                ))}
              </div>
            </section>

          </div>
        )}


        {/* ==========================================
            WISHLIST VIEW STATE
            ========================================== */}
        {currentPage === 'wishlist' && (
          <div id="wishlist-catalog-view" className="max-w-7xl mx-auto px-4 py-8 animate-fadeIn">
            
            {/* Breadcrumb / Intro Header */}
            <div className="mb-6 flex items-center gap-2 text-xs text-white/40 font-semibold">
              <span className="cursor-pointer hover:text-white" onClick={() => navigateToPage('home')}>{t('accueil')}</span>
              <span>/</span>
              <span className="text-[#a855f7]">
                {lang === 'FR' ? 'Mes Favoris' : 'Favori Mwen'}
              </span>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-5 border-b border-white/[0.06]">
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white tracking-tight flex items-center gap-3">
                  <Heart className="w-6 h-6 md:w-8 md:h-8 text-[#a855f7] fill-[#a855f7]" />
                  <span>{lang === 'FR' ? 'Mes Favoris' : 'Favori Mwen'}</span>
                  <span className="text-xs bg-[#a855f7]/10 text-[#a855f7] px-2.5 py-1 rounded-full font-extrabold border border-[#a855f7]/20">
                    {wishlist.length} {wishlist.length > 1 ? 'Articles' : 'Article'}
                  </span>
                </h2>
                <p className="text-xs text-white/50 mt-1.5 leading-relaxed">
                  {lang === 'FR' 
                    ? 'Retrouvez tous vos jeux et services préférés ici. Cliquez pour voir les détails ou commander directement sur le site.' 
                    : 'Jwenn tout jwèt ak sèvis ou pi renmen yo la a. Klike pou wè detay oswa kòmande dirèkteman sou sit la.'}
                </p>
              </div>

              {wishlist.length > 0 && (
                <button
                  id="clear-all-favorites"
                  onClick={() => {
                    if (window.confirm(lang === 'FR' ? 'Voulez-vous vraiment vider votre liste de favoris ?' : 'Èske ou vle efase tout favori ou yo ?')) {
                      setWishlist([]);
                    }
                  }}
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 text-xs font-black px-4 py-2.5 rounded-xl border border-red-500/20 hover:border-red-500/40 transition-all flex items-center gap-2 self-start md:self-auto"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{lang === 'FR' ? 'Tout vider' : 'Tout efase'}</span>
                </button>
              )}
            </div>

            {/* Check if wishlist is empty */}
            {wishlist.length === 0 ? (
              <div id="empty-wishlist-view" className="text-center py-20 px-6 bg-[#1c1030]/50 border border-white/[0.06] rounded-3xl max-w-2xl mx-auto my-12 backdrop-blur-sm">
                <div className="w-16 h-16 rounded-full bg-[#a855f7]/10 border border-[#a855f7]/20 flex items-center justify-center mx-auto mb-6 animate-pulse">
                  <Heart className="w-8 h-8 text-[#a855f7]" />
                </div>
                <h3 className="text-lg md:text-xl font-black text-white">
                  {lang === 'FR' ? 'Votre liste est vide' : 'Lis ou a vid'}
                </h3>
                <p className="text-xs text-white/50 mt-3 max-w-md mx-auto leading-relaxed font-medium">
                  {lang === 'FR'
                    ? 'Ajoutez des jeux, des abonnements de streaming ou des cartes cadeaux à vos favoris en cliquant sur l\'icône de cœur pour les retrouver rapidement ici.'
                    : 'Ajoute jwèt, abònman streaming, oswa kat kado nan favori w yo lè w klike sou ikòn kè a pou w ka jwenn yo pi fasil la a.'}
                </p>
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    onClick={() => {
                      setCurrentPage('category');
                      setSelectedCategorySlug(null);
                      setSearchQuery('');
                    }}
                    className="w-full sm:w-auto bg-gradient-to-r from-[#a855f7] to-[#7e22ce] hover:from-[#7e22ce] hover:to-[#a855f7] text-[#0c0714] font-black text-xs px-6 py-3.5 rounded-xl transition-all shadow-lg shadow-[#a855f7]/10 hover:shadow-[#a855f7]/20 flex items-center justify-center gap-2"
                  >
                    <Gamepad2 className="w-4 h-4" />
                    <span>{lang === 'FR' ? 'Découvrir la Boutique' : 'Gade Boutik la'}</span>
                  </button>
                  <button
                    onClick={() => navigateToPage('home')}
                    className="w-full sm:w-auto bg-white/5 hover:bg-white/10 text-white font-bold text-xs px-6 py-3.5 rounded-xl border border-white/10 transition-colors flex items-center justify-center gap-2"
                  >
                    <span>{lang === 'FR' ? 'Retour à l\'accueil' : 'Retounen sou paj dakyèy'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {PRODUCTS.filter(p => wishlist.includes(p.id)).map((p) => {
                  const lowestOption = p.options[0] || { amount: 'Default', priceUSD: 0 };
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedProduct(p);
                        setSelectedRegionIndex(0);
                        setSelectedAmountIndex(Math.floor(p.options.length / 2));
                      }}
                      className="group bg-[#1c1030]/85 border border-white/[0.08] hover:border-[#a855f7]/30 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 transform hover:-translate-y-1.5 hover:scale-[1.03] hover:shadow-2xl flex flex-col justify-between"
                    >
                      {/* Product Image Panel */}
                      <div className="relative aspect-square overflow-hidden bg-slate-900">
                        <ProductImageWithSkeleton
                          src={p.image}
                          alt={p.name}
                          imgClassName="group-hover:scale-105 transition-transform duration-300"
                        />
                        {/* Remove from wishlist button overlay */}
                        <button
                          onClick={(e) => toggleWishlist(p.id, e)}
                          className="absolute top-2.5 right-2.5 p-2 rounded-xl bg-black/50 text-red-400 hover:text-red-300 hover:bg-black/80 backdrop-blur-sm transition-all shadow-md"
                          title={lang === 'FR' ? 'Retirer des favoris' : 'Retire nan favori'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        {p.isPromo && (
                          <span className="absolute top-2.5 left-2.5 bg-gradient-to-r from-[#a855f7] to-[#7e22ce] text-black font-black text-[9px] uppercase px-2.5 py-1 rounded-md shadow-md tracking-wider">
                            PROMO
                          </span>
                        )}
                      </div>

                      {/* Content Panel */}
                      <div className="p-4 flex-grow flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[9px] font-black text-[#8b5cf6] uppercase tracking-wider bg-[#8b5cf6]/10 px-2 py-0.5 rounded-md border border-[#8b5cf6]/10">
                              {p.regions[0] || 'Global'}
                            </span>
                            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold px-2 py-0.5 rounded uppercase">
                              {t('stock')}
                            </span>
                          </div>
                          <h3 className="text-xs md:text-sm font-extrabold text-white mt-2.5 group-hover:text-[#a855f7] transition-colors truncate">
                            {p.name}
                          </h3>
                          <p className="text-[10px] text-white/50 mt-1 line-clamp-2 leading-relaxed">
                            {lang === 'FR' ? p.descriptionFR : p.descriptionHT}
                          </p>
                        </div>

                        <div className="mt-4 border-t border-white/[0.05] pt-3">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="text-[9px] text-white/40 font-bold uppercase tracking-wide">
                                {lang === 'FR' ? 'À partir de' : 'Kòmanse nan'}
                              </p>
                              <p className="text-sm font-black text-white tabular-nums">{formatPrice(priceOf(p, 0))}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            {/* Action 1: Remove */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleWishlist(p.id);
                              }}
                              className="text-white/60 hover:text-white bg-white/5 hover:bg-white/10 text-[10px] font-bold py-2 rounded-xl transition-colors border border-white/5 flex items-center justify-center gap-1"
                            >
                              <HeartCrack className="w-3.5 h-3.5 text-red-400" />
                              <span>{lang === 'FR' ? 'Retirer' : 'Retire'}</span>
                            </button>

                            {/* Action 2: Buy */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProduct(p);
                                setSelectedRegionIndex(0);
                                setSelectedAmountIndex(Math.floor(p.options.length / 2));
                              }}
                              className="bg-[#a855f7] text-black text-[10px] font-black py-2 rounded-xl hover:bg-[#a855f7]/90 transition-all flex items-center justify-center gap-1 shadow-md shadow-[#a855f7]/5"
                            >
                              <Send className="w-3 h-3" />
                              <span>{lang === 'FR' ? 'Acheter' : 'Achte'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}


        {/* ==========================================
            2. CATEGORY / SEARCH VIEW STATE
            ========================================== */}
        {currentPage === 'category' && (
          <div id="category-catalog-view" className="max-w-7xl mx-auto px-4 py-8 animate-fadeIn">
            
            {/* Breadcrumb / Intro Header */}
            <div className="mb-6 flex items-center gap-2 text-xs text-white/40 font-semibold">
              <span className="cursor-pointer hover:text-white" onClick={() => navigateToPage('home')}>{t('accueil')}</span>
              <span>/</span>
              <span className="text-[#a855f7]">
                {selectedCategorySlug 
                  ? CATEGORIES.find(c => c.slug === selectedCategorySlug)?.name 
                  : searchQuery 
                    ? `${t('searchResultFor')} "${searchQuery}"` 
                    : t('allProducts')
                }
              </span>
            </div>

            {/* Banner Category */}
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-[#1c1030] to-[#0c0714] border border-white/[0.08] p-6 md:p-10 mb-8">
              <div className="relative z-10 max-w-xl">
                <h1 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight">
                  {selectedCategorySlug 
                    ? CATEGORIES.find(c => c.slug === selectedCategorySlug)?.name 
                    : t('allProducts')
                  }
                </h1>
                <p className="text-xs md:text-sm text-white/60 mt-2">
                  Livraison ultra-rapide par e-mail. Tarifs transparents, sans frais cachés.
                </p>
              </div>
              <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-15 pointer-events-none hidden md:block">
                <Gamepad2 className="w-full h-full text-white p-6" />
              </div>
            </div>

            {/* Search and Quick Filters Row on Category Page */}
            <div className="mb-8 bg-[#1c1030]/50 border border-white/[0.06] rounded-2xl p-4 md:p-6 flex flex-col gap-4">
              {/* Search Bar Input */}
              <div className="relative">
                <input
                  type="text"
                  placeholder={lang === 'FR' ? "Rechercher des produits dans cette catégorie..." : "Chache pwodwi nan kategori sa..."}
                  value={searchQuery}
                  onFocus={() => setCategorySearchFocused(true)}
                  onBlur={() => setTimeout(() => setCategorySearchFocused(false), 200)}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      addRecentSearch(searchQuery);
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="w-full bg-[#0c0714] border border-white/[0.08] text-sm px-4 py-3.5 pl-11 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-[#a855f7]/50 transition-all font-medium"
                />
                <Search className="absolute left-4 top-4 w-4 h-4 text-white/30" />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-3.5 p-1 text-white/40 hover:text-white transition-colors"
                    aria-label={lang === 'FR' ? 'Effacer la recherche' : 'Efase rechèch la'}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                {/* Recent Searches Dropdown on Category page */}
                {categorySearchFocused && !searchQuery && (
                  <div className="absolute top-[52px] left-0 w-full bg-[#1c1030] border border-white/[0.08] rounded-xl shadow-2xl p-2 z-50 max-h-60 overflow-y-auto">
                    <div className="flex flex-col gap-1 p-1">
                      <div className="flex items-center justify-between px-1 py-1 border-b border-white/[0.04] mb-1">
                        <span className="text-[10px] uppercase tracking-wider font-extrabold text-white/40">
                          {lang === 'FR' ? 'Recherches récentes' : 'Chache ki sot pase yo'}
                        </span>
                        {recentSearches.length > 0 && (
                          <button
                            onMouseDown={(e) => {
                              e.preventDefault(); // prevent input blur
                              e.stopPropagation();
                              setRecentSearches([]);
                              localStorage.removeItem('recentSearches');
                            }}
                            className="text-[9px] font-black text-[#a855f7] hover:text-[#a855f7]/85 transition-colors uppercase tracking-wider"
                          >
                            {lang === 'FR' ? 'Effacer tout' : 'Klè tout'}
                          </button>
                        )}
                      </div>
                      {recentSearches.length > 0 ? (
                        recentSearches.map((term, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-2 hover:bg-white/[0.04] rounded-lg cursor-pointer transition-colors group/item"
                            onMouseDown={() => {
                              setSearchQuery(term);
                            }}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <History className="w-3.5 h-3.5 text-white/30 group-hover/item:text-[#a855f7] transition-colors" />
                              <span className="text-xs font-semibold text-white/85 truncate">{term}</span>
                            </div>
                            <button
                              onMouseDown={(e) => {
                                e.preventDefault(); // prevent blur
                                e.stopPropagation(); // prevent setting search query
                                setRecentSearches((prev) => {
                                  const updated = prev.filter((_, i) => i !== index);
                                  localStorage.setItem('recentSearches', JSON.stringify(updated));
                                  return updated;
                                });
                              }}
                              className="p-1 opacity-0 group-hover/item:opacity-100 text-white/35 hover:text-white transition-opacity"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="text-[10px] text-white/35 p-3 text-center italic">
                          {lang === 'FR' ? 'Aucune recherche récente' : 'Pa gen ankenn chache resan'}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Filters Chip Bar */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-white/35">
                  {lang === 'FR' ? "Filtres rapides" : "Filtrage rapid"}
                </span>
                <div className="flex flex-wrap gap-2.5">
                  {[
                    { id: 'ALL', Icon: null, labelFR: 'Tout', labelHT: 'Tout', color: 'border-white/[0.08] hover:bg-white/[0.02]' },
                    { id: 'PROMO', Icon: Percent, labelFR: 'Promo', labelHT: 'Promo', color: 'border-[#a855f7]/25 hover:bg-[#a855f7]/5 text-[#a855f7]' },
                    { id: 'POPULAR', Icon: Flame, labelFR: 'Plus Populaire', labelHT: 'Pli Popilè', color: 'border-amber-500/25 hover:bg-amber-500/5 text-amber-400' },
                    { id: 'UNDER_10', Icon: Coins, labelFR: `Prix < ${formatPrice(10)}`, labelHT: `Pri < ${formatPrice(10)}`, color: 'border-emerald-500/25 hover:bg-emerald-500/5 text-emerald-400' },
                    { id: 'LATEST', Icon: Sparkles, labelFR: 'Nouveautés', labelHT: 'Dènye Pwodwi', color: 'border-indigo-500/25 hover:bg-indigo-500/5 text-indigo-400' }
                  ].map((chip) => {
                    const isActive = quickFilter === chip.id;
                    const label = lang === 'FR' ? chip.labelFR : chip.labelHT;
                    const Icon = chip.Icon;
                    return (
                      <button
                        key={chip.id}
                        onClick={() => setQuickFilter(chip.id as any)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 ${
                          isActive
                            ? 'bg-[#a855f7] text-black border-transparent shadow-lg shadow-[#a855f7]/10 scale-102 font-extrabold'
                            : `bg-[#0c0714] text-white/60 ${chip.color}`
                        }`}
                      >
                        {Icon && <Icon className="w-3.5 h-3.5" />}
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Content Layout: Filters left side, Grid right side */}
            <div className="flex flex-col lg:flex-row gap-8">
              
              {/* Sidebar Filters */}
              <aside className="w-full lg:w-64 shrink-0 bg-[#1c1030] border border-white/[0.08] rounded-2xl p-5 h-fit">
                <div className="flex items-center gap-2 pb-4 border-b border-white/[0.06] mb-5">
                  <Filter className="w-4 h-4 text-[#a855f7]" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                    {t('filters')}
                  </h4>
                </div>

                {/* Categories filter menu */}
                <div className="mb-6">
                  <label className="block text-[10px] uppercase tracking-wider font-extrabold text-white/40 mb-2">
                    {t('products')}
                  </label>
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => { setSelectedCategorySlug(null); setFilterRegion('ALL'); }}
                      className={`text-left w-full px-3 py-2 text-xs rounded-xl font-semibold transition-all ${
                        !selectedCategorySlug ? 'bg-[#a855f7] text-black' : 'text-white/75 hover:bg-white/[0.03]'
                      }`}
                    >
                      {t('allProducts')}
                    </button>
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.slug}
                        onClick={() => navigateToCategory(c.slug)}
                        className={`text-left w-full px-3 py-2 text-xs rounded-xl font-semibold transition-all flex justify-between items-center ${
                          selectedCategorySlug === c.slug ? 'bg-[#a855f7] text-black' : 'text-white/75 hover:bg-white/[0.03]'
                        }`}
                      >
                        <span>{c.name}</span>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full ${selectedCategorySlug === c.slug ? 'bg-black/10 text-black/60' : 'bg-white/[0.05] text-white/40'}`}>{c.count}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Region filter */}
                <div className="mb-6">
                  <label className="block text-[10px] uppercase tracking-wider font-extrabold text-white/40 mb-2">
                    {t('region')}
                  </label>
                  <select
                    value={filterRegion}
                    onChange={(e) => setFilterRegion(e.target.value)}
                    className="w-full bg-[#0c0714] border border-white/[0.08] text-xs px-3 py-2.5 rounded-xl text-white focus:outline-none"
                  >
                    <option value="ALL">Toutes les régions</option>
                    <option value="Global">Global</option>
                    <option value="USA">USA</option>
                    <option value="LATAM">LATAM</option>
                    <option value="Haiti Only">Haiti</option>
                  </select>
                </div>

                {/* Sorting options */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wider font-extrabold text-white/40 mb-2">
                    Tri
                  </label>
                  <select
                    value={filterSort}
                    onChange={(e) => setFilterSort(e.target.value)}
                    className="w-full bg-[#0c0714] border border-white/[0.08] text-xs px-3 py-2.5 rounded-xl text-white focus:outline-none"
                  >
                    <option value="DEFAULT">Défaut</option>
                    <option value="PRICE_ASC">{t('sortPriceAsc')}</option>
                    <option value="PRICE_DESC">{t('sortPriceDesc')}</option>
                    <option value="NAME">{t('sortName')}</option>
                  </select>
                </div>

              </aside>

              {/* Grid Product */}
              <div className="flex-grow">
                {filteredProducts.length > 0 ? (
                  <motion.div 
                    variants={gridContainerVariants}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-2 md:grid-cols-3 gap-5"
                  >
                    {filteredProducts.map((p) => (
                      <motion.div
                        variants={gridItemVariants}
                        key={p.id}
                        onClick={() => {
                          setSelectedProduct(p);
                          setSelectedRegionIndex(0);
                          setSelectedAmountIndex(Math.floor(p.options.length / 2));
                        }}
                        className="group bg-[#1c1030] border border-white/[0.08] hover:border-[#a855f7]/30 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 flex flex-col justify-between"
                        whileHover={{ scale: 1.03, y: -4, transition: { duration: 0.2 } }}
                      >
                        <div className="relative aspect-square overflow-hidden bg-slate-900">
                          <ProductImageWithSkeleton
                            src={p.image}
                            alt={p.name}
                            imgClassName="group-hover:scale-105 transition-transform duration-300"
                          />
                          <button
                            onClick={(e) => toggleWishlist(p.id, e)}
                            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 transition-colors"
                          >
                            <Heart className={`w-4 h-4 ${wishlist.includes(p.id) ? 'fill-[#a855f7] text-[#a855f7]' : 'text-white'}`} />
                          </button>
                          {p.isPromo && (
                            <span className="absolute top-2 left-2 bg-[#a855f7] text-black font-black text-[9px] uppercase px-2 py-0.5 rounded">
                              PROMO
                            </span>
                          )}
                        </div>

                        <div className="p-4 flex-grow flex flex-col justify-between">
                          <div>
                            <span className="text-[9px] font-bold text-[#8b5cf6] uppercase tracking-wider bg-[#8b5cf6]/10 px-2 py-0.5 rounded">
                              {p.regions[0] || 'Global'}
                            </span>
                            <h3 className="text-xs md:text-sm font-extrabold text-white mt-2 group-hover:text-[#a855f7] transition-colors truncate">
                              {p.name}
                            </h3>
                            <p className="text-[10px] text-white/50 mt-1 line-clamp-2">
                              {lang === 'FR' ? p.descriptionFR : p.descriptionHT}
                            </p>
                          </div>

                          <div className="mt-4 border-t border-white/[0.05] pt-3 flex items-center justify-between">
                            <div>
                              <p className="text-[9px] text-white/40 font-bold uppercase">{lang === 'FR' ? 'À partir de' : 'Kòmanse nan'}</p>
                              <p className="text-sm font-black text-white tabular-nums">{formatPrice(priceOf(p, 0))}</p>
                            </div>
                            <span className="text-[10px] text-[#a855f7] font-black group-hover:underline flex items-center gap-0.5">
                              {lang === 'FR' ? 'Commander' : 'Achte'}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                ) : (
                  <div className="text-center py-20 bg-[#1c1030]/50 border border-white/[0.08] rounded-2xl">
                    <Gamepad2 className="w-12 h-12 text-white/20 mx-auto mb-4" />
                    <p className="text-sm text-white/60 font-semibold">{t('noResults')}</p>
                    <button
                      onClick={() => { setSelectedCategorySlug(null); setSearchQuery(''); setFilterRegion('ALL'); }}
                      className="mt-4 bg-[#a855f7] text-[#0c0714] font-extrabold text-xs px-5 py-2.5 rounded-xl"
                    >
                      Reset Filters
                    </button>
                  </div>
                )}
              </div>

            </div>

          </div>
        )}


        {/* ==========================================
            3. ABOUT PAGE
            ========================================== */}
        {currentPage === 'about' && (
          <div id="about-us-page" className="max-w-4xl mx-auto px-4 py-12 animate-fadeIn text-center">
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-4">
              {t('aboutTitle')}
            </h1>
            <p className="text-xs md:text-sm text-white/50 max-w-xl mx-auto mb-12">
              Votre portail d'accès premium au divertissement mondial en Haïti.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left mb-12">
              <div className="bg-[#1c1030] border border-white/[0.08] rounded-2xl p-6 md:p-8">
                <h3 className="text-lg font-bold text-[#a855f7] mb-3 flex items-center gap-2">
                  <Star className="w-5 h-5 fill-current" />
                  {t('ourStory')}
                </h3>
                <p className="text-xs text-white/70 leading-relaxed">
                  {t('ourStoryDesc')}
                </p>
              </div>

              <div className="bg-[#1c1030] border border-white/[0.08] rounded-2xl p-6 md:p-8">
                <h3 className="text-lg font-bold text-[#8b5cf6] mb-3 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5" />
                  {t('ourMission')}
                </h3>
                <p className="text-xs text-white/70 leading-relaxed">
                  {t('ourMissionDesc')}
                </p>
              </div>
            </div>

            <div className="bg-[#1c1030]/40 border border-white/[0.06] rounded-2xl p-6 md:p-8 text-left">
              <h3 className="text-lg font-bold text-white mb-4">Nos Valeurs Clés</h3>
              <ul className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-white/70">
                <li className="flex gap-2.5 items-start">
                  <Check className="w-4 h-4 text-[#a855f7] flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white">Rapidité Absolute</strong>
                    <p className="text-white/50 mt-1">Livraison garantie de vos codes de jeux sous 5 minutes par e-mail.</p>
                  </div>
                </li>
                <li className="flex gap-2.5 items-start">
                  <Check className="w-4 h-4 text-[#a855f7] flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white">Sécurité Maximale</strong>
                    <p className="text-white/50 mt-1">Transactions validées via les systèmes financiers officiels locaux MonCash/NatCash.</p>
                  </div>
                </li>
                <li className="flex gap-2.5 items-start">
                  <Check className="w-4 h-4 text-[#a855f7] flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white">Service Transparent</strong>
                    <p className="text-white/50 mt-1">Aucuns frais d'enregistrement ou coûts cachés additionnels sur vos forfaits.</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        )}


        {/* ==========================================
            4. CONTACT PAGE
            ========================================== */}
        {currentPage === 'contact' && (
          <div id="contact-us-page" className="max-w-7xl mx-auto px-4 py-12 animate-fadeIn">
            
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight">
                {t('contactTitle')}
              </h1>
              <p className="text-xs md:text-sm text-white/50 mt-3">
                Une suggestion, une question ou besoin d'une assistance pour votre commande ? Contactez-nous à tout moment !
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Left Contact Coordinates cards */}
              <div className="flex flex-col gap-4">
                <div className="bg-[#1c1030] border border-white/[0.08] rounded-2xl p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500">
                    <Send className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-white/40 uppercase font-bold">WhatsApp Direct</p>
                    <a href="https://wa.me/50943231463" className="text-sm font-black text-white hover:text-[#a855f7] transition-colors">+509 43 23 1463</a>
                  </div>
                </div>

                <div className="bg-[#1c1030] border border-white/[0.08] rounded-2xl p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-white/40 uppercase font-bold">Email Support</p>
                    <a href="mailto:support@thie-thie-services.com" className="text-sm font-black text-white hover:text-[#a855f7] transition-colors">support@thie-thie.com</a>
                  </div>
                </div>

                <div className="bg-[#1c1030] border border-white/[0.08] rounded-2xl p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#a855f7]/10 flex items-center justify-center text-[#a855f7]">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-white/40 uppercase font-bold">Heures d'Ouverture</p>
                    <p className="text-sm font-black text-white">24 heures sur 24 / 7 jours sur 7</p>
                  </div>
                </div>

                {/* Styled Map Placeholder */}
                <div className="bg-[#1c1030] border border-white/[0.08] rounded-2xl overflow-hidden h-48 relative">
                  <div className="absolute inset-0 bg-slate-950/65 flex flex-col items-center justify-center text-center p-4">
                    <div className="mb-2">
                      <ThieThieLogo variant="icon" size={32} />
                    </div>
                    <strong className="text-xs text-white">Thie Thie Services HQ</strong>
                    <p className="text-[10px] text-white/50 mt-1">Port-au-Prince, Haïti</p>
                  </div>
                  <div className="w-full h-full bg-gradient-to-tr from-[#1c1030] to-[#0c0714]" />
                </div>
              </div>

              {/* Form container */}
              <div className="lg:col-span-2 bg-[#1c1030] border border-white/[0.08] rounded-2xl p-6 md:p-8">
                <h3 className="text-lg font-bold text-white mb-6">Formulaire de Message</h3>
                
                {contactSuccess ? (
                  <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-6 rounded-2xl text-center">
                    <Check className="w-8 h-8 mb-2 mx-auto" />
                    <p className="text-xs font-semibold leading-relaxed">
                      {t('messageSuccess')}
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleContactSubmit} className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider font-extrabold text-white/40 mb-1.5">
                          {t('name')}
                        </label>
                        <input
                          type="text"
                          required
                          value={contactName}
                          onChange={(e) => setContactName(e.target.value)}
                          className="w-full bg-[#0c0714] border border-white/[0.08] text-xs px-4 py-3 rounded-xl text-white focus:outline-none focus:border-[#a855f7] focus:ring-1 focus:ring-[#a855f7]/20 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider font-extrabold text-white/40 mb-1.5">
                          {t('email')}
                        </label>
                        <input
                          type="email"
                          required
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                          className="w-full bg-[#0c0714] border border-white/[0.08] text-xs px-4 py-3 rounded-xl text-white focus:outline-none focus:border-[#a855f7] focus:ring-1 focus:ring-[#a855f7]/20 transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-extrabold text-white/40 mb-1.5">
                        {t('message')}
                      </label>
                      <textarea
                        required
                        rows={5}
                        value={contactMessage}
                        onChange={(e) => setContactMessage(e.target.value)}
                        className="w-full bg-[#0c0714] border border-white/[0.08] text-xs px-4 py-3 rounded-xl text-white focus:outline-none focus:border-[#a855f7] focus:ring-1 focus:ring-[#a855f7]/20 transition-colors"
                      />
                    </div>

                    <button
                      type="submit"
                      className="bg-[#a855f7] hover:bg-[#a855f7]/90 text-[#0c0714] font-extrabold text-xs px-6 py-3.5 rounded-xl self-end transition-colors"
                    >
                      {t('sendMessage')}
                    </button>
                  </form>
                )}
              </div>

            </div>

          </div>
        )}


        {/* ==========================================
            5. FAQ STATE
            ========================================== */}
        {currentPage === 'faq' && (
          <div id="faq-page" className="max-w-3xl mx-auto px-4 py-12 animate-fadeIn">
            <h1 className="text-3xl md:text-5xl font-black text-center text-white tracking-tight mb-4">
              {t('faqTitle')}
            </h1>
            <p className="text-xs text-center text-white/50 mb-12 max-w-md mx-auto">
              Retrouvez toutes les questions récurrentes sur le mode de commande, de livraison et de paiement.
            </p>

            <div className="flex flex-col gap-4">
              {FAQS.map((faq, index) => {
                const isExpanded = index === expandedFaqIndex;
                return (
                  <div
                    key={index}
                    className="bg-[#1c1030] border border-white/[0.08] rounded-2xl overflow-hidden transition-all duration-300"
                  >
                    <button
                      onClick={() => setExpandedFaqIndex(isExpanded ? null : index)}
                      className="w-full text-left p-5 flex justify-between items-center gap-4 hover:bg-white/[0.02]"
                    >
                      <strong className="text-xs md:text-sm text-white font-extrabold leading-snug">
                        {lang === 'FR' ? faq.qFR : faq.qHT}
                      </strong>
                      <span className={`text-[#a855f7] font-black text-base transition-transform duration-300 ${isExpanded ? 'rotate-45' : ''}`}>
                        +
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="px-5 pb-5 pt-1 border-t border-white/[0.04]">
                        <p className="text-xs text-white/70 leading-relaxed">
                          {lang === 'FR' ? faq.aFR : faq.aHT}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}


        {/* ==========================================
            6. PRIVACY POLICY
            ========================================== */}
        {currentPage === 'privacy' && (
          <div id="privacy-page" className="max-w-3xl mx-auto px-4 py-12 animate-fadeIn text-left leading-relaxed">
            <h1 className="text-3xl font-black text-white mb-6 border-b border-white/[0.08] pb-4">
              {t('privacyTitle')}
            </h1>
            <div className="text-xs text-white/70 flex flex-col gap-5">
              <p>Chez Thie Thie Services, la confidentialité de nos clients est une priorité absolue. Nous collectons uniquement les informations nécessaires au bon traitement de vos recharges de jeux.</p>
              
              <h3 className="text-sm font-bold text-white mt-4">1. Informations collectées</h3>
              <p>Nous enregistrons votre adresse e-mail pour la livraison de vos codes, votre numéro de téléphone (WhatsApp) pour le support, ainsi que votre identifiant joueur pour les recharges de diamants/crédits directs.</p>
              
              <h3 className="text-sm font-bold text-white mt-4">2. Sécurité des Données</h3>
              <p>Vos informations d'ID de joueur ne sont jamais stockées ni revendues à des tiers. Elles sont transmises de manière sécurisée et cryptée à nos fournisseurs pour validation directe.</p>
              
              <h3 className="text-sm font-bold text-white mt-4">3. Paiements</h3>
              <p>Aucune coordonnée bancaire n'est stockée sur nos serveurs. Tous les paiements MonCash, NatCash, USDT et PayPal s'effectuent via des canaux sécurisés et de confiance.</p>
            </div>
          </div>
        )}


        {/* ==========================================
            7. TERMS & CONDITIONS
            ========================================== */}
        {currentPage === 'terms' && (
          <div id="terms-page" className="max-w-3xl mx-auto px-4 py-12 animate-fadeIn text-left leading-relaxed">
            <h1 className="text-3xl font-black text-white mb-6 border-b border-white/[0.08] pb-4">
              {t('termsTitle')}
            </h1>
            <div className="text-xs text-white/70 flex flex-col gap-5">
              <p>Veuillez lire attentivement nos conditions d'utilisation avant de valider votre achat de recharges de jeux ou cartes cadeaux numériques.</p>
              
              <h3 className="text-sm font-bold text-white mt-4">1. Commandes et Responsabilité</h3>
              <p>L'acheteur est seul responsable de l'exactitude de l'identifiant de jeu (ID) fourni lors de la commande. Les recharges appliquées sur des identifiants erronés ne pourront pas faire l'objet d'un remboursement.</p>
              
              <h3 className="text-sm font-bold text-white mt-4">2. Délais de Livraison</h3>
              <p>Le délai moyen constaté de traitement est inférieur à 5 minutes. Thie Thie Services s'engage à livrer l'intégralité des commandes sous 2 heures maximum. Au-delà, un remboursement intégral pourra être demandé.</p>
              
              <h3 className="text-sm font-bold text-white mt-4">3. Remboursements</h3>
              <p>En raison du caractère numérique et de l'activation immédiate des codes, aucun retour ni remboursement n'est possible une fois le code envoyé par e-mail.</p>
              <p className="mt-2"><strong className="text-white">Cartes cadeaux — région obligatoire.</strong> Chaque carte cadeau est liée à une région précise. Par exemple, une carte cadeau <strong className="text-white">Apple USA</strong> n'est utilisable que sur un compte Apple dont la région est réglée sur les <strong className="text-white">États-Unis</strong>. Il vous appartient de <strong className="text-white">vérifier la région de votre compte avant tout achat</strong>. Aucun remboursement ne sera accordé pour une carte inutilisable en raison d'une région de compte non conforme, ou pour un code déjà révélé.</p>
            </div>
          </div>
        )}

        {/* ==========================================
            8. USER PROFILE PAGE (FIREBASE INTEGRATED)
            ========================================== */}
        {currentPage === 'profile' && user && (
          <UserProfile
            user={user}
            profilePhone={profilePhone}
            thieThiePoints={thieThiePoints}
            getLoyaltyLevel={getLoyaltyLevel}
            firebaseOrders={firebaseOrders}
            firebaseOrdersLoading={firebaseOrdersLoading}
            onUpdateProfile={handleUpdateProfileDetails}
            onProfilePictureUpload={handleProfilePictureUpload}
            onLogout={handleLogout}
            lang={lang}
            navigateToPage={navigateToPage}
            formatPrice={formatPrice}
          />
        )}

      </main>

      {/* ==========================================
          DETAIL PRODUCT MODAL STATE (ZOOM GALLERY & SELECTORS)
          ========================================== */}
      {selectedProduct && (
        <div id="product-detail-modal" className="fixed inset-0 z-50 bg-black/80 overflow-y-auto animate-fadeIn backdrop-blur-sm">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <div className="bg-[#1c1030] border border-white/[0.08] rounded-3xl w-full max-w-3xl overflow-hidden relative shadow-2xl my-8 text-left">
            
            {/* Close modal action */}
            <button
              onClick={() => setSelectedProduct(null)}
              className="absolute top-4 right-4 p-2.5 rounded-full bg-black/40 text-white hover:bg-[#a855f7] hover:text-black transition-colors z-10"
              aria-label={lang === 'FR' ? 'Fermer' : 'Fèmen'}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="grid grid-cols-1 md:grid-cols-2">
              
              {/* Image Gallery left panel */}
              <div className="relative bg-slate-950 aspect-square md:aspect-auto md:h-full flex flex-col justify-between min-h-[300px]">
                <ProductImageWithSkeleton
                  src={selectedProduct.image}
                  alt={selectedProduct.name}
                  imgClassName="opacity-80"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                
                {/* Product Badge Info */}
                <div className="absolute bottom-6 left-6 right-6">
                  <span className="bg-[#a855f7] text-black text-[9px] font-black uppercase px-2 py-1 rounded-md">
                    {selectedProduct.regions[0]}
                  </span>
                  <h2 className="text-xl md:text-2xl font-black text-white mt-2">
                    {selectedProduct.name}
                  </h2>
                  <p className="text-xs text-white/70 mt-1 leading-relaxed line-clamp-3">
                    {lang === 'FR' ? selectedProduct.descriptionFR : selectedProduct.descriptionHT}
                  </p>
                </div>
              </div>

              {/* Package selection right panel */}
              <div className="p-6 md:p-8 flex flex-col justify-between">
                {showReportForm ? (
                  /* Issue Reporting Form */
                  <div className="flex flex-col h-full justify-between animate-fadeIn">
                    <div>
                      {/* Form Header */}
                      <div className="flex items-center gap-2 mb-4">
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                        <h3 className="text-base font-black text-white">
                          {lang === 'FR' ? "Signaler un problème" : "Rapòte yon pwoblèm"}
                        </h3>
                      </div>
                      <p className="text-[11px] text-white/50 mb-5 leading-relaxed font-medium">
                        {lang === 'FR'
                          ? `Signalez une anomalie liée au processus de commande pour ${selectedProduct.name}. Vos retours nous permettent d'améliorer notre service.`
                          : `Rapòte yon anomali ki gen rapò ak pwosesis kòmand pou ${selectedProduct.name}. Feedback ou yo ap pèmèt nou amelyore sèvis la.`}
                      </p>

                      {/* Select Issue Type */}
                      <div className="mb-4">
                        <label className="block text-[10px] uppercase tracking-wider font-extrabold text-white/40 mb-2">
                          {lang === 'FR' ? "Type de problème" : "Kalite pwoblèm"}
                        </label>
                        <select
                          value={reportIssueType}
                          onChange={(e) => setReportIssueType(e.target.value)}
                          className="w-full bg-[#0c0714] border border-white/[0.08] text-xs px-3.5 py-3 rounded-2xl text-white font-semibold focus:outline-none focus:border-[#a855f7]/50"
                        >
                          <option value="PRICE_ERROR">
                            {lang === 'FR' ? "Option de prix incorrecte" : "Opsyon pri ki pa kòrèk"}
                          </option>
                          <option value="DELIVERY_DELAY">
                            {lang === 'FR' ? "Problème / Retard de livraison" : "Pwoblèm / Reta nan livrezon"}
                          </option>
                          <option value="PAYMENT_ISSUE">
                            {lang === 'FR' ? "Moyen de paiement indisponible" : "Mwayen peman pa disponib"}
                          </option>
                          <option value="OTHER">
                            {lang === 'FR' ? "Autre problème" : "Lòt pwoblèm"}
                          </option>
                        </select>
                      </div>

                      {/* Details Textarea */}
                      <div className="mb-4">
                        <label className="block text-[10px] uppercase tracking-wider font-extrabold text-white/40 mb-2">
                          {lang === 'FR' ? "Détails du problème" : "Detay sou pwoblèm nan"}
                        </label>
                        <textarea
                          rows={4}
                          value={reportIssueDetails}
                          onChange={(e) => setReportIssueDetails(e.target.value)}
                          placeholder={
                            lang === 'FR'
                              ? "Décrivez le problème rencontré avec le plus de précisions possibles (packs, prix affiché, erreur etc.)..."
                              : "Dekri pwoblèm ou jwenn nan ak plis detay posib (pake, pri ki afiche, erè, elatriye)..."
                          }
                          className="w-full bg-[#0c0714] border border-white/[0.08] text-xs px-3.5 py-3 rounded-2xl text-white font-medium focus:outline-none focus:border-[#a855f7]/50 placeholder-white/20 resize-none leading-relaxed"
                        />
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-6 pt-4 border-t border-white/[0.05]">
                      <a
                        href={getWhatsAppReportLink(selectedProduct, reportIssueType, reportIssueDetails)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-gradient-to-r from-[#a855f7] to-[#7e22ce] hover:from-[#7e22ce] hover:to-[#a855f7] text-[#0c0714] font-black text-xs py-3.5 rounded-2xl text-center flex items-center justify-center gap-2 shadow-lg shadow-[#a855f7]/5 hover:shadow-[#a855f7]/15 hover:-translate-y-0.5 transition-all mb-2.5"
                      >
                        <Send className="w-4 h-4" />
                        <span>{lang === 'FR' ? "Envoyer le rapport sur WhatsApp" : "Voye rapò a sou WhatsApp"}</span>
                      </a>
                      <button
                        onClick={() => setShowReportForm(false)}
                        className="w-full bg-white/5 hover:bg-white/10 text-white font-bold text-xs py-3.5 rounded-2xl border border-white/10 transition-colors"
                      >
                        {lang === 'FR' ? "Retour à l'achat" : "Retounen nan achte"}
                      </button>
                    </div>
                  </div>
                ) : selectedProduct.stockStatus === 'outofstock' ? (
                  /* Out of stock alert state */
                  <div className="flex flex-col h-full justify-between animate-fadeIn">
                    <div>
                      {/* Out of Stock Header */}
                      <div className="flex items-center gap-2 mb-4">
                        <Info className="w-5 h-5 text-[#a855f7]" />
                        <h3 className="text-base font-black text-white">
                          {lang === 'FR' ? "Produit en rupture de stock" : "Pwodwi sa a fini nan stòk"}
                        </h3>
                      </div>
                      <p className="text-[11px] text-white/50 mb-5 leading-relaxed font-medium">
                        {lang === 'FR'
                          ? `Cet article (${selectedProduct.name}) est actuellement indisponible. Entrez votre adresse e-mail ci-dessous pour être alerté(e) dès qu'il sera de retour en stock.`
                          : `Atik sa a (${selectedProduct.name}) pa disponib pou kounye a. Antre imel ou anba a pou n avize w lè l retounen nan stòk.`}
                      </p>

                      {alertSubmitted ? (
                        <div className="bg-[#10b981]/5 border border-[#10b981]/20 rounded-2xl p-5 text-center flex flex-col items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-[#10b981]/10 border border-[#10b981]/30 flex items-center justify-center text-[#10b981]">
                            <Check className="w-6 h-6" />
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-white mb-1">
                              {lang === 'FR' ? 'Alerte créée avec succès !' : 'Alèt la anrejistre avèk siksè !'}
                            </h4>
                            <p className="text-[10px] text-white/60 leading-relaxed">
                              {lang === 'FR'
                                ? `Nous vous enverrons un e-mail à ${alertEmail} dès que cet article sera disponible.`
                                : `N ap voye yon imel ba ou nan ${alertEmail} touswit lè atik sa a disponib.`}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <form onSubmit={handleStockAlertSubmit} className="space-y-4">
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider font-extrabold text-white/40 mb-2">
                              {lang === 'FR' ? "Votre adresse e-mail" : "Adrès imel ou"}
                            </label>
                            <div className="relative">
                              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                              <input
                                type="email"
                                value={alertEmail}
                                onChange={(e) => setAlertEmail(e.target.value)}
                                placeholder="nom@exemple.com"
                                className="w-full bg-[#0c0714] border border-white/[0.08] text-xs pl-10 pr-3.5 py-3 rounded-2xl text-white font-medium focus:outline-none focus:border-[#a855f7]/50 placeholder-white/20"
                                required
                                disabled={alertLoading}
                              />
                            </div>
                            {alertError && (
                              <p className="text-[10px] text-red-400 font-bold mt-1.5 flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>{alertError}</span>
                              </p>
                            )}
                          </div>

                          <button
                            type="submit"
                            disabled={alertLoading}
                            className="w-full bg-gradient-to-r from-[#a855f7] to-[#7e22ce] hover:from-[#7e22ce] hover:to-[#a855f7] disabled:from-[#a855f7]/50 disabled:to-[#7e22ce]/50 text-[#0c0714] font-black text-xs py-3.5 rounded-2xl text-center flex items-center justify-center gap-2 shadow-lg shadow-[#a855f7]/5 hover:shadow-[#a855f7]/15 hover:-translate-y-0.5 disabled:pointer-events-none transition-all cursor-pointer"
                          >
                            {alertLoading ? (
                              <span className="w-4 h-4 border-2 border-[#0c0714] border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>
                                <Zap className="w-4 h-4 animate-bounce" style={{ animationDuration: '2s' }} />
                                <span>{lang === 'FR' ? "M'alerter par e-mail" : "Voye alèt pa imel"}</span>
                              </>
                            )}
                          </button>
                        </form>
                      )}
                    </div>

                    {/* Footer / Report options in case of out of stock too */}
                    <div className="mt-6 pt-4 border-t border-white/[0.05] flex flex-col gap-2">
                      <div className="flex justify-between items-center text-[9px] font-extrabold text-white/30 uppercase tracking-widest">
                        <span>ThieThie Services</span>
                        <span className="bg-red-500/10 text-red-400 px-2 py-0.5 rounded uppercase font-black">
                          {lang === 'FR' ? 'Rupture de Stock' : 'Fini nan Stòk'}
                        </span>
                      </div>
                      <div className="mt-2 text-center">
                        <button
                          onClick={() => setShowReportForm(true)}
                          className="text-[10px] text-white/35 hover:text-[#a855f7] transition-colors uppercase tracking-wider font-extrabold flex items-center justify-center gap-1.5 mx-auto"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-[#a855f7]/50" />
                          <span>{lang === 'FR' ? "Signaler un problème" : "Rapòte yon pwoblèm"}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Standard purchase selector state */
                  <>
                    <div>
                      
                      {/* Game Player ID Input */}
                      {isGameCategoryRequiringPlayerId(selectedProduct.categorySlug) && (
                        <div className="mb-6">
                          <label className="block text-[10px] uppercase tracking-wider font-extrabold text-[#a855f7] mb-2 flex items-center gap-1">
                            <span>
                              {selectedProduct.categorySlug === 'free-fire' ? 'Free Fire Player ID' : 
                               selectedProduct.categorySlug === 'pubg' ? 'PUBG Mobile Player ID' : 
                               `${CATEGORIES.find(c => c.slug === selectedProduct.categorySlug)?.name || 'Game'} Player ID`}
                            </span>
                            <span className="text-red-500 font-bold">*</span>
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              value={freeFirePlayerId}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFreeFirePlayerId(val);
                                validateFreeFirePlayerId(val, selectedProduct.categorySlug);
                              }}
                              placeholder={
                                selectedProduct.categorySlug === 'free-fire' ? "Enter your Free Fire Player ID" :
                                selectedProduct.categorySlug === 'pubg' ? "Enter your PUBG Mobile Player ID" :
                                `Enter your ${CATEGORIES.find(c => c.slug === selectedProduct.categorySlug)?.name || 'Game'} Player ID`
                              }
                              required
                              className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-xs text-white px-3.5 py-3 rounded-2xl focus:outline-none pl-10 transition-colors"
                            />
                            <User className="w-4 h-4 text-white/30 absolute left-3.5 top-3.5" />
                          </div>
                          
                          {/* Helper Text below input field */}
                          <p className="text-white/40 text-[10px] font-medium mt-1.5 pl-1">
                            {getPlayerIdHelperText(selectedProduct.categorySlug, lang)}
                          </p>

                          {freeFirePlayerIdError && (
                            <p className="text-red-400 text-[10px] font-bold mt-1.5 flex items-center gap-1 animate-pulse">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              {freeFirePlayerIdError}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Select Region buttons */}
                      {selectedProduct.regions.length > 0 && (
                        <div className="mb-6">
                          <label className="block text-[10px] uppercase tracking-wider font-extrabold text-white/40 mb-2">
                            {t('selectRegion')}
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {selectedProduct.regions.map((reg, idx) => (
                              <button
                                key={reg}
                                onClick={() => setSelectedRegionIndex(idx)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                  idx === selectedRegionIndex
                                    ? 'bg-[#8b5cf6] text-white border-transparent shadow-md'
                                    : 'bg-[#0c0714] border-white/[0.08] text-white/60 hover:text-white'
                                }`}
                              >
                                {reg}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Select Amount Packages list */}
                      <div className="mb-6">
                        <label className="block text-[10px] uppercase tracking-wider font-extrabold text-white/40 mb-2">
                          {t('selectAmount')}
                        </label>
                        <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                          {selectedProduct.options.map((opt, idx) => (
                            <div
                              key={idx}
                              onClick={() => setSelectedAmountIndex(idx)}
                              className={`flex justify-between items-center p-3 rounded-2xl cursor-pointer border transition-all ${
                                idx === selectedAmountIndex
                                  ? 'bg-[#a855f7]/10 border-[#a855f7] text-white shadow-inner'
                                  : 'bg-[#0c0714] border-white/[0.08] text-white/60 hover:bg-white/[0.02]'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                  idx === selectedAmountIndex ? 'border-[#a855f7]' : 'border-white/20'
                                }`}>
                                  {idx === selectedAmountIndex && (
                                    <span className="w-2 h-2 rounded-full bg-[#a855f7]" />
                                  )}
                                </span>
                                <span className="text-xs font-extrabold">{opt.amount}</span>
                              </div>
                              <span className="text-xs font-black text-[#a855f7] tabular-nums">
                                {formatPrice(priceOf(selectedProduct, idx))}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Mode de Paiement Selection */}
                      <div className="mb-6">
                        <label className="block text-[10px] uppercase tracking-wider font-extrabold text-white/40 mb-2.5">
                          {lang === 'FR' ? 'Mode de Paiement' : 'Mwayen Peman'}
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { id: 'wallet', label: lang === 'FR' ? 'Mon Wallet' : 'Wallet mwen', desc: `${(walletBalanceCents / 100).toLocaleString('fr-FR')} HTG` },
                          ].map((pm) => (
                            <button
                              key={pm.id}
                              type="button"
                              onClick={() => setSelectedPaymentMethod(pm.id as any)}
                              className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all relative overflow-hidden group ${
                                pm.id === 'BinancePay' || pm.id === 'NatCash' || pm.id === 'MonCash' ? 'col-span-2' : ''
                              } ${
                                selectedPaymentMethod === pm.id
                                  ? 'bg-[#a855f7]/10 border-[#a855f7] text-white shadow-lg shadow-[#a855f7]/5'
                                  : 'bg-[#0c0714] border-white/[0.08] text-white/60 hover:border-white/20 hover:bg-white/[0.02]'
                              }`}
                            >
                              <div className="flex justify-between items-center w-full">
                                <div className="flex items-center gap-2">
                                  {pm.id === 'BinancePay' && (
                                    <div className="relative w-4 h-4 flex items-center justify-center bg-[#F0B90B] rotate-45 rounded-[2px] shadow-sm shrink-0">
                                      <div className="w-2 h-2 bg-[#0c0714] rounded-[1px]" />
                                    </div>
                                  )}
                                  {pm.id === 'NatCash' && (
                                    <div className="relative w-4 h-4 flex items-center justify-center bg-[#FF9F1C] rounded-full shadow-sm shrink-0">
                                      <span className="text-[9px] font-black text-white">N</span>
                                    </div>
                                  )}
                                  {pm.id === 'MonCash' && (
                                    <div className="relative w-4 h-4 flex items-center justify-center bg-red-600 rounded-full shadow-sm shrink-0">
                                      <span className="text-[9px] font-black text-white">M</span>
                                    </div>
                                  )}
                                  <span className="text-xs font-black text-white">{pm.label}</span>
                                </div>
                                <span className={`w-2.5 h-2.5 rounded-full border flex items-center justify-center ${
                                  selectedPaymentMethod === pm.id ? 'border-[#a855f7] bg-[#a855f7]' : 'border-white/25'
                                }`} />
                              </div>
                              <span className="text-[9px] text-white/45 mt-1 font-bold uppercase tracking-wider tabular-nums">{pm.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                    </div>

                    {/* Pricing result CTA Button and Payment options */}
                    <div>
                      {selectedPaymentMethod === 'wallet' ? (
                        /* ==========================================
                           PAIEMENT WALLET — débit instantané via placeOrder (rien en externe)
                        ========================================== */
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between p-3 rounded-2xl bg-[#0c0714] border border-white/[0.08]">
                            <span className="text-[10px] uppercase tracking-wider font-extrabold text-white/40">
                              {lang === 'FR' ? 'Solde Wallet' : 'Balans Wallet'}
                            </span>
                            <span className="text-sm font-black text-[#a855f7] tabular-nums">
                              {(walletBalanceCents / 100).toLocaleString('fr-FR')} HTG
                            </span>
                          </div>

                          {isGameCategoryRequiringPlayerId(selectedProduct.categorySlug) && (
                            <div>
                              <label className="block text-[10px] uppercase tracking-wider font-extrabold text-white/40 mb-1.5">
                                {lang === 'FR' ? 'ID de joueur' : 'ID jwè'}
                              </label>
                              <input
                                value={freeFirePlayerId}
                                onChange={(e) => setFreeFirePlayerId(e.target.value)}
                                placeholder={getPlayerIdHelperText(selectedProduct.categorySlug, lang)}
                                className="w-full p-3 rounded-2xl bg-[#0c0714] border border-white/[0.08] text-white text-sm outline-none focus:border-[#a855f7]"
                              />
                            </div>
                          )}

                          {(() => {
                            const opt = selectedProduct.options[selectedAmountIndex] || selectedProduct.options[0];
                            const priceCents = centsOf(selectedProduct, selectedAmountIndex);
                            const enough = walletBalanceCents >= priceCents;
                            const available = availOf(selectedProduct, selectedAmountIndex);
                            return (
                              <>
                                <button
                                  type="button"
                                  disabled={walletPaying || !enough || !available}
                                  onClick={handleWalletPay}
                                  className="w-full py-3.5 rounded-2xl font-black text-sm bg-[#a855f7] text-[#0c0714] disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:brightness-105 active:scale-[0.99] tabular-nums"
                                >
                                  {walletPaying
                                    ? (lang === 'FR' ? 'Paiement…' : 'N ap peye…')
                                    : !available
                                    ? (lang === 'FR' ? 'Indisponible actuellement' : 'Pa disponib kounye a')
                                    : (lang === 'FR'
                                        ? `Payer ${formatPrice(priceOf(selectedProduct, selectedAmountIndex))} avec mon wallet`
                                        : `Peye ${formatPrice(priceOf(selectedProduct, selectedAmountIndex))} ak wallet mwen`)}
                                </button>
                                {!available ? (
                                  <p className="text-[11px] text-red-400 font-bold text-center leading-snug">
                                    {lang === 'FR'
                                      ? 'Cet article est momentanément indisponible.'
                                      : 'Atik sa a pa disponib pou kounye a.'}
                                  </p>
                                ) : !enough ? (
                                  <p className="text-[11px] text-red-400 font-bold text-center leading-snug">
                                    {lang === 'FR'
                                      ? 'Solde insuffisant — rechargez votre wallet via un dépôt.'
                                      : 'Balans pa ase — rechaje wallet ou ak yon depo.'}
                                  </p>
                                ) : null}
                              </>
                            );
                          })()}
                        </div>
                      ) : null}

                      {/* Payment info under list */}
                      <div className="mt-4 pt-3 border-t border-white/[0.05] flex justify-between items-center">
                        <span className="text-[9px] font-extrabold text-white/30 uppercase tracking-widest">
                          {lang === 'FR' ? 'Paiement par Wallet · Instantané' : 'Peman ak Wallet · Enstantane'}
                        </span>
                        <span className="text-[9px] bg-[#10b981]/10 text-[#10b981] font-bold px-2 py-0.5 rounded uppercase">
                          {t('stock')}
                        </span>
                      </div>

                      {/* Report an issue trigger link */}
                      <div className="mt-3.5 text-center">
                        <button
                          onClick={() => setShowReportForm(true)}
                          className="text-[10px] text-white/35 hover:text-[#a855f7] transition-colors uppercase tracking-wider font-extrabold flex items-center justify-center gap-1.5 mx-auto"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-[#a855f7]/50" />
                          <span>{lang === 'FR' ? "Signaler un problème" : "Rapòte yon pwoblèm"}</span>
                        </button>
                      </div>

                    </div>
                  </>
                )}
              </div>

            </div>

          </div>
          </div>
        </div>
      )}

      {/* ==========================================
          AUTHENTICATION & REGISTRATION MODAL
          ========================================== */}
      {authModalOpen && (
        <div id="auth-modal" className="fixed inset-0 z-50 bg-black/80 overflow-y-auto animate-fadeIn backdrop-blur-sm">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <div className="bg-[#1c1030] border border-white/[0.08] rounded-3xl w-full max-w-md overflow-hidden relative shadow-2xl my-8 p-6 text-left">
            
            {/* Close button */}
            <button
              onClick={() => { setAuthModalOpen(false); setAuthError(null); }}
              className="absolute top-4 right-4 p-2 rounded-full bg-black/40 text-white hover:bg-red-500 transition-colors z-10"
              aria-label={lang === 'FR' ? 'Fermer' : 'Fèmen'}
            >
              <X className="w-4 h-4" />
            </button>

            {/* Mode Selector Tabs */}
            <div className="grid grid-cols-2 gap-1 bg-black/20 p-1 rounded-xl mb-6 border border-white/[0.04] mt-2 select-none">
              <button
                onClick={() => { setAuthMode('login'); setAuthError(null); }}
                className={`py-2 text-xs font-black rounded-lg transition-all ${
                  authMode === 'login' 
                    ? 'bg-[#a855f7] text-black shadow-sm' 
                    : 'text-white/60 hover:text-white hover:bg-white/[0.02]'
                }`}
              >
                {lang === 'FR' ? 'Connexion' : 'Koneksyon'}
              </button>
              <button
                onClick={() => { setAuthMode('register'); setAuthError(null); }}
                className={`py-2 text-xs font-black rounded-lg transition-all ${
                  authMode === 'register' 
                    ? 'bg-[#a855f7] text-black shadow-sm' 
                    : 'text-white/60 hover:text-white hover:bg-white/[0.02]'
                }`}
              >
                {lang === 'FR' ? "S'inscrire" : 'Enskri'}
              </button>
            </div>

            <h3 className="text-xl font-black text-white mb-2 tracking-tight flex items-center gap-2">
              <Lock className="w-5 h-5 text-[#a855f7]" />
              {authMode === 'login' 
                ? (lang === 'FR' ? 'Bon retour parmi nous !' : 'Byenveni ankò !') 
                : (lang === 'FR' ? 'Créer un compte Joueur' : 'Kreye yon kont Jwè')
              }
            </h3>
            <p className="text-xs text-white/50 mb-5 leading-relaxed">
              {authMode === 'login'
                ? (lang === 'FR' ? 'Connectez-vous pour synchroniser vos points de fidélité et vos achats.' : 'Konekte pou n ka sove pwen fidelite w ak acha w yo.')
                : (lang === 'FR' ? 'Inscrivez-vous pour commencer à accumuler et synchroniser vos points de fidélité.' : 'Enskri pou n ka kòmanse sove pwen fidelite w yo.')
              }
            </p>

            {authError && (
              <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4.5 h-4.5 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="flex flex-col gap-4">
              
              {authMode === 'register' && (
                <>
                  <div>
                    <label className="block text-[10px] text-white/40 uppercase tracking-wider font-extrabold mb-1.5">
                      {lang === 'FR' ? "Nom d'affichage" : "Non d'affichage"}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={authDisplayName}
                        onChange={(e) => setAuthDisplayName(e.target.value)}
                        placeholder="e.g. ProGamer"
                        required
                        className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none pl-10"
                      />
                      <User className="w-4 h-4 text-white/30 absolute left-3.5 top-3.5" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-white/40 uppercase tracking-wider font-extrabold mb-1.5">
                      {lang === 'FR' ? 'Numéro WhatsApp (Optionnel)' : 'Nimewo WhatsApp (Si ou vle)'}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={authPhone}
                        onChange={(e) => setAuthPhone(e.target.value)}
                        placeholder="e.g. +509 3737-3737"
                        className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none pl-10"
                      />
                      <Phone className="w-4 h-4 text-white/30 absolute left-3.5 top-3.5" />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-[10px] text-white/40 uppercase tracking-wider font-extrabold mb-1.5">
                  {lang === 'FR' ? 'Adresse E-mail' : 'Adrès Imel'}
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="e.g. joueur@gmail.com"
                    required
                    className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none pl-10"
                  />
                  <Mail className="w-4 h-4 text-white/30 absolute left-3.5 top-3.5" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-white/40 uppercase tracking-wider font-extrabold mb-1.5">
                  {lang === 'FR' ? 'Mot de passe' : 'Mo de pas'}
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none pl-10"
                  />
                  <Lock className="w-4 h-4 text-white/30 absolute left-3.5 top-3.5" />
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full mt-2 bg-[#a855f7] hover:bg-[#c084fc] text-black font-extrabold text-xs py-4 rounded-xl text-center flex items-center justify-center gap-2 shadow-lg shadow-[#a855f7]/10 hover:shadow-[#a855f7]/20 hover:-translate-y-0.5 transition-all cursor-pointer disabled:opacity-50"
              >
                {authLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{lang === 'FR' ? 'Traitement...' : 'Ap trete...'}</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{authMode === 'login' 
                      ? (lang === 'FR' ? 'Se Connecter' : 'Konekte') 
                      : (lang === 'FR' ? "S'inscrire" : 'Kreye Kont')}
                    </span>
                  </>
                )}
              </button>
            </form>

          </div>
          </div>
        </div>
      )}

      {/* FLOATING POINTS CELEBRATION TOAST */}
      {pointsToast && pointsToast.show && (
        <div
          id="loyalty-points-celebration"
          className="tt-toast fixed top-24 right-6 z-50 max-w-[340px] bg-gradient-to-r from-[#1c1030] to-[#0c0714] border-2 border-[#a855f7] rounded-2xl p-4 shadow-2xl flex items-center gap-3.5 overflow-hidden"
        >
          <div className="w-12 h-12 rounded-full bg-[#a855f7]/10 border border-[#a855f7]/30 flex items-center justify-center text-[#c084fc] relative flex-shrink-0">
            <Coins className="w-6 h-6 animate-spin" style={{ animationDuration: '4s' }} />
            <Sparkles className="w-3.5 h-3.5 text-[#a855f7] absolute -top-1 -right-1 animate-pulse" />
          </div>
          <div className="flex-grow">
            <h4 className="text-xs font-black text-[#a855f7] uppercase tracking-wider mb-0.5">
              {lang === 'FR' ? 'Points Gagnés !' : 'Pwen jwenn !'}
            </h4>
            <p className="text-[11px] text-white font-medium leading-relaxed">
              {pointsToast.msg}
            </p>
            <div className="flex items-center gap-1 mt-1 text-[9px] text-[#c084fc] font-extrabold uppercase tracking-widest">
              <Award className="w-3.5 h-3.5 text-[#a855f7]" />
              <span>{lang === 'FR' ? 'Nouveau total : ' : 'Nouvo total : '} {thieThiePoints} PTS</span>
            </div>
          </div>
          <button
            onClick={() => setPointsToast(null)}
            className="text-white/30 hover:text-white transition-colors p-1"
            aria-label={lang === 'FR' ? 'Fermer la notification' : 'Fèmen notifikasyon'}
          >
            <X className="w-3 h-3" />
          </button>
          <span className="tt-toast-bar absolute left-0 bottom-0 h-[3px] bg-[#a855f7]" style={{ animationDuration: '4s' }} />
        </div>
      )}

      {/* ORDER STATUS COMPLETED TOAST — s'empile sous le toast points s'ils sont visibles ensemble */}
      {orderToast && orderToast.show && (
        <div
          id="order-status-completed-toast"
          className={`tt-toast fixed right-6 z-50 max-w-[360px] bg-gradient-to-r from-[#0b0518] to-[#070310] border-2 border-emerald-500 rounded-2xl p-4 shadow-2xl flex items-center gap-3.5 overflow-hidden transition-[top] duration-300 ${
            pointsToast?.show ? 'top-[184px]' : 'top-24'
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 relative flex-shrink-0">
            <Bell className="w-6 h-6 animate-bounce" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>
          <div className="flex-grow">
            <h4 className="text-xs font-black text-emerald-400 uppercase tracking-wider mb-0.5">
              {lang === 'FR' ? 'Commande Livrée !' : 'Kòmand Livre !'}
            </h4>
            <p className="text-[11px] text-white font-medium leading-relaxed">
              {lang === 'FR'
                ? `Votre commande (${orderToast.productName}) est complétée et disponible !`
                : `Kòmand ou pou (${orderToast.productName}) konplete e li disponib !`}
            </p>
            <div className="mt-1 text-[9px] text-emerald-400/80 font-mono">
              ID: {orderToast.orderId}
            </div>
          </div>
          <button
            onClick={() => setOrderToast(null)}
            className="text-white/30 hover:text-white transition-colors p-1 self-start"
            aria-label="Fermer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <span className="tt-toast-bar absolute left-0 bottom-0 h-[3px] bg-emerald-500" style={{ animationDuration: '8s' }} />
        </div>
      )}

      {/* FLOAT ACTIONS (SCROLL TO TOP & WHATSAPP) */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-3 items-end">
        {showScrollTop && (
          <button
            id="scroll-to-top-button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="bg-[#1c1030]/90 hover:bg-[#a855f7] text-white hover:text-black p-3.5 rounded-full border border-white/10 hover:border-transparent shadow-2xl transition-all duration-300 transform hover:scale-110 active:scale-95 flex items-center justify-center backdrop-blur-md group"
            aria-label="Scroll to top"
          >
            <ArrowUp className="w-5 h-5 transition-transform group-hover:-translate-y-0.5" />
          </button>
        )}

        {/* FLOAT WHATSAPP QUICK BUTTON */}
        <a
          id="float-whatsapp-anchor"
          href="https://wa.me/50943231463?text=Bonjour%20Thie%20Thie%20Services%20👋"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-gradient-to-r from-green-500 to-emerald-600 text-white p-4 rounded-full shadow-2xl hover:scale-110 transition-transform flex items-center justify-center group relative"
        >
          <Send className="w-6 h-6 animate-pulse" />
          <span className="absolute right-16 bg-green-500 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden md:block">
            Besoin d'aide ? WhatsApp
          </span>
        </a>
      </div>

      {/* FOOTER SECTION */}
      <footer id="main-footer-section" className="bg-[#0b0e14] border-t border-white/[0.06] pt-16 pb-8 text-xs text-[#c9d1d9]">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-10">
          
          {/* Logo Description */}
          <div className="flex flex-col gap-4 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#a855f7] to-[#7c3aed] flex items-center justify-center text-black font-extrabold text-xs">
                TT
              </div>
              <span className="font-extrabold text-lg tracking-wider text-white">THIE THIE SERVICES</span>
            </div>
            <p className="text-white/50 leading-relaxed text-[11px]">
              {t('footerDesc')}
            </p>
          </div>

          {/* Quick Links navigation */}
          <div>
            <h4 className="text-white font-extrabold text-xs uppercase tracking-wider mb-4">Navigation</h4>
            <ul className="flex flex-col gap-2 font-medium">
              <li><button onClick={() => navigateToPage('home')} className="hover:text-[#a855f7] transition-colors">{t('accueil')}</button></li>
              <li><button onClick={() => navigateToPage('about')} className="hover:text-[#a855f7] transition-colors">{lang === 'FR' ? 'À Propos' : 'Kiyès nou ye'}</button></li>
              <li><button onClick={() => navigateToPage('contact')} className="hover:text-[#a855f7] transition-colors">{t('contact')}</button></li>
              <li><button onClick={() => navigateToPage('faq')} className="hover:text-[#a855f7] transition-colors">{t('faqTitle')}</button></li>
            </ul>
          </div>

          {/* Policies conditions */}
          <div>
            <h4 className="text-white font-extrabold text-xs uppercase tracking-wider mb-4">Légal</h4>
            <ul className="flex flex-col gap-2 font-medium">
              <li><button onClick={() => navigateToPage('privacy')} className="hover:text-[#a855f7] transition-colors">{t('privacyTitle')}</button></li>
              <li><button onClick={() => navigateToPage('terms')} className="hover:text-[#a855f7] transition-colors">{t('termsTitle')}</button></li>
            </ul>
          </div>

          {/* Newsletter Section */}
          <div className="flex flex-col gap-4">
            <h4 className="text-white font-extrabold text-xs uppercase tracking-wider mb-1">Newsletter</h4>
            <p className="text-[11px] text-white/50 leading-relaxed font-medium">
              {lang === 'FR' 
                ? 'Abonnez-vous pour recevoir les dernières offres, promos et nouveaux jeux.' 
                : 'Enskri pou resevwa dènye of, pwomosyon, ak nouvo jwèt yo.'}
            </p>
            <form onSubmit={handleNewsletterSubmit} className="relative mt-1">
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <input
                    type="email"
                    value={newsletterEmail}
                    onChange={(e) => {
                      setNewsletterEmail(e.target.value);
                      if (newsletterStatus !== 'idle') setNewsletterStatus('idle');
                    }}
                    placeholder={lang === 'FR' ? 'Votre adresse email' : 'Adrès imel ou'}
                    className="w-full bg-[#1c1030] border border-white/[0.08] text-xs px-3.5 py-3 pl-9 rounded-xl text-white focus:outline-none focus:border-[#a855f7]/50 placeholder-white/25"
                    disabled={newsletterStatus === 'loading' || newsletterStatus === 'success'}
                  />
                  <Mail className="absolute left-3 top-3.5 w-4 h-4 text-white/30" />
                </div>
                <button
                  type="submit"
                  disabled={newsletterStatus === 'loading' || newsletterStatus === 'success'}
                  className="w-full bg-gradient-to-r from-[#a855f7] to-[#7e22ce] hover:from-[#7e22ce] hover:to-[#a855f7] text-black font-black text-xs px-4 py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {newsletterStatus === 'loading' ? (
                    <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  ) : newsletterStatus === 'success' ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <span>{lang === 'FR' ? "S'abonner" : 'Enskri'}</span>
                  )}
                </button>
              </div>
            </form>
            {newsletterStatus === 'success' && (
              <p className="text-[10px] text-emerald-400 font-extrabold mt-1 animate-fadeIn flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/10">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>{newsletterMsg}</span>
              </p>
            )}
            {newsletterStatus === 'error' && (
              <p className="text-[10px] text-red-400 font-extrabold mt-1 animate-fadeIn flex items-center gap-1.5 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/10">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <span>{newsletterMsg}</span>
              </p>
            )}
          </div>

          {/* Payments newsletter */}
          <div className="flex flex-col gap-4">
            <h4 className="text-white font-extrabold text-xs uppercase tracking-wider mb-1">Modes de Paiement</h4>
            <div className="flex flex-wrap gap-2 items-center text-white/40 text-[10px] font-bold">
              <span className="bg-white/5 px-2 py-1 rounded">MonCash</span>
              <span className="bg-white/5 px-2 py-1 rounded">NatCash</span>
              <span className="bg-white/5 px-2 py-1 rounded">USDT TRC20</span>
              <span className="bg-white/5 px-2 py-1 rounded">PayPal</span>
            </div>
            
            <p className="text-[10px] text-white/40 mt-2 font-bold uppercase tracking-wider">SUPPORT DIRECT</p>
            <p className="text-white font-extrabold -mt-2">+509 4323 1463</p>
          </div>

          {/* Standalone Currency Converter */}
          <div className="flex flex-col gap-3 bg-[#131a26]/90 border border-white/[0.08] p-4 rounded-2xl shadow-xl">
            <div className="flex items-center justify-between">
              <h4 className="text-white font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-[#a855f7]" />
                <span>{lang === 'FR' ? 'Convertisseur' : 'Konvètisè'}</span>
              </h4>
              <span className="text-[8px] bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full text-white/50 font-black uppercase tracking-wider">
                Mode: {calcMode}
              </span>
            </div>
            <p className="text-[10px] text-white/55 leading-normal font-medium">
              {lang === 'FR' 
                ? 'Convertissez instantanément vos prix entre USD et Gourdes.' 
                : 'Chanje pri ou fasil ant USD ak Goud.'}
            </p>
            
            <div className="space-y-1.5">
              {/* USD Input */}
              <div className="relative">
                <input
                  type="text"
                  value={calcUSD}
                  onChange={(e) => handleUSDCalcChange(e.target.value)}
                  onFocus={() => setCalcMode('USD')}
                  placeholder="0"
                  className={`w-full bg-black/40 border text-[11px] px-2.5 py-2 pl-12 rounded-xl text-white font-extrabold transition-all duration-300 focus:outline-none ${
                    calcMode === 'USD' 
                      ? 'border-[#a855f7] bg-[#a855f7]/5 shadow-[0_0_12px_rgba(168,85,247,0.15)]' 
                      : 'border-white/[0.08] opacity-70 hover:opacity-100'
                  }`}
                />
                <span className="absolute left-2.5 top-2.5 text-[9px] font-extrabold text-white/40">USD ($)</span>
                {calcMode === 'USD' && (
                  <span className="absolute right-2.5 top-2.5 text-[8px] font-black text-[#a855f7] bg-[#a855f7]/10 px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">
                    {lang === 'FR' ? 'Actif' : 'Aktif'}
                  </span>
                )}
              </div>

              {/* Arrow Indicator */}
              <div className="flex justify-center -my-1">
                <div className="bg-[#1c1030] border border-white/[0.08] p-0.5 rounded-full text-white/60">
                  <ArrowUpDown className="w-3 h-3 text-[#a855f7]" />
                </div>
              </div>

              {/* HTG Input */}
              <div className="relative">
                <input
                  type="text"
                  value={calcHTG}
                  onChange={(e) => handleHTGCalcChange(e.target.value)}
                  onFocus={() => setCalcMode('HTG')}
                  placeholder="0"
                  className={`w-full bg-black/40 border text-[11px] px-2.5 py-2 pl-14 rounded-xl font-extrabold transition-all duration-300 focus:outline-none ${
                    calcMode === 'HTG' 
                      ? 'border-[#a855f7] bg-[#a855f7]/5 text-[#a855f7] shadow-[0_0_12px_rgba(168,85,247,0.15)]' 
                      : 'border-white/[0.08] text-[#a855f7]/70 opacity-70 hover:opacity-100'
                  }`}
                />
                <span className="absolute left-2.5 top-2.5 text-[9px] font-extrabold text-white/40">HTG (G)</span>
                {calcMode === 'HTG' && (
                  <span className="absolute right-2.5 top-2.5 text-[8px] font-black text-[#a855f7] bg-[#a855f7]/10 px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">
                    {lang === 'FR' ? 'Actif' : 'Aktif'}
                  </span>
                )}
              </div>
            </div>

            {/* Quick Presets */}
            <div className="mt-1">
              <p className="text-[9px] uppercase tracking-wider text-white/30 font-bold mb-1">{lang === 'FR' ? 'Raccourcis' : 'Rakousi'}</p>
              <div className="flex flex-wrap gap-1">
                {[5, 10, 20, 50, 100].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      handlePresetClick(preset);
                      setCalcMode('USD');
                    }}
                    className="text-[9px] bg-white/[0.03] hover:bg-[#a855f7]/10 hover:text-[#a855f7] hover:border-[#a855f7]/30 border border-white/[0.05] px-1.5 py-0.5 rounded-md text-white/70 font-extrabold transition-all"
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[9px] text-white/30 font-bold text-center mt-1 pt-1.5 border-t border-white/[0.04]">
              Taux : 1$ = {exchangeRate} HTG
            </p>
          </div>

        </div>

        {/* Copyright notice bar */}
        <div className="max-w-7xl mx-auto px-4 border-t border-white/[0.05] mt-12 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-[10px] text-white/30 font-bold uppercase tracking-wider">
          <span>© {new Date().getFullYear()} {t('copyright')}</span>
          <span>Crafted for gamers with passion</span>
        </div>
      </footer>

      </div>

      <BottomTabBar
        lang={lang}
        currentPage={currentPage}
        navigateToPage={navigateToPage}
        wishlistCount={wishlist.length}
      />
    </div>
  );
}
