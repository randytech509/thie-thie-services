import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User as FirebaseUser,
  updateProfile,
  updatePassword
} from 'firebase/auth';
import { 
  doc, 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  updateDoc, 
  setDoc,
  getDoc,
  deleteDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { reviewDeposit, reviewKyc, createCryptoInvoice, fulfillOrder } from '../lib/api';
import { enablePushNotifications } from '../lib/push';
import { SkeletonList } from './Skeleton';
import { db, auth, storage } from '../firebase';
import freeFireCategoryBanner from '../assets/images/free-fire-banner.webp';
// `pubg_mobile_helmet_overgrown.jpg` supprimé (fichier irrécupérable, ne s'affichait jamais).
const pubgOvergrownHelmet = 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=600';
import { 
  User, 
  Phone, 
  Mail, 
  Award, 
  Clock, 
  Check, 
  AlertTriangle, 
  LogOut, 
  Camera, 
  Coins, 
  ShoppingBag, 
  ArrowRight,
  Sparkles,
  Loader2,
  Lock,
  X,
  Plus,
  CreditCard,
  Filter,
  ChevronRight,
  TrendingUp,
  HelpCircle,
  FileText,
  Bell,
  Globe,
  Shield,
  RefreshCw,
  BarChart3,
  Star,
  Eye,
  EyeOff,
  Copy,
  Send,
  Inbox,
  CheckCircle,
  XCircle,
  ExternalLink,
  ChevronDown,
  UserCheck,
  BellOff,
  LayoutDashboard
} from 'lucide-react';

interface UserProfileProps {
  user: FirebaseUser;
  profilePhone: string;
  thieThiePoints: number;
  getLoyaltyLevel: (points: number) => { nameFR: string; nameHT: string; color: string; bg: string };
  firebaseOrders: any[];
  firebaseOrdersLoading: boolean;
  onUpdateProfile: (displayName: string, phone: string) => Promise<void>;
  onProfilePictureUpload: (file: File) => Promise<void>;
  onLogout: () => Promise<void>;
  lang: 'FR' | 'HT';
  navigateToPage: (page: any) => void;
  formatPrice: (priceUSD: number) => string;
}

const translations = {
  FR: {
    profileTitle: "Profil Joueur Pro",
    editProfile: "Éditer mon profil",
    displayName: "Nom d'affichage",
    fullName: "Nom complet",
    phone: "Numéro WhatsApp / Téléphone",
    save: "Enregistrer les modifications",
    uploading: "Importation...",
    changeAvatar: "Modifier la photo",
    dragDrop: "Glissez une image ici ou cliquez pour choisir",
    orderHistory: "Historique des Commandes",
    noOrders: "Aucun achat enregistré pour le moment. Commencez à recharger vos jeux !",
    orderId: "Référence",
    status: "Statut",
    product: "Produit",
    price: "Montant",
    method: "Paiement",
    pending: "En cours",
    completed: "Livré",
    failed: "Annulé",
    logout: "Se déconnecter",
    shopCTA: "Recharger un jeu pour gagner des points",
    successMsg: "Votre profil a été mis à jour !",
    errorMsg: "Une erreur est survenue.",
    walletBalance: "Solde Disponible",
    addFunds: "Ajouter des fonds",
    withdraw: "Retirer",
    totalAdded: "Total Déposé",
    totalSpent: "Total Dépensé",
    transactionsTitle: "Historique des Transactions",
    all: "Tous",
    filterDate: "Date",
    filterGame: "Jeu",
    filterPayment: "Paiement",
    filterStatus: "Statut",
    statisticsTitle: "Vos Statistiques de Jeu",
    statTotalOrders: "Total Commandes",
    statCompletedOrders: "Commandes Livrées",
    statPendingOrders: "Commandes En Cours",
    statFavGame: "Jeu Favori",
    accountSettings: "Paramètres du Compte",
    changePassword: "Changer le Mot de Passe",
    language: "Langue de l'application",
    notifications: "Notifications Gaming",
    privacyPolicy: "Politique de Confidentialité",
    termsConditions: "Conditions Générales",
    helpSupport: "Aide & Support Client",
    about: "À propos de l'application",
    verifiedUser: "Joueur Vérifié",
    simulatedApproval: "Vérifier (Demo)",
    withdrawComingSoon: "La fonction de retrait sera disponible prochainement !",
    addFundsTitle: "Ajouter des Fonds",
    selectAmount: "Choisissez le montant en HTG",
    customAmount: "Montant Personnalisé",
    transactionRef: "Référence ou Numéro d'envoi",
    submitDeposit: "Soumettre le Dépôt",
    depositPendingDesc: "Votre demande de dépôt est en attente de validation administrative.",
    newPasswordLabel: "Nouveau Mot de Passe",
    confirmPasswordLabel: "Confirmer le Mot de Passe",
    passwordChangedSuccess: "Votre mot de passe a été modifié avec succès !",
    notificationsEnabled: "Les notifications gaming sont activées sur votre profil.",
    notificationsDisabled: "Les notifications gaming sont actuellement désactivées.",
    unspecified: "Non spécifié"
  },
  HT: {
    profileTitle: "Profil Jwè Pwo",
    editProfile: "Chanje enfòmasyon mwen yo",
    displayName: "Non d'affichage",
    fullName: "Non konplè",
    phone: "Nimewo WhatsApp / Telefòn",
    save: "Sove chanjman yo",
    uploading: "Ap monte...",
    changeAvatar: "Chanje foto",
    dragDrop: "Trennen yon foto la a oswa klike pou chwazi",
    orderHistory: "Istorik Lòd Yo",
    noOrders: "Pa gen lòd ki fèt ankò. Kòmanse achte kounye a!",
    orderId: "Referans",
    status: "Estati",
    product: "Pwodwi",
    price: "Montan",
    method: "Peman",
    pending: "Ap trete",
    completed: "Delivre",
    failed: "Anile",
    logout: "Dekonekte",
    shopCTA: "Ale nan boutik la pou fè pwen",
    successMsg: "Profil ou mete ajou!",
    errorMsg: "Gen yon erè ki fèt.",
    walletBalance: "Kòb ki Disponib",
    addFunds: "Depoze Kòb",
    withdraw: "Retire Kòb",
    totalAdded: "Kòb ou Depoze",
    totalSpent: "Kòb ou Depanse",
    transactionsTitle: "Istorik Tranzaksyon Yo",
    all: "Tout",
    filterDate: "Dat",
    filterGame: "Jwèt",
    filterPayment: "Peman",
    filterStatus: "Estati",
    statisticsTitle: "Statistik Jwèt Ou Yo",
    statTotalOrders: "Total Lòd Yo",
    statCompletedOrders: "Lòd ki Delivre",
    statPendingOrders: "Lòd k ap Trete",
    statFavGame: "Jwèt Prefere",
    accountSettings: "Anprent & Anviwònman",
    changePassword: "Chanje Mo de Pas",
    language: "Langaj aplikasyon an",
    notifications: "Notifikasyon Jwèt yo",
    privacyPolicy: "Règ Konfidansyalite",
    termsConditions: "Kondisyon Jeneral yo",
    helpSupport: "Sipò & Ed Kliyan",
    about: "Konsènan aplikasyon an",
    verifiedUser: "Jwè Verifye",
    simulatedApproval: "Verifye (Demo)",
    withdrawComingSoon: "Opsyon retrè kòb la ap disponib talè konsa!",
    addFundsTitle: "Depoze Lajan",
    selectAmount: "Chwazi montan an an HTG",
    customAmount: "Lòt Montan",
    transactionRef: "Referans oswa Nimewo Transfè",
    submitDeposit: "Voye Demann lan",
    depositPendingDesc: "Demann depo ou a ap tann yon admin verifye li.",
    newPasswordLabel: "Nouvo Mo de Pas",
    confirmPasswordLabel: "Konfime Mo de Pas",
    passwordChangedSuccess: "Mo de pas ou chanje avèk siksè !",
    notificationsEnabled: "Notifikasyon jwèt yo aktif sou pwofil ou.",
    notificationsDisabled: "Notifikasyon jwèt yo dezaktive kounye a.",
    unspecified: "Pa espesifye"
  }
};

const getGameImage = (gameName: string) => {
  const name = (gameName || '').toLowerCase();
  if (name.includes('free fire')) return freeFireCategoryBanner;
  if (name.includes('pubg')) return pubgOvergrownHelmet;
  if (name.includes('robux') || name.includes('roblox')) return 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&q=80&w=400';
  if (name.includes('netflix')) return 'https://images.unsplash.com/photo-1574375927938-d5a98e8edd86?auto=format&fit=crop&q=80&w=400';
  if (name.includes('google play')) return 'https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?auto=format&fit=crop&q=80&w=400';
  if (name.includes('apple')) return 'https://images.unsplash.com/photo-1621761191319-c6fb62004040?auto=format&fit=crop&q=80&w=600';
  if (name.includes('playstation')) return 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?auto=format&fit=crop&q=80&w=400';
  if (name.includes('xbox')) return 'https://images.unsplash.com/photo-1605901309584-818e25960a8f?auto=format&fit=crop&q=80&w=400';
  if (name.includes('valorant')) return 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=400';
  if (name.includes('efootball')) return 'https://image.api.playstation.com/vulcan/ap/rnd/202308/2513/1908ef918e69d95f87b328a6fdf94291c95f19c29ca52e9f.png';
  if (name.includes('cod') || name.includes('duty')) return 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&q=80&w=400';
  return 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&q=80&w=400';
};

export const UserProfile: React.FC<UserProfileProps> = ({
  user,
  profilePhone,
  thieThiePoints,
  getLoyaltyLevel,
  lang,
  navigateToPage,
  onLogout,
  onProfilePictureUpload
}) => {
  const t = translations[lang];
  const loyalty = getLoyaltyLevel(thieThiePoints);

  // --- Real-time Synchronized DB States ---
  const [dbUser, setDbUser] = useState<any>({
    balance: 0,
    walletBalance: 0,
    totalAdded: 0,
    totalMoneyAdded: 0,
    totalSpent: 0,
    totalMoneySpent: 0,
    fullName: user.displayName || user.email?.split('@')[0] || 'Gamer',
    phoneNumber: profilePhone || '',
    memberSince: new Date().toLocaleDateString(lang === 'FR' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' })
  });

  // INVARIANT 6 : l'autorité admin provient EXCLUSIVEMENT du custom claim `admin`.
  // Plus aucun email ni champ `role` Firestore ne confère de privilège.
  const [isAdminClaim, setIsAdminClaim] = useState(false);
  // Livraison admin d'une commande (saisie du code + envoi e-mail)
  const [fulfillTarget, setFulfillTarget] = useState<any | null>(null);
  const [fulfillCode, setFulfillCode] = useState('');
  const [fulfillInstructions, setFulfillInstructions] = useState('');
  const [fulfilling, setFulfilling] = useState(false);
  const [fulfillMsg, setFulfillMsg] = useState<string | null>(null);
  const handleFulfill = async () => {
    if (!fulfillTarget || !fulfillCode.trim()) return;
    setFulfilling(true);
    setFulfillMsg(null);
    try {
      const res = await fulfillOrder({
        orderId: fulfillTarget.orderId || fulfillTarget.id,
        code: fulfillCode.trim(),
        instructions: fulfillInstructions.trim() || undefined,
      });
      setFulfillMsg(res.emailSent ? 'Code livré et e-mail envoyé au client.' : `Code enregistré, mais e-mail NON envoyé : ${res.error || 'erreur'}`);
      setFulfillCode('');
      setFulfillInstructions('');
      setTimeout(() => { setFulfillTarget(null); setFulfillMsg(null); }, 2600);
    } catch (e) {
      setFulfillMsg(`Échec : ${(e as Error).message}`);
    } finally {
      setFulfilling(false);
    }
  };
  useEffect(() => {
    if (!user) { setIsAdminClaim(false); return; }
    user.getIdTokenResult()
      .then((res) => setIsAdminClaim(res.claims?.admin === true))
      .catch(() => setIsAdminClaim(false));
  }, [user]);

  const [transactions, setTransactions] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  // --- Form & Edit States ---
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editFreeFirePlayerId, setEditFreeFirePlayerId] = useState('');
  const [editFreeFirePlayerIdError, setEditFreeFirePlayerIdError] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editSuccess, setEditSuccess] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Wallet Actions States ---
  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const [withdrawAlertOpen, setWithdrawAlertOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('1000');
  const [depositPaymentMethod, setDepositPaymentMethod] = useState<'MonCash' | 'NatCash' | 'Binance Pay' | 'PayPal' | 'Crypto'>('MonCash');
  const [depositPhoneRef, setDepositPhoneRef] = useState(''); // MonCash/NatCash : numéro de l'expéditeur ; PayPal : e-mail
  const [depositTxId, setDepositTxId] = useState('');         // Transaction ID (TransCode) — clé de rapprochement
  const [depositSenderName, setDepositSenderName] = useState(''); // Nom de l'expéditeur (MonCash/NatCash)
  const [submittingDeposit, setSubmittingDeposit] = useState(false);
  const [depositSuccessMsg, setDepositSuccessMsg] = useState(false);

  // --- New Wallet States ---
  const [depositScreenshot, setDepositScreenshot] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [walletRequests, setWalletRequests] = useState<any[]>([]);
  const [myWalletRequests, setMyWalletRequests] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [pushStatus, setPushStatus] = useState<'idle' | 'loading' | 'enabled' | 'error'>('idle');
  const [pushError, setPushError] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);

  // --- KYC States (gate de la recharge crypto) ---
  const [kycModalOpen, setKycModalOpen] = useState(false);
  const [kycFullName, setKycFullName] = useState('');
  const [kycIdFile, setKycIdFile] = useState<File | null>(null);
  const [kycSelfieFile, setKycSelfieFile] = useState<File | null>(null);
  const [submittingKyc, setSubmittingKyc] = useState(false);
  const [kycSuccessMsg, setKycSuccessMsg] = useState(false);
  const [myKycRequests, setMyKycRequests] = useState<any[]>([]);
  const [pendingKycRequests, setPendingKycRequests] = useState<any[]>([]);
  const [selectedKycRequest, setSelectedKycRequest] = useState<any | null>(null);
  const [submittingKycReview, setSubmittingKycReview] = useState(false);

  // --- Crypto Deposit States (OxaPay, débloqué après KYC approuvé) ---
  const [cryptoAmountUsd, setCryptoAmountUsd] = useState('10');
  const [cryptoInvoice, setCryptoInvoice] = useState<{ requestId: string; paymentUrl: string; amountUsd: number } | null>(null);
  const [creatingCryptoInvoice, setCreatingCryptoInvoice] = useState(false);
  const [cryptoError, setCryptoError] = useState<string | null>(null);

  // --- Coordonnées de dépôt manuel (config/depositAccounts, lecture publique) ---
  // Sorties du code source (repo public) : voir scripts/seed-deposit-accounts.mjs.
  const [depositAccounts, setDepositAccounts] = useState<{
    moncashName: string; moncashNumber: string;
    natcashName: string; natcashNumber: string;
    binancePayId: string; paypalEmail: string;
  } | null>(null);
  useEffect(() => {
    getDoc(doc(db, 'config', 'depositAccounts'))
      .then((snap) => { if (snap.exists()) setDepositAccounts(snap.data() as typeof depositAccounts); })
      .catch((err) => console.error('Failed to load deposit accounts config:', err));
  }, []);

  // --- Change Password States ---
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // --- Notification Toggles ---
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notifToast, setNotifToast] = useState(false);

  // --- About Modal State ---
  const [aboutModalOpen, setAboutModalOpen] = useState(false);

  // --- Transaction Filters ---
  const [filterDateSelected, setFilterDateSelected] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [filterGameSelected, setFilterGameSelected] = useState<string>('all');
  const [filterPaymentSelected, setFilterPaymentSelected] = useState<string>('all');
  const [filterStatusSelected, setFilterStatusSelected] = useState<string>('all');

  // --- REAL-TIME FIRESTORE SYNCHRONIZATION ---
  useEffect(() => {
    if (!user) return;

    // 1. Subscribe to User details in real-time
    const userRef = doc(db, 'users', user.uid);
    const unsubUser = onSnapshot(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setDbUser(data);

        // Auto initialize fields if they don't exist
        if (data.balance === undefined || data.walletBalance === undefined || data.totalAdded === undefined || data.totalSpent === undefined || data.memberSince === undefined) {
          updateDoc(userRef, {
            balance: data.balance ?? 0,
            walletBalance: data.walletBalance ?? data.balance ?? 0,
            totalAdded: data.totalAdded ?? 0,
            totalMoneyAdded: data.totalMoneyAdded ?? data.totalAdded ?? 0,
            totalSpent: data.totalSpent ?? 0,
            totalMoneySpent: data.totalMoneySpent ?? data.totalSpent ?? 0,
            memberSince: data.memberSince ?? new Date().toLocaleDateString(lang === 'FR' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' }),
            updatedAt: new Date().toISOString()
          }).catch(console.error);
        }
      }
    });

    // 2. Subscribe to wallet transactions in real-time
    const txRef = collection(db, 'wallet_transactions');
    const qTx = query(txRef, where('uid', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubTx = onSnapshot(qTx, (snapshot) => {
      const txList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(txList);
    }, (err) => console.error("Transactions subscription error:", err));

    // 3. Subscribe to orders in real-time
    const ordersRef = collection(db, 'orders');
    const isAdmin = isAdminClaim;
    const qOrders = isAdmin
      ? query(ordersRef, orderBy('createdAt', 'desc'))
      : query(ordersRef, where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubOrders = onSnapshot(qOrders, (snapshot) => {
      const orderList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrders(orderList);
      setOrdersLoading(false);
    }, (err) => {
      console.error("Orders subscription error:", err);
      setOrdersLoading(false);
    });

    // 4. Subscribe to user's notifications
    const notificationsRef = collection(db, 'notifications');
    const qNotifications = query(notificationsRef, where('uid', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubNotifications = onSnapshot(qNotifications, (snapshot) => {
      const notifList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setNotifications(notifList);
    }, (err) => console.error("Notifications subscription error:", err));

    // 5. Subscribe to user's wallet requests
    const requestsRef = collection(db, 'wallet_requests');
    const qRequests = query(requestsRef, where('uid', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubMyRequests = onSnapshot(qRequests, (snapshot) => {
      const reqList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMyWalletRequests(reqList);
    }, (err) => console.error("My requests subscription error:", err));

    // 6. If admin, subscribe to ALL wallet requests in real-time
    let unsubAdminRequests = () => {};
    if (isAdminClaim) {
      const qAdminRequests = query(requestsRef, orderBy('createdAt', 'desc'));
      unsubAdminRequests = onSnapshot(qAdminRequests, (snapshot) => {
        const reqList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setWalletRequests(reqList);
      }, (err) => console.error("Admin requests subscription error:", err));
    }

    // 7. Subscribe to user's own KYC requests
    const kycRef = collection(db, 'kyc_requests');
    const qMyKyc = query(kycRef, where('uid', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubMyKyc = onSnapshot(qMyKyc, (snapshot) => {
      setMyKycRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("My KYC requests subscription error:", err));

    // 8. If admin, subscribe to ALL KYC requests in real-time
    let unsubAdminKyc = () => {};
    if (isAdminClaim) {
      const qAdminKyc = query(kycRef, orderBy('createdAt', 'desc'));
      unsubAdminKyc = onSnapshot(qAdminKyc, (snapshot) => {
        setPendingKycRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (err) => console.error("Admin KYC requests subscription error:", err));
    }

    return () => {
      unsubUser();
      unsubTx();
      unsubOrders();
      unsubNotifications();
      unsubMyRequests();
      unsubAdminRequests();
      unsubMyKyc();
      unsubAdminKyc();
    };
  }, [user, dbUser?.role, isAdminClaim]);

  // --- Dynamic Statistics Calculations ---
  const totalOrdersCount = orders.length;
  const completedOrdersCount = orders.filter(o => o.status === 'completed' || o.status === 'Delivered').length;
  const pendingOrdersCount = orders.filter(o => o.status === 'pending' || o.status === 'Pending Verification' || o.status === 'Pending').length;
  // Fix drift 2026-07-16 : le serveur (transactions.ts) n'écrit QUE les champs *Cents
  // (walletBalanceCents/totalAddedCents/totalSpentCents) — les anciens champs sans suffixe
  // (balance/totalAdded/totalSpent) ne sont plus jamais mis à jour depuis le rewrite J1 et
  // restaient figés à 0 après un dépôt/achat réel (contrairement au header App.tsx, déjà
  // branché sur walletBalanceCents).
  const walletBalanceHtg = (dbUser.walletBalanceCents ?? 0) / 100;
  const totalWalletAdded = (dbUser.totalAddedCents ?? 0) / 100;
  const totalWalletSpent = (dbUser.totalSpentCents ?? 0) / 100;

  // Calculate favorite game dynamically from order history
  const getFavoriteGame = () => {
    if (orders.length === 0) return "Free Fire";
    const counts: { [key: string]: number } = {};
    orders.forEach(o => {
      const name = o.productName || o.game || "Free Fire";
      counts[name] = (counts[name] || 0) + 1;
    });
    let maxGame = "Free Fire";
    let maxCount = 0;
    Object.entries(counts).forEach(([game, count]) => {
      if (count > maxCount) {
        maxCount = count;
        maxGame = game;
      }
    });
    return maxGame;
  };
  const favoriteGame = getFavoriteGame();

  // --- Format Balance ---
  const formatHTG = (amount: number) => {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0 }).format(amount) + ' HTG';
  };

  // --- Profile Actions ---
  const handleEditProfileOpen = () => {
    setEditFullName(dbUser.fullName || user.displayName || '');
    setEditPhone(dbUser.phoneNumber || profilePhone || '');
    setEditFreeFirePlayerId(dbUser.freeFirePlayerId || '');
    setEditFreeFirePlayerIdError(null);
    setEditModalOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFullName.trim()) return;

    if (editFreeFirePlayerId.trim()) {
      const numericRegex = /^\d+$/;
      if (!numericRegex.test(editFreeFirePlayerId)) {
        setEditFreeFirePlayerIdError(
          lang === 'FR' 
            ? 'Le Player ID doit contenir uniquement des chiffres.' 
            : 'Player ID la dwe genyen chif sèlman.'
        );
        return;
      }
    }
    setEditFreeFirePlayerIdError(null);

    setEditingProfile(true);
    setEditSuccess(false);
    try {
      // Update Firebase Auth display name
      await updateProfile(user, { displayName: editFullName });
      // Update Firestore user profile
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        fullName: editFullName,
        displayName: editFullName,
        phoneNumber: editPhone,
        freeFirePlayerId: editFreeFirePlayerId.trim(),
        updatedAt: new Date().toISOString()
      });
      setEditSuccess(true);
      setTimeout(() => {
        setEditSuccess(false);
        setEditModalOpen(false);
      }, 2000);
    } catch (error) {
      console.error(error);
    } finally {
      setEditingProfile(false);
    }
  };

  const handleCopyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => {
      setCopiedField(null);
    }, 2000);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadProgress(true);
      try {
        // Délègue à App.handleProfilePictureUpload : chemin avatars/ correct (aligné storage.rules)
        // + updateProfile + updateDoc + rafraîchit l'état user (setUser) → la photo s'affiche.
        await onProfilePictureUpload(file);
      } catch (err) {
        console.error("Avatar upload error:", err);
      } finally {
        setUploadProgress(false);
      }
    }
  };

  // --- Wallet Actions ---
  const handleSubmitDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(depositAmount);
    // Bornes : évite un montant aberrant / injection de milliers de chiffres (10 HTG à 1 000 000 HTG).
    if (isNaN(parsedAmount) || !Number.isFinite(parsedAmount) || parsedAmount < 10 || parsedAmount > 1000000) {
      alert(lang === 'FR' ? 'Montant invalide (entre 10 et 1 000 000 HTG).' : 'Montan pa valab (ant 10 ak 1 000 000 HTG).');
      return;
    }

    const isMobile = depositPaymentMethod === 'MonCash' || depositPaymentMethod === 'NatCash';
    if (isMobile && (!depositTxId.trim() || !depositSenderName.trim() || !depositPhoneRef.trim())) {
      alert(lang === 'FR' ? 'Transaction ID, nom et numéro de l\'expéditeur requis.' : 'Transaction ID, non ak nimewo moun ki voye a obligatwa.');
      return;
    }

    setSubmittingDeposit(true);
    try {
      const requestId = 'WREQ-' + Math.floor(100000 + Math.random() * 900000);
      let screenshotURL = '';

      if (depositScreenshot) {
        // Chemin segmenté par uid = invariant 7 (storage.rules /proofs/{uid}/{fileId}).
        const storageRef = ref(storage, `proofs/${user.uid}/${requestId}-${depositScreenshot.name}`);
        const uploadResult = await uploadBytes(storageRef, depositScreenshot);
        screenshotURL = await getDownloadURL(uploadResult.ref);
      }

      // transactionReference = Transaction ID (TransCode) : clé de rapprochement auto avec le SMS
      // marchand. senderName/senderPhone = vérification + repli (numéro+montant) si le TxID diffère.
      const reference = isMobile ? depositTxId.trim() : (depositTxId.trim() || depositPhoneRef.trim() || 'N/A');
      const txRef = doc(db, 'wallet_requests', requestId);
      await setDoc(txRef, {
        requestId,
        uid: user.uid,
        amount: parsedAmount,
        paymentMethod: depositPaymentMethod,
        transactionReference: reference,
        senderName: isMobile ? depositSenderName.trim().slice(0, 80) : '',
        senderPhone: isMobile ? depositPhoneRef.trim().slice(0, 15) : '',
        screenshotURL: screenshotURL || 'N/A',
        status: 'Pending Verification',
        createdAt: new Date().toISOString()
      });

      // Also create a notification
      const notifId = 'NOTIF-' + Math.floor(100000 + Math.random() * 900000);
      await setDoc(doc(db, 'notifications', notifId), {
        notificationId: notifId,
        uid: user.uid,
        title: lang === 'FR' ? 'Dépôt soumis !' : 'Depo voye !',
        message: lang === 'FR' 
          ? `Votre demande de dépôt de ${parsedAmount} HTG via ${depositPaymentMethod} a été soumise avec succès.` 
          : `Demand depo ${parsedAmount} HTG pa w la via ${depositPaymentMethod} voye byen.`,
        read: false,
        createdAt: new Date().toISOString()
      });

      setDepositSuccessMsg(true);
      setDepositAmount('1000');
      setPhoneSenderState('');
      setDepositPhoneRef('');
      setDepositTxId('');
      setDepositSenderName('');
      setDepositScreenshot(null);
      setTimeout(() => {
        setDepositSuccessMsg(false);
        setAddFundsOpen(false);
      }, 3500);
    } catch (err) {
      console.error("Failed deposit request:", err);
    } finally {
      setSubmittingDeposit(false);
    }
  };

  // State utility to clear sender state cleanly
  const setPhoneSenderState = (val: string) => {
    // Helper placeholder
  };

  // --- Validation des dépôts (admin) — J1 ---
  // Invariants 2 & 3 : le crédit du solde, le ledger wallet_transactions et la transition de
  // statut wallet_requests sont serveur-only (firestore.rules). L'admin ne fait AUCUNE écriture
  // directe : il appelle la Cloud Function transactionnelle idempotente `reviewDeposit`
  // (→ creditWallet()), qui dédupe sur requestId (pas de double-crédit même en re-clic/retry).
  // La liste `walletRequests` se met à jour d'elle-même via son listener onSnapshot.
  const handleReviewDeposit = async (req: any, decision: 'approve' | 'reject') => {
    const requestId = req?.requestId;
    if (!requestId) return;
    setSubmittingDeposit(true);
    try {
      await reviewDeposit({ requestId, decision });
      setSelectedRequest(null);
    } catch (err: any) {
      console.error('reviewDeposit a échoué :', err);
      alert(err?.message || (lang === 'FR'
        ? "Échec de la validation du dépôt. Réessayez."
        : "Validasyon depo a echwe. Eseye ankò."));
    } finally {
      setSubmittingDeposit(false);
    }
  };

  const handleApproveDeposit = (req: any) => handleReviewDeposit(req, 'approve');
  const handleRejectDeposit = (req: any) => handleReviewDeposit(req, 'reject');

  // --- KYC (léger, manuel) — débloque la recharge crypto ---
  const kycStatus: 'none' | 'pending' | 'approved' | 'rejected' = dbUser.kycStatus ?? 'none';

  const handleSubmitKyc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kycIdFile || !kycSelfieFile || !kycFullName.trim()) return;
    setSubmittingKyc(true);
    try {
      const requestId = 'KYC-' + Math.floor(100000 + Math.random() * 900000);

      const idRef = ref(storage, `kyc_proofs/${user.uid}/${requestId}-id-${kycIdFile.name}`);
      const idUpload = await uploadBytes(idRef, kycIdFile);
      const idPhotoURL = await getDownloadURL(idUpload.ref);

      const selfieRef = ref(storage, `kyc_proofs/${user.uid}/${requestId}-selfie-${kycSelfieFile.name}`);
      const selfieUpload = await uploadBytes(selfieRef, kycSelfieFile);
      const selfiePhotoURL = await getDownloadURL(selfieUpload.ref);

      await setDoc(doc(db, 'kyc_requests', requestId), {
        requestId,
        uid: user.uid,
        fullName: kycFullName.trim(),
        idPhotoURL,
        selfiePhotoURL,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });

      setKycSuccessMsg(true);
      setKycFullName('');
      setKycIdFile(null);
      setKycSelfieFile(null);
      setTimeout(() => {
        setKycSuccessMsg(false);
        setKycModalOpen(false);
      }, 3500);
    } catch (err) {
      console.error('Échec de la soumission KYC :', err);
      alert(lang === 'FR' ? "Échec de l'envoi. Réessayez." : "Voye a echwe. Eseye ankò.");
    } finally {
      setSubmittingKyc(false);
    }
  };

  // Validation manuelle du KYC (admin) — même politique que reviewDeposit : AUCUNE écriture
  // directe côté client, tout passe par la Cloud Function reviewKyc (Admin SDK).
  const handleReviewKyc = async (req: any, decision: 'approve' | 'reject') => {
    const requestId = req?.requestId;
    if (!requestId) return;
    setSubmittingKycReview(true);
    try {
      await reviewKyc({ requestId, decision });
      setSelectedKycRequest(null);
    } catch (err: any) {
      console.error('reviewKyc a échoué :', err);
      alert(err?.message || (lang === 'FR' ? "Échec de la validation KYC." : "Validasyon KYC echwe."));
    } finally {
      setSubmittingKycReview(false);
    }
  };
  const handleApproveKyc = (req: any) => handleReviewKyc(req, 'approve');
  const handleRejectKyc = (req: any) => handleReviewKyc(req, 'reject');

  // --- Recharge crypto (OxaPay) — réservée à kycStatus === 'approved' (revérifié SERVEUR) ---
  const handleCreateCryptoInvoice = async () => {
    const amount = parseFloat(cryptoAmountUsd);
    if (isNaN(amount) || !Number.isFinite(amount) || amount < 5 || amount > 1000) {
      setCryptoError(lang === 'FR' ? 'Montant invalide (entre 5 et 1000 USD).' : 'Montan pa valab (ant 5 ak 1000 USD).');
      return;
    }
    setCreatingCryptoInvoice(true);
    setCryptoError(null);
    try {
      const res = await createCryptoInvoice({ amountUsd: amount });
      setCryptoInvoice({ requestId: res.requestId, paymentUrl: res.paymentUrl, amountUsd: res.amountUsd });
    } catch (err: any) {
      setCryptoError(err?.message || (lang === 'FR' ? "Échec de la génération de la facture." : "Echèk kreyasyon fakti a."));
    } finally {
      setCreatingCryptoInvoice(false);
    }
  };

  // Suit en temps réel la wallet_request créée par createCryptoInvoice : dès que le webhook
  // OxaPay signé crédite le wallet (status → 'Completed'), on ferme la facture et affiche succès.
  useEffect(() => {
    if (!cryptoInvoice) return;
    const unsub = onSnapshot(doc(db, 'wallet_requests', cryptoInvoice.requestId), (snap) => {
      if (snap.exists() && snap.data().status === 'Completed') {
        setCryptoInvoice(null);
        setDepositSuccessMsg(true);
        setTimeout(() => {
          setDepositSuccessMsg(false);
          setAddFundsOpen(false);
        }, 3500);
      }
    });
    return () => unsub();
  }, [cryptoInvoice?.requestId]);

  // --- Change Password ---
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setPasswordError(lang === 'FR' ? 'Le mot de passe doit faire au moins 6 caractères.' : 'Mo de pas la dwe gen omwen 6 karaktè.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(lang === 'FR' ? 'Les mots de passe ne correspondent pas.' : 'Mo de pas yo pa koresponn.');
      return;
    }
    setChangingPassword(true);
    setPasswordError(null);
    try {
      await updatePassword(user, newPassword);
      setPasswordSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setPasswordSuccess(false);
        setPasswordModalOpen(false);
      }, 3000);
    } catch (err: any) {
      console.error(err);
      setPasswordError(err.message || 'Error updating password.');
    } finally {
      setChangingPassword(false);
    }
  };

  // --- Toggle Notifications State ---
  const toggleNotifications = () => {
    setNotificationsEnabled(!notificationsEnabled);
    setNotifToast(true);
    setTimeout(() => setNotifToast(false), 3000);
  };

  // --- Filters Operations ---
  const filteredTransactions = transactions.filter(tx => {
    // 1. Date Filter
    if (filterDateSelected !== 'all') {
      const txDate = new Date(tx.createdAt);
      const now = new Date();
      if (filterDateSelected === 'today') {
        if (txDate.toDateString() !== now.toDateString()) return false;
      } else if (filterDateSelected === 'week') {
        const diffTime = Math.abs(now.getTime() - txDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 7) return false;
      } else if (filterDateSelected === 'month') {
        if (txDate.getMonth() !== now.getMonth() || txDate.getFullYear() !== now.getFullYear()) return false;
      }
    }

    // 2. Game Filter (e.g. Wallet vs Spend)
    if (filterGameSelected !== 'all') {
      if (filterGameSelected === 'deposit' && tx.type !== 'deposit') return false;
      if (filterGameSelected === 'spend' && tx.type !== 'spend') return false;
    }

    // 3. Payment Method Filter
    if (filterPaymentSelected !== 'all') {
      if (tx.paymentMethod !== filterPaymentSelected) return false;
    }

    // 4. Status Filter
    if (filterStatusSelected !== 'all') {
      if (tx.status !== filterStatusSelected) return false;
    }

    return true;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 animate-fadeIn text-left text-white bg-[#0c0714] min-h-screen">
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        
        {/* ==========================================
            LEFT COLUMN: PROFILE CARD & LOYALTY CARD
            ========================================== */}
        <div className="w-full lg:w-1/3 flex flex-col gap-6">
          
          {/* Main User Card */}
          <div className="bg-[#1c1030] border border-white/[0.08] rounded-3xl p-6 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-36 h-36 bg-gradient-to-br from-[#a855f7]/10 to-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
            
            {/* Avatar & Photo Upload */}
            <div className="flex flex-col items-center text-center">
              <div className="relative group mb-4">
                <div className="w-24 h-24 rounded-2xl overflow-hidden bg-gradient-to-tr from-[#a855f7] to-orange-500 flex items-center justify-center p-0.5 shadow-xl relative">
                  {uploadProgress ? (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                  ) : null}
                  {user.photoURL ? (
                    <img 
                      src={user.photoURL} 
                      alt={dbUser.fullName || 'Avatar'} 
                      className="w-full h-full object-cover rounded-[14px]" 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full rounded-[14px] bg-[#0c0714] flex items-center justify-center">
                      <span className="text-3xl font-black text-[#a855f7]">
                        {(dbUser.fullName || user.email || 'U').charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-1 right-1 bg-[#a855f7] hover:bg-orange-500 text-black p-1.5 rounded-lg shadow-md transition-all scale-95 hover:scale-105 active:scale-95"
                  title={t.changeAvatar}
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                />
              </div>

              {/* Badges and Names */}
              <div className="flex items-center gap-1.5 justify-center">
                <h2 className="text-xl font-black tracking-tight text-white">
                  {dbUser.fullName || user.displayName || user.email?.split('@')[0]}
                </h2>
                <div className="bg-orange-500/10 text-[#a855f7] p-1 rounded-md" title={t.verifiedUser}>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
              </div>
              
              <p className="text-xs text-white/50 font-bold mt-1 tracking-tight">
                @{user.email?.split('@')[0] || 'gamer'}
              </p>

              {/* Accès back-office (admin) — point d'entrée mobile ET desktop (la Sidebar
                  desktop l'a aussi, mais sur mobile c'est le SEUL accès). */}
              {isAdminClaim && (
                <button
                  onClick={() => navigateToPage('admin')}
                  className="mt-4 w-full flex items-center justify-center gap-2 bg-[#a855f7] hover:bg-[#b56ff5] text-black font-black uppercase tracking-wider text-xs rounded-xl py-3 transition-colors"
                >
                  <LayoutDashboard className="w-4 h-4" /> Ouvrir le back-office
                </button>
              )}

              <div className="mt-4 flex flex-col gap-2 w-full text-xs font-semibold text-white/60 bg-black/25 rounded-2xl p-3 border border-white/[0.04]">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-white/40">
                    <Mail className="w-3.5 h-3.5" /> Email
                  </span>
                  <span className="text-white font-medium select-all truncate max-w-[160px]">{user.email}</span>
                </div>
                {dbUser.phoneNumber && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-white/40">
                      <Phone className="w-3.5 h-3.5" /> WhatsApp
                    </span>
                    <span className="text-white font-medium">{dbUser.phoneNumber}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-white/[0.05] pt-2 mt-1">
                  <span className="flex items-center gap-1.5 text-white/40">
                    <Clock className="w-3.5 h-3.5" /> ID Joueur
                  </span>
                  <span className="text-[#a855f7] font-mono text-[10px] select-all uppercase font-black">{user.uid.substring(0, 10)}...</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/40">Membre depuis</span>
                  <span className="text-white font-bold">{dbUser.memberSince || 'Juin 2026'}</span>
                </div>
              </div>

              {/* Loyalty Level Badge */}
              <div className="mt-5 pt-4 border-t border-white/[0.06] w-full flex flex-col items-center">
                <span className={`text-xs font-black uppercase tracking-wider px-3.5 py-1.5 rounded-full ${loyalty.bg} ${loyalty.color} flex items-center gap-1.5 shadow-md`}>
                  <Award className="w-4 h-4" />
                  {lang === 'FR' ? loyalty.nameFR : loyalty.nameHT}
                </span>
              </div>
            </div>
          </div>

          {/* Loyalty Points Progress Box */}
          <div className="bg-[#1c1030] border border-white/[0.08] rounded-3xl p-6 relative overflow-hidden shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2.5 bg-[#a855f7]/10 rounded-xl text-[#a855f7]">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-white/40 uppercase tracking-widest leading-none">
                    Points Fidélité
                  </h3>
                  <p className="text-2xl font-black text-white mt-1 tabular-nums">
                    {thieThiePoints} <span className="text-xs text-[#a855f7]">PTS</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Level progress bar */}
            <div>
              <div className="flex justify-between text-[10px] text-white/50 font-black mb-1.5 uppercase tracking-wide">
                <span>{lang === 'FR' ? loyalty.nameFR : loyalty.nameHT}</span>
                {thieThiePoints < 2500 ? (
                  <span>
                    {thieThiePoints} / {thieThiePoints < 250 ? 250 : thieThiePoints < 1000 ? 1000 : 2500} PTS
                  </span>
                ) : (
                  <span>Niveau MAX</span>
                )}
              </div>
              <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full bg-gradient-to-r from-[#a855f7] to-orange-500 transition-all duration-500"
                  style={{ 
                    width: `${
                      thieThiePoints < 250 
                        ? (thieThiePoints / 250) * 100 
                        : thieThiePoints < 1000 
                          ? ((thieThiePoints - 250) / 750) * 100 
                          : thieThiePoints < 2500 
                            ? ((thieThiePoints - 1000) / 1500) * 100 
                            : 100
                    }%` 
                  }}
                />
              </div>
            </div>

            <button
              onClick={() => navigateToPage('home')}
              className="w-full py-3 bg-white/[0.03] hover:bg-[#a855f7] hover:text-black border border-white/[0.08] hover:border-transparent text-white text-xs font-black rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>{t.shopCTA}</span>
            </button>
          </div>

        </div>

        {/* ==========================================
            RIGHT COLUMN: WALLET, STATS, ACTIONS & SETTINGS
            ========================================== */}
        <div className="w-full lg:w-2/3 flex flex-col gap-6">
          
          {/* ==========================================
              WALLET SECTION
              ========================================== */}
          <div className="bg-[#1c1030] border border-white/[0.08] rounded-3xl p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-[#a855f7]/10 to-transparent rounded-full blur-3xl pointer-events-none"></div>
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div>
                <h3 className="text-xs font-black text-white/40 uppercase tracking-widest">
                  {t.walletBalance}
                </h3>
                <p className="text-3xl md:text-4xl font-black text-white mt-1 select-all font-sans tabular-nums">
                  {formatHTG(walletBalanceHtg)}
                </p>
              </div>

              <div className="flex items-center gap-2.5 w-full md:w-auto">
                <button
                  onClick={() => setAddFundsOpen(true)}
                  className="flex-1 md:flex-none px-5 py-3.5 bg-[#a855f7] hover:bg-orange-500 text-black font-black text-xs rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#a855f7]/10"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>{t.addFunds}</span>
                </button>

                <button
                  onClick={() => setWithdrawAlertOpen(true)}
                  className="flex-1 md:flex-none px-5 py-3.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white font-black text-xs rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Coins className="w-4 h-4" />
                  <span>{t.withdraw}</span>
                </button>
              </div>
            </div>

            {/* Wallet Quick Stats */}
            <div className="grid grid-cols-3 gap-3 bg-black/20 rounded-2xl p-4 border border-white/[0.04] text-xs">
              <div className="flex flex-col">
                <span className="text-white/40 font-bold mb-1">{t.totalAdded}</span>
                <span className="text-emerald-400 font-extrabold text-sm select-all tabular-nums">
                  +{formatHTG(totalWalletAdded)}
                </span>
              </div>
              <div className="flex flex-col border-l border-white/[0.06] pl-4">
                <span className="text-white/40 font-bold mb-1">{t.totalSpent}</span>
                <span className="text-orange-400 font-extrabold text-sm select-all tabular-nums">
                  -{formatHTG(totalWalletSpent)}
                </span>
              </div>
              <div className="flex flex-col border-l border-white/[0.06] pl-4">
                <span className="text-white/40 font-bold mb-1">Actuel (HTG)</span>
                <span className="text-[#a855f7] font-black text-sm select-all tabular-nums">
                  {formatHTG(walletBalanceHtg)}
                </span>
              </div>
            </div>
          </div>

          {/* ==========================================
              KYC — DÉBLOQUE LA RECHARGE CRYPTO
              ========================================== */}
          <div className="bg-[#1c1030] border border-white/[0.08] rounded-3xl p-5 shadow-2xl flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${
                kycStatus === 'approved' ? 'bg-emerald-500/10 text-emerald-400'
                : kycStatus === 'pending' ? 'bg-[#a855f7]/10 text-[#a855f7]'
                : kycStatus === 'rejected' ? 'bg-red-500/10 text-red-400'
                : 'bg-white/[0.04] text-white/40'
              }`}>
                <UserCheck className="w-4 h-4 stroke-[2]" />
              </div>
              <div className="text-left">
                <h3 className="text-xs font-black text-white">Vérification d'identité (KYC)</h3>
                <p className="text-[10px] text-white/40 font-semibold mt-0.5">
                  {kycStatus === 'approved' && "Identité vérifiée — recharge crypto débloquée."}
                  {kycStatus === 'pending' && "Demande en cours de revue par notre équipe."}
                  {kycStatus === 'rejected' && "Demande refusée — vous pouvez soumettre à nouveau."}
                  {kycStatus === 'none' && "Requise pour débloquer la recharge par crypto (USDT)."}
                </p>
              </div>
            </div>

            {kycStatus === 'approved' ? (
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" /> Vérifié
              </span>
            ) : kycStatus === 'pending' ? (
              <span className="bg-[#a855f7]/10 text-[#a855f7] border border-[#a855f7]/20 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase">
                En attente
              </span>
            ) : (
              <button
                onClick={() => setKycModalOpen(true)}
                className="px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white font-black text-[10px] uppercase rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                {kycStatus === 'rejected' ? 'Soumettre à nouveau' : 'Vérifier mon identité'}
              </button>
            )}
          </div>

          {/* ==========================================
              LIVE NOTIFICATIONS & ACTIVITY CENTER
              ========================================== */}
          <div className="bg-[#1c1030] border border-white/[0.08] rounded-3xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#a855f7]" />
                Centre d'Activités & Notifications
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="bg-red-500 text-white font-black text-[9px] px-1.5 py-0.5 rounded-full">
                    {notifications.filter(n => !n.read).length} NEW
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-3">
                {pushStatus !== 'enabled' && (
                  <button
                    type="button"
                    disabled={pushStatus === 'loading'}
                    onClick={async () => {
                      setPushStatus('loading');
                      setPushError(null);
                      const res = await enablePushNotifications(user.uid);
                      if (res.ok === true) {
                        setPushStatus('enabled');
                        return;
                      }
                      setPushStatus('error');
                      const reason: string = (res as { reason: string }).reason;
                      const detail: string | undefined = (res as { error?: string }).error;
                      setPushError(
                        reason === 'no-vapid-key'
                          ? "Pas encore configuré côté projet Firebase."
                          : reason === 'denied'
                          ? "Permission refusée dans le navigateur."
                          : reason === 'unsupported'
                          ? "Non pris en charge par ce navigateur."
                          : detail || "Échec inconnu.",
                      );
                    }}
                    className="text-[9px] font-black uppercase tracking-wider text-[#a855f7] hover:text-white border border-[#a855f7]/25 hover:border-[#a855f7] rounded-lg px-2.5 py-1.5 transition-all disabled:opacity-40 cursor-pointer"
                  >
                    {pushStatus === 'loading' ? 'Activation…' : 'Activer les notifications'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="text-white/40 hover:text-[#a855f7] text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer"
                >
                  {showNotifications ? "Masquer" : "Afficher"}
                  <ChevronDown className={`w-3.5 h-3.5 transition-all ${showNotifications ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>
            {pushStatus === 'error' && pushError && (
              <p className="text-[10px] text-red-400 font-semibold -mt-2">{pushError}</p>
            )}
            {pushStatus === 'enabled' && (
              <p className="text-[10px] text-emerald-400 font-semibold -mt-2">Notifications push activées sur cet appareil.</p>
            )}

            <AnimatePresence>
              {showNotifications && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden flex flex-col gap-2.5"
                >
                  {notifications.length === 0 ? (
                    <div className="py-6 text-center border border-white/[0.04] rounded-2xl bg-black/10">
                      <BellOff className="w-6 h-6 text-white/10 mx-auto mb-2" />
                      <p className="text-[10px] text-white/40 font-bold">AUCUNE NOTIFICATION ACTUELLE</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
                      {notifications.map((notif) => (
                        <div
                          key={notif.id}
                          onClick={async () => {
                            if (!notif.read) {
                              const notifRef = doc(db, 'notifications', notif.id);
                              await updateDoc(notifRef, { read: true });
                            }
                          }}
                          className={`p-3 rounded-xl border transition-all text-left flex items-start gap-2.5 cursor-pointer ${
                            notif.read
                              ? 'bg-black/15 border-white/[0.03] text-white/50'
                              : 'bg-gradient-to-r from-[#a855f7]/5 to-transparent border-[#a855f7]/25 text-white shadow-sm hover:from-[#a855f7]/10'
                          }`}
                        >
                          <div className={`p-1.5 rounded-lg mt-0.5 ${notif.read ? 'bg-white/5 text-white/30' : 'bg-[#a855f7]/10 text-[#a855f7]'}`}>
                            <Sparkles className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-black text-[11px] truncate">{notif.title}</span>
                              <span className="text-[8px] text-white/30 font-mono font-medium whitespace-nowrap">
                                {notif.createdAt ? new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Maintenant'}
                              </span>
                            </div>
                            <p className="text-[10px] font-medium leading-relaxed mt-0.5">{notif.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ==========================================
              ADMIN WORKFLOW: PENDING DEPOSIT REQUESTS
              ========================================== */}
          {isAdminClaim && (
            <div className="bg-[#1c1030] border border-[#a855f7]/30 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#a855f7]/5 to-transparent rounded-full blur-2xl pointer-events-none"></div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-[#a855f7]/10 text-[#a855f7] rounded-xl">
                    <Shield className="w-4 h-4 stroke-[2]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white">Validation Administrative Portefeuille</h3>
                    <p className="text-[9px] text-white/40 font-bold uppercase tracking-wider">Thie Thie Services Admin Panel</p>
                  </div>
                </div>
                <span className="bg-orange-500/10 text-[#a855f7] border border-orange-500/20 px-2 py-0.5 rounded-md text-[9px] font-black uppercase">
                  {walletRequests.filter(r => r.status === 'Pending Verification').length} PENDING
                </span>
              </div>

              {walletRequests.filter(r => r.status === 'Pending Verification').length === 0 ? (
                <div className="py-8 border border-white/[0.04] rounded-2xl flex flex-col items-center text-center px-4 bg-black/10">
                  <Inbox className="w-8 h-8 text-white/10 mb-2" />
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Aucune demande en attente</p>
                  <p className="text-[9px] text-white/30 font-medium mt-0.5">Tous les dépôts ont été validés ou refusés.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {walletRequests.filter(r => r.status === 'Pending Verification').map((req) => (
                    <div 
                      key={req.requestId}
                      className="bg-[#0c0714] border border-white/[0.05] rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-white/15 transition-all"
                    >
                      <div className="flex-1 min-w-0 flex flex-col gap-1 text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-xs text-white select-all">Demande {req.requestId}</span>
                          <span className="bg-white/5 border border-white/10 px-2 py-0.5 rounded text-[9px] text-[#a855f7] font-black uppercase tracking-wider">
                            {req.paymentMethod}
                          </span>
                        </div>
                        <p className="text-[10px] text-white/40 font-semibold select-all truncate">Utilisateur: {req.uid}</p>
                        <div className="grid grid-cols-2 gap-2 mt-1 text-[10px]">
                          <div>
                            <span className="text-white/30 block text-[9px] font-bold">RÉFÉRENCE SENDER</span>
                            <span className="text-white font-mono font-bold select-all">{req.transactionReference}</span>
                          </div>
                          <div>
                            <span className="text-white/30 block text-[9px] font-bold">MONTANT</span>
                            <span className="text-emerald-400 font-extrabold text-xs font-sans">{formatHTG(req.amount)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-2 md:mt-0">
                        {req.screenshotURL && req.screenshotURL !== 'N/A' && (
                          <button
                            type="button"
                            onClick={() => setSelectedRequest(req)}
                            className="px-3 py-2 bg-white/[0.03] hover:bg-white/[0.08] text-white/70 border border-white/[0.06] hover:border-white/10 text-[10px] font-black rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Voir Preuve</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleApproveDeposit(req)}
                          className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-black text-[10px] font-black rounded-xl transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Approuver</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectDeposit(req)}
                          className="px-3.5 py-2 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/20 text-[10px] font-black rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Refuser</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ==========================================
              ADMIN WORKFLOW: PENDING KYC REQUESTS
              ========================================== */}
          {isAdminClaim && (
            <div className="bg-[#1c1030] border border-[#a855f7]/30 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#a855f7]/5 to-transparent rounded-full blur-2xl pointer-events-none"></div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-[#a855f7]/10 text-[#a855f7] rounded-xl">
                    <UserCheck className="w-4 h-4 stroke-[2]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white">Validation KYC</h3>
                    <p className="text-[9px] text-white/40 font-bold uppercase tracking-wider">Débloque la recharge crypto du client</p>
                  </div>
                </div>
                <span className="bg-orange-500/10 text-[#a855f7] border border-orange-500/20 px-2 py-0.5 rounded-md text-[9px] font-black uppercase">
                  {pendingKycRequests.filter(r => r.status === 'pending').length} PENDING
                </span>
              </div>

              {pendingKycRequests.filter(r => r.status === 'pending').length === 0 ? (
                <div className="py-8 border border-white/[0.04] rounded-2xl flex flex-col items-center text-center px-4 bg-black/10">
                  <Inbox className="w-8 h-8 text-white/10 mb-2" />
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Aucune demande en attente</p>
                  <p className="text-[9px] text-white/30 font-medium mt-0.5">Toutes les demandes KYC ont été traitées.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {pendingKycRequests.filter(r => r.status === 'pending').map((req) => (
                    <div
                      key={req.requestId}
                      className="bg-[#0c0714] border border-white/[0.05] rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-white/15 transition-all"
                    >
                      <div className="flex-1 min-w-0 flex flex-col gap-1 text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-xs text-white select-all">Demande {req.requestId}</span>
                          <span className="bg-white/5 border border-white/10 px-2 py-0.5 rounded text-[9px] text-[#a855f7] font-black uppercase tracking-wider">
                            KYC
                          </span>
                        </div>
                        <p className="text-[10px] text-white/40 font-semibold select-all truncate">Utilisateur: {req.uid}</p>
                        <p className="text-[10px] text-white font-bold mt-0.5">{req.fullName}</p>
                      </div>

                      <div className="flex items-center gap-2 mt-2 md:mt-0">
                        <button
                          type="button"
                          onClick={() => setSelectedKycRequest(req)}
                          className="px-3 py-2 bg-white/[0.03] hover:bg-white/[0.08] text-white/70 border border-white/[0.06] hover:border-white/10 text-[10px] font-black rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Voir Pièces</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproveKyc(req)}
                          disabled={submittingKycReview}
                          className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-black text-[10px] font-black rounded-xl transition-all flex items-center gap-1 shadow-sm cursor-pointer disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Approuver</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectKyc(req)}
                          disabled={submittingKycReview}
                          className="px-3.5 py-2 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/20 text-[10px] font-black rounded-xl transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Refuser</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ==========================================
              STATISTICS SECTION
              ========================================== */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            
            {/* Stat 1: Total Orders */}
            <div className="bg-[#1c1030] border border-white/[0.08] rounded-2xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-blue-500/10 to-transparent rounded-full blur-xl pointer-events-none"></div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-white/40 font-black uppercase tracking-wider">{t.statTotalOrders}</span>
                <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                  <ShoppingBag className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-black text-white tabular-nums">{totalOrdersCount}</p>
                <p className="text-[10px] text-white/30 font-medium mt-0.5">Commandes passées</p>
              </div>
            </div>

            {/* Stat 2: Completed Orders */}
            <div className="bg-[#1c1030] border border-white/[0.08] rounded-2xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-full blur-xl pointer-events-none"></div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-white/40 font-black uppercase tracking-wider">{t.statCompletedOrders}</span>
                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                  <Check className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-black text-emerald-400 tabular-nums">{completedOrdersCount}</p>
                <p className="text-[10px] text-white/30 font-medium mt-0.5">Livraisons confirmées</p>
              </div>
            </div>

            {/* Stat 3: Pending Orders */}
            <div className="bg-[#1c1030] border border-white/[0.08] rounded-2xl p-4 flex flex-col justify-between shadow-lg col-span-2 sm:col-span-1 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-[#a855f7]/10 to-transparent rounded-full blur-xl pointer-events-none"></div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-white/40 font-black uppercase tracking-wider">{t.statPendingOrders}</span>
                <div className="p-2 bg-[#a855f7]/10 text-[#a855f7] rounded-lg">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-black text-[#a855f7] tabular-nums">{pendingOrdersCount}</p>
                <p className="text-[10px] text-white/30 font-medium mt-0.5">En cours de traitement</p>
              </div>
            </div>

            {/* Stat 4: Favorite Game */}
            <div className="bg-[#1c1030] border border-white/[0.08] rounded-2xl p-4 flex flex-col justify-between shadow-lg col-span-2 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-purple-500/10 to-transparent rounded-full blur-xl pointer-events-none"></div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-white/40 font-black uppercase tracking-wider">{t.statFavGame}</span>
                <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg">
                  <Star className="w-4 h-4 fill-current" />
                </div>
              </div>
              <div>
                <p className="text-lg font-black text-white truncate max-w-[280px]">{favoriteGame}</p>
                <p className="text-[10px] text-white/30 font-medium mt-0.5">Le jeu le plus acheté</p>
              </div>
            </div>

            {/* Stat 5: Points Level */}
            <div className="bg-[#1c1030] border border-white/[0.08] rounded-2xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-orange-500/10 to-transparent rounded-full blur-xl pointer-events-none"></div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-white/40 font-black uppercase tracking-wider">Level</span>
                <div className="p-2 bg-orange-500/10 text-orange-400 rounded-lg">
                  <Award className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className="text-md font-black text-[#a855f7] truncate">
                  {lang === 'FR' ? loyalty.nameFR.split(' ')[0] : loyalty.nameHT.split(' ')[0]}
                </p>
                <p className="text-[10px] text-white/30 font-medium mt-0.5">Rang de Fidélité</p>
              </div>
            </div>

          </div>

          {/* ==========================================
              TRANSACTION HISTORY SECTION
              ========================================== */}
          <div className="bg-[#1c1030] border border-white/[0.08] rounded-3xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#a855f7]" />
                {t.transactionsTitle}
              </h3>
              
              {/* Dynamic Quick Filters */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <select
                  value={filterDateSelected}
                  onChange={(e) => setFilterDateSelected(e.target.value as any)}
                  className="bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-white px-2 py-1.5 rounded-lg text-xs font-semibold focus:outline-none"
                >
                  <option value="all">Toutes les dates</option>
                  <option value="today">Aujourd'hui</option>
                  <option value="week">Cette semaine</option>
                  <option value="month">Ce mois-ci</option>
                </select>

                <select
                  value={filterGameSelected}
                  onChange={(e) => setFilterGameSelected(e.target.value)}
                  className="bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-white px-2 py-1.5 rounded-lg text-xs font-semibold focus:outline-none"
                >
                  <option value="all">Tous types</option>
                  <option value="deposit">Dépôts (+)</option>
                  <option value="spend">Dépenses (-)</option>
                </select>

                <select
                  value={filterStatusSelected}
                  onChange={(e) => setFilterStatusSelected(e.target.value)}
                  className="bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-white px-2 py-1.5 rounded-lg text-xs font-semibold focus:outline-none"
                >
                  <option value="all">Tous statuts</option>
                  <option value="pending">En attente</option>
                  <option value="completed">Complété</option>
                  <option value="rejected">Rejeté</option>
                </select>
              </div>
            </div>

            {filteredTransactions.length === 0 ? (
              <div className="py-10 border border-white/[0.04] rounded-2xl flex flex-col items-center text-center px-4 bg-[#0c0714]/30">
                <TrendingUp className="w-8 h-8 text-white/10 mb-3" />
                <p className="text-xs text-white/50 leading-relaxed max-w-sm">
                  Aucune transaction ne correspond à vos filtres.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-white/[0.06] rounded-2xl bg-black/10">
                <table className="w-full text-left text-xs min-w-[550px]">
                  <thead>
                    <tr className="bg-[#0c0714] border-b border-white/[0.06] text-white/40 uppercase font-black tracking-widest text-[9px] select-none">
                      <th className="py-3 px-4">Transaction ID</th>
                      <th className="py-3 px-4">Date & Heure</th>
                      <th className="py-3 px-4">Type / Produit</th>
                      <th className="py-3 px-4">Moyen</th>
                      <th className="py-3 px-4">Montant</th>
                      <th className="py-3 px-4">Statut</th>
                      <th className="py-3 px-4 text-right">Actions (Demo)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04] text-white/80 font-semibold">
                    {filteredTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-white/[0.01] transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-white/50 text-[10px]">
                          {tx.transactionId || tx.id}
                        </td>
                        <td className="py-3 px-4 text-white/50 font-medium">
                          {tx.createdAt ? new Date(tx.createdAt).toLocaleString(lang === 'FR' ? 'fr-FR' : 'en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          }) : 'Aujourd\'hui'}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded mr-1.5 ${
                            tx.type === 'deposit' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-orange-500/10 text-orange-400'
                          }`}>
                            {tx.type === 'deposit' ? 'DEP' : 'DEPENSE'}
                          </span>
                          <span className="text-white text-xs font-black">{tx.type === 'deposit' ? 'Dépôt Portefeuille' : (tx.productName || 'Achat Jeu')}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded text-[10px] font-bold text-white/70">
                            {tx.paymentMethod}
                          </span>
                        </td>
                        <td className={`py-3 px-4 font-black ${
                          tx.type === 'deposit' ? 'text-emerald-400' : 'text-orange-400'
                        }`}>
                          {tx.type === 'deposit' ? '+' : '-'}{formatHTG(tx.amount)}
                        </td>
                        <td className="py-3 px-4">
                          {tx.status?.toLowerCase() === 'completed' ? (
                            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 w-fit">
                              <Check className="w-3 h-3" />
                              Succès
                            </span>
                          ) : tx.status?.toLowerCase() === 'rejected' ? (
                            <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 w-fit">
                              <X className="w-3 h-3" />
                              Rejeté
                            </span>
                          ) : (
                            <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 w-fit animate-pulse">
                              <Clock className="w-3 h-3 text-amber-400" />
                              En cours
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {tx.status?.toLowerCase() === 'pending' && (
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => handleApproveDeposit(tx)}
                                className="bg-emerald-500 hover:bg-emerald-600 text-black font-black text-[9px] px-2 py-1 rounded transition-colors"
                              >
                                {t.simulatedApproval}
                              </button>
                              <button
                                onClick={() => handleRejectDeposit(tx)}
                                className="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 text-[9px] px-2 py-1 rounded transition-all"
                              >
                                Rejeter
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ==========================================
              ORDER HISTORY SECTION (Cards Design)
              ========================================== */}
          <div className="bg-[#1c1030] border border-white/[0.08] rounded-3xl p-6 shadow-2xl flex flex-col gap-4">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-[#a855f7]" />
              {t.orderHistory}
            </h3>

            {ordersLoading ? (
              <SkeletonList rows={3} />
            ) : orders.length === 0 ? (
              <div className="py-12 border border-white/[0.04] rounded-2xl flex flex-col items-center text-center px-4 bg-[#0c0714]/30">
                <ShoppingBag className="w-8 h-8 text-white/10 mb-3" />
                <p className="text-xs text-white/50 leading-relaxed max-w-sm">
                  {t.noOrders}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {orders.map((order) => (
                  <div key={order.id} className="bg-black/20 border border-white/[0.05] hover:border-white/15 rounded-2xl p-4 flex flex-col gap-3.5 transition-all hover:scale-[1.01]">
                    <div className="flex gap-4">
                      <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-[#0c0714] border border-white/[0.08]">
                        <img 
                          src={getGameImage(order.productName || order.game)} 
                          alt="Game image" 
                          className="w-full h-full object-cover"
                        />
                      </div>
                      
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start gap-2">
                            <h4 className="text-xs font-black text-white truncate leading-tight">
                              {order.productName || order.game || 'Produit'}
                            </h4>
                            <span className="text-[10px] font-bold text-white/40 font-mono">
                              {order.orderId || order.id?.substring(0, 8)}
                            </span>
                          </div>
                          <p className="text-[10px] text-[#a855f7] font-black mt-0.5 uppercase tracking-wide">
                            {order.amount || order.product || 'Standard'}
                          </p>
                          {(order.freeFirePlayerId || order.playerUID || order.playerId) && (
                            <p className="text-[9px] text-white/40 font-bold mt-1">
                              Player ID: <strong className="text-[#a855f7] font-mono">{order.freeFirePlayerId || order.playerUID || order.playerId}</strong>
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between border-t border-white/[0.04] pt-2 mt-2">
                          <span className="text-xs font-black text-[#a855f7]">
                            {order.priceUSD ? `${(order.priceUSD * 145).toLocaleString()} HTG` : (order.amount || '—')}
                          </span>
                          
                          {order.status === 'completed' || order.status === 'Delivered' || order.status === 'Completed' ? (
                            <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                              <Check className="w-2.5 h-2.5" />
                              {t.completed}
                            </span>
                          ) : order.status === 'failed' || order.status === 'cancelled' || order.status === 'rejected' || order.status === 'Failed' ? (
                            <span className="bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                              <X className="w-2.5 h-2.5" />
                              {t.failed}
                            </span>
                          ) : (
                            <span className="bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              {t.pending}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ADMIN : livraison du code par e-mail */}
                    {isAdminClaim && (
                      (order.fulfilledAt || order.deliveryCode) ? (
                        <div className="text-[9px] font-bold text-emerald-400/80 bg-emerald-500/5 rounded-lg px-2.5 py-1.5">
                          Code livré{order.emailSent === false ? ' — e-mail NON envoyé (à renvoyer)' : ' et envoyé par e-mail'}
                        </div>
                      ) : (
                        <button
                          onClick={() => { setFulfillTarget(order); setFulfillCode(''); setFulfillInstructions(''); setFulfillMsg(null); }}
                          className="text-[10px] font-black uppercase tracking-wider bg-[#a855f7] hover:bg-[#b56ff5] text-black rounded-lg px-3 py-1.5 transition-colors"
                        >
                          Livrer le code
                        </button>
                      )
                    )}

                    {/* DYNAMIC PROGRESS TIMELINE TRACKER */}
                    {(() => {
                      const norm = (order.status || '').toLowerCase();
                      const isCompleted = norm === 'completed' || norm === 'delivered';
                      const isFailed = norm === 'failed' || norm === 'cancelled' || norm === 'rejected';
                      
                      const steps = [
                        {
                          id: 1,
                          labelFR: 'Reçu',
                          labelHT: 'Voye',
                          descFR: 'Commande reçue',
                          descHT: 'Kòmande anrejistre',
                          state: 'done',
                          icon: FileText
                        },
                        {
                          id: 2,
                          labelFR: 'Vérification',
                          labelHT: 'Verifikasyon',
                          descFR: isCompleted ? 'Paiement vérifié' : isFailed ? 'Vérification échouée' : 'Vérification en cours',
                          descHT: isCompleted ? 'Peman verifye' : isFailed ? 'Verifikasyon echwe' : 'N ap verifye peman an',
                          state: isCompleted ? 'done' : isFailed ? 'failed' : 'active',
                          icon: Clock
                        },
                        {
                          id: 3,
                          labelFR: 'Livraison',
                          labelHT: 'Livrezon',
                          descFR: isCompleted ? 'Recharge effectuée' : isFailed ? 'Commande annulée' : 'Attente de livraison',
                          descHT: isCompleted ? 'Kredi voye' : isFailed ? 'Kòmande anile' : 'En espere livrezon',
                          state: isCompleted ? 'done' : isFailed ? 'failed' : 'waiting',
                          icon: CheckCircle
                        }
                      ];

                      return (
                        <div className="mt-2 pt-3 border-t border-white/[0.04] flex flex-col gap-2">
                          <div className="flex items-center justify-between text-[9px] font-mono tracking-wider text-white/30 uppercase">
                            <span>{lang === 'FR' ? 'Suivi de commande' : 'Swiv kòmande'}</span>
                            <span className="text-[#a855f7] font-black">
                              {isCompleted ? '100%' : isFailed ? '0%' : '50%'}
                            </span>
                          </div>

                          <div className="relative flex items-center justify-between mt-1 px-2">
                            {/* Line separator bar background */}
                            <div className="absolute left-6 right-6 top-[15px] h-[2px] bg-white/[0.05] -z-10 rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all duration-500 rounded-full ${
                                  isCompleted 
                                    ? 'w-full bg-gradient-to-r from-emerald-500 to-emerald-400' 
                                    : isFailed 
                                    ? 'w-1/2 bg-gradient-to-r from-emerald-500 to-red-500' 
                                    : 'w-1/2 bg-gradient-to-r from-emerald-500 to-[#a855f7]'
                                }`}
                              />
                            </div>

                            {steps.map((step) => {
                              const StepIcon = step.icon;
                              let bgClass = '';
                              let borderClass = '';
                              let textClass = '';
                              let iconClass = '';

                              if (step.state === 'done') {
                                bgClass = 'bg-emerald-500/10';
                                borderClass = 'border-emerald-500/40';
                                textClass = 'text-emerald-400';
                                iconClass = 'text-emerald-400';
                              } else if (step.state === 'active') {
                                bgClass = 'bg-[#a855f7]/10 animate-pulse';
                                borderClass = 'border-[#a855f7]/50';
                                textClass = 'text-[#a855f7]';
                                iconClass = 'text-[#a855f7]';
                              } else if (step.state === 'failed') {
                                bgClass = 'bg-red-500/10';
                                borderClass = 'border-red-500/40';
                                textClass = 'text-red-400';
                                iconClass = 'text-red-400';
                              } else {
                                bgClass = 'bg-[#101524]';
                                borderClass = 'border-white/[0.06]';
                                textClass = 'text-white/40';
                                iconClass = 'text-white/20';
                              }

                              return (
                                <div key={step.id} className="flex flex-col items-center text-center relative z-10 w-1/3">
                                  <div className={`w-8 h-8 rounded-full border ${bgClass} ${borderClass} flex items-center justify-center transition-all shadow-md`}>
                                    <StepIcon className={`w-4 h-4 ${iconClass}`} />
                                  </div>
                                  <span className={`text-[10px] font-black mt-1.5 leading-none ${textClass}`}>
                                    {lang === 'FR' ? step.labelFR : step.labelHT}
                                  </span>
                                  <span className="text-[8px] text-white/30 font-bold mt-0.5 leading-none max-w-[80px] truncate" title={lang === 'FR' ? step.descFR : step.descHT}>
                                    {lang === 'FR' ? step.descFR : step.descHT}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* DEMO SIMULATOR INTERACTIVE BAR */}
                    {order.orderId?.startsWith('DEMO-') && (
                      <div className="mt-3.5 p-2 bg-[#0c0714]/60 rounded-2xl border border-white/[0.04] flex flex-col gap-2">
                        <div className="flex items-center justify-between text-[8px] font-bold text-white/40 uppercase tracking-widest">
                          <span className="flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5 text-[#a855f7]" />
                            {lang === 'FR' ? 'Simulateur (Temps Réel)' : 'Similatè (Tan Reyèl)'}
                          </span>
                          <button
                            onClick={async () => {
                              try {
                                await deleteDoc(doc(db, 'orders', order.id));
                              } catch (err) {
                                console.error(err);
                              }
                            }}
                            className="text-[8px] text-red-400 hover:text-red-300 font-extrabold flex items-center gap-0.5 cursor-pointer"
                          >
                            <X className="w-2 h-2" />
                            <span>{lang === 'FR' ? 'Supprimer' : 'Efase'}</span>
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <button
                            onClick={async () => {
                              await updateDoc(doc(db, 'orders', order.id), { status: 'Pending Verification' });
                            }}
                            className={`py-1 text-[8px] font-black rounded-lg transition-all cursor-pointer ${
                              order.status === 'Pending Verification'
                                ? 'bg-[#a855f7] text-black shadow'
                                : 'bg-white/[0.03] text-white/60 hover:text-white hover:bg-white/[0.06]'
                            }`}
                          >
                            Verification
                          </button>
                          <button
                            onClick={async () => {
                              await updateDoc(doc(db, 'orders', order.id), { status: 'Completed' });
                            }}
                            className={`py-1 text-[8px] font-black rounded-lg transition-all cursor-pointer ${
                              order.status === 'Completed' || order.status === 'completed' || order.status === 'Delivered'
                                ? 'bg-emerald-500 text-black shadow'
                                : 'bg-white/[0.03] text-white/60 hover:text-white hover:bg-white/[0.06]'
                            }`}
                          >
                            Livré
                          </button>
                          <button
                            onClick={async () => {
                              await updateDoc(doc(db, 'orders', order.id), { status: 'Failed' });
                            }}
                            className={`py-1 text-[8px] font-black rounded-lg transition-all cursor-pointer ${
                              order.status === 'Failed' || order.status === 'failed' || order.status === 'cancelled' || order.status === 'rejected'
                                ? 'bg-red-500 text-white shadow'
                                : 'bg-white/[0.03] text-white/60 hover:text-white hover:bg-white/[0.06]'
                            }`}
                          >
                            Échoué
                          </button>
                        </div>
                      </div>
                    )}

                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ==========================================
              ACCOUNT SETTINGS SECTION
              ========================================== */}
          <div className="bg-[#1c1030] border border-white/[0.08] rounded-3xl p-6 shadow-2xl flex flex-col gap-4">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#a855f7]" />
              {t.accountSettings}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              
              {/* Option 1: Edit Profile */}
              <button
                onClick={handleEditProfileOpen}
                className="w-full p-4 bg-black/20 hover:bg-black/30 border border-white/[0.04] hover:border-white/10 rounded-2xl flex items-center justify-between text-left transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-500/10 text-[#a855f7] rounded-xl group-hover:bg-[#a855f7] group-hover:text-black transition-all">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-black text-white">{t.editProfile}</p>
                    <p className="text-[10px] text-white/40">Avatar, nom et téléphone</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white transition-all" />
              </button>

              {/* Option 2: Change Password */}
              <button
                onClick={() => setPasswordModalOpen(true)}
                className="w-full p-4 bg-black/20 hover:bg-black/30 border border-white/[0.04] hover:border-white/10 rounded-2xl flex items-center justify-between text-left transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl group-hover:bg-blue-500 group-hover:text-black transition-all">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-black text-white">{t.changePassword}</p>
                    <p className="text-[10px] text-white/40">Sécurisez votre compte</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white transition-all" />
              </button>

              {/* Option 3: Notifications Toggler */}
              <div className="w-full p-4 bg-black/20 border border-white/[0.04] rounded-2xl flex items-center justify-between text-left">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-black text-white">{t.notifications}</p>
                    <p className="text-[10px] text-white/40">Alertes de livraison et promos</p>
                  </div>
                </div>
                
                <button 
                  onClick={toggleNotifications}
                  className={`w-11 h-6 rounded-full p-0.5 transition-all relative ${
                    notificationsEnabled ? 'bg-[#a855f7]' : 'bg-white/10'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow-md transition-all ${
                    notificationsEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Option 4: Language Switcher */}
              <button
                onClick={() => navigateToPage('home')}
                className="w-full p-4 bg-black/20 hover:bg-black/30 border border-white/[0.04] hover:border-white/10 rounded-2xl flex items-center justify-between text-left transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-black text-white">{t.language}</p>
                    <p className="text-[10px] text-white/40 font-bold uppercase text-[#a855f7]">
                      {lang === 'FR' ? 'Français (FR)' : 'Kreyòl (HT)'}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white transition-all" />
              </button>

              {/* Option 5: Privacy Policy */}
              <button
                onClick={() => navigateToPage('privacy')}
                className="w-full p-4 bg-black/20 hover:bg-black/30 border border-white/[0.04] hover:border-white/10 rounded-2xl flex items-center justify-between text-left transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/5 text-white/60 rounded-xl">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-black text-white">{t.privacyPolicy}</p>
                    <p className="text-[10px] text-white/40">Données et confidentialité</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white transition-all" />
              </button>

              {/* Option 6: Terms & Conditions */}
              <button
                onClick={() => navigateToPage('terms')}
                className="w-full p-4 bg-black/20 hover:bg-black/30 border border-white/[0.04] hover:border-white/10 rounded-2xl flex items-center justify-between text-left transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/5 text-white/60 rounded-xl">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-black text-white">{t.termsConditions}</p>
                    <p className="text-[10px] text-white/40">Règles d'utilisation</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white transition-all" />
              </button>

              {/* Option 7: Help & Support */}
              <button
                onClick={() => window.open('https://wa.me/50937373737', '_blank')}
                className="w-full p-4 bg-black/20 hover:bg-black/30 border border-white/[0.04] hover:border-white/10 rounded-2xl flex items-center justify-between text-left transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-500/10 text-yellow-400 rounded-xl">
                    <HelpCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-black text-white">{t.helpSupport}</p>
                    <p className="text-[10px] text-white/40">Support direct sur WhatsApp</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white transition-all" />
              </button>

              {/* Option 8: About */}
              <button
                onClick={() => setAboutModalOpen(true)}
                className="w-full p-4 bg-black/20 hover:bg-black/30 border border-white/[0.04] hover:border-white/10 rounded-2xl flex items-center justify-between text-left transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl">
                    <Star className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-black text-white">{t.about}</p>
                    <p className="text-[10px] text-white/40">Version de l'application</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white transition-all" />
              </button>

            </div>

            <button
              onClick={onLogout}
              className="mt-4 w-full py-3.5 bg-red-500/10 hover:bg-red-500 border border-red-500/20 hover:border-transparent text-red-500 hover:text-white text-xs font-black rounded-2xl transition-all flex items-center justify-center gap-2 shadow-md shadow-red-500/5 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>{t.logout}</span>
            </button>
          </div>

        </div>

      </div>

      {/* ==========================================
          MODAL: EDIT PROFILE
          ========================================== */}
      <AnimatePresence>
        {fulfillTarget && (
          <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 animate-fadeIn backdrop-blur-md">
            <div className="bg-[#150b28] border border-white/10 rounded-3xl w-full max-w-md p-6 flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-black text-white">Livrer la commande</h3>
                  <p className="text-xs text-white/50 mt-0.5">{fulfillTarget.productName || 'Produit'}{fulfillTarget.optionLabel ? ` — ${fulfillTarget.optionLabel}` : ''}</p>
                </div>
                <button onClick={() => setFulfillTarget(null)} className="p-2 rounded-full bg-black/40 text-white hover:bg-white/10" aria-label="Fermer"><X className="w-4 h-4" /></button>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-white/50">Code / PIN à envoyer</label>
                <input value={fulfillCode} onChange={(e) => setFulfillCode(e.target.value)} placeholder="XXXX-XXXX-XXXX"
                  className="mt-1 w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white font-mono text-sm focus:border-[#a855f7] outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-white/50">Instructions d'application (optionnel)</label>
                <textarea value={fulfillInstructions} onChange={(e) => setFulfillInstructions(e.target.value)} rows={3}
                  placeholder="Ex. Ouvrez l'App Store (région USA) &gt; votre compte &gt; Utiliser une carte cadeau &gt; saisissez le code."
                  className="mt-1 w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:border-[#a855f7] outline-none resize-none" />
              </div>
              {fulfillMsg && <p className="text-xs font-bold text-[#a855f7]">{fulfillMsg}</p>}
              <button onClick={handleFulfill} disabled={fulfilling || !fulfillCode.trim()}
                className="bg-[#a855f7] hover:bg-[#b56ff5] disabled:opacity-40 text-black font-black uppercase tracking-wider text-sm rounded-xl py-3 transition-colors">
                {fulfilling ? 'Envoi…' : 'Enregistrer et envoyer le code'}
              </button>
              <p className="text-[10px] text-white/40 text-center">Le client recevra le code par e-mail avec les instructions.</p>
            </div>
          </div>
        )}

        {editModalOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fadeIn backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1c1030] border border-white/10 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl p-6 relative"
            >
              <button 
                onClick={() => setEditModalOpen(false)}
                className="absolute top-4 right-4 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-xl transition-all"
              >
                <X className="w-4 h-4" />
              </button>

              <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-[#a855f7]" />
                {t.editProfile}
              </h3>

              {editSuccess && (
                <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl text-xs font-bold flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  {t.successMsg}
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="flex flex-col gap-4 text-xs font-semibold">
                <div>
                  <label className="block text-[10px] text-white/40 uppercase tracking-widest mb-1.5 font-black">
                    {t.fullName}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={editFullName}
                      onChange={(e) => setEditFullName(e.target.value)}
                      placeholder="Jean Thierry"
                      required
                      className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none transition-all pl-10"
                    />
                    <User className="w-4 h-4 text-white/30 absolute left-3.5 top-3.5" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-white/40 uppercase tracking-widest mb-1.5 font-black">
                    {t.phone}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="+509 3737-3737"
                      className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none transition-all pl-10"
                    />
                    <Phone className="w-4 h-4 text-white/30 absolute left-3.5 top-3.5" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-white/40 uppercase tracking-widest mb-1.5 font-black">
                    {lang === 'FR' ? 'ID de Joueur (Général / Free Fire / PUBG...)' : 'ID Jwè (Jeneral / Free Fire / PUBG...)'}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={editFreeFirePlayerId}
                      onChange={(e) => setEditFreeFirePlayerId(e.target.value)}
                      placeholder={lang === 'FR' ? "Entrez votre ID de joueur" : "Antre ID jwè ou"}
                      className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none transition-all pl-10"
                    />
                    <User className="w-4 h-4 text-white/30 absolute left-3.5 top-3.5" />
                  </div>
                  {editFreeFirePlayerIdError && (
                    <p className="text-red-400 text-[10px] font-bold mt-1 flex items-center gap-1 animate-pulse">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      {editFreeFirePlayerIdError}
                    </p>
                  )}
                </div>

                <div 
                  className="border-2 border-dashed border-white/[0.06] hover:border-white/[0.15] rounded-2xl p-4 text-center cursor-pointer transition-all mt-1"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="w-6 h-6 text-white/20 mx-auto mb-2" />
                  <p className="text-xs text-white/60 font-black">{t.dragDrop}</p>
                </div>

                <button
                  type="submit"
                  disabled={editingProfile}
                  className="mt-2 w-full py-3.5 bg-[#a855f7] hover:bg-orange-500 text-black font-black text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {editingProfile ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{t.uploading}</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>{t.save}</span>
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addFundsOpen && (
          <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 animate-fadeIn backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1c1030] border border-white/10 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl p-6 relative text-xs"
            >
              <button 
                onClick={() => setAddFundsOpen(false)}
                className="absolute top-4 right-4 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-xl transition-all"
              >
                <X className="w-4 h-4" />
              </button>

              <h3 className="text-lg font-black text-white mb-2 flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#a855f7]" />
                {t.addFundsTitle}
              </h3>

              <p className="text-[11px] text-white/50 mb-4 font-semibold">
                Rechargez votre portefeuille Thie Thie Services de manière sécurisée en Haïti.
              </p>

              {depositSuccessMsg && (
                <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl font-bold flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-xs">
                    <Check className="w-4 h-4 stroke-[3]" />
                    Dépôt soumis avec succès !
                  </div>
                  <span className="text-[10px] text-emerald-400/70 font-semibold">{t.depositPendingDesc}</span>
                </div>
              )}

              <form onSubmit={handleSubmitDeposit} className="flex flex-col gap-4 font-semibold">
                
                {/* Method Selector */}
                <div>
                  <label className="block text-[10px] text-white/40 uppercase tracking-widest mb-1.5 font-black">
                    Mode de Transfert
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(['MonCash', 'NatCash', 'Binance Pay', 'PayPal', 'Crypto'] as const).map((method) => {
                      const locked = method === 'Crypto' && kycStatus !== 'approved';
                      return (
                        <button
                          key={method}
                          type="button"
                          onClick={() => {
                            if (locked) { setAddFundsOpen(false); setKycModalOpen(true); return; }
                            setDepositPaymentMethod(method);
                            setDepositScreenshot(null);
                            setCryptoInvoice(null);
                            setCryptoError(null);
                          }}
                          className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center gap-0.5 ${
                            depositPaymentMethod === method
                              ? 'bg-[#a855f7]/10 border-[#a855f7] text-white'
                              : locked
                                ? 'bg-black/25 border-white/[0.05] text-white/30'
                                : 'bg-black/25 border-white/[0.05] text-white/60 hover:border-white/10'
                          }`}
                        >
                          {locked && <Lock className="w-3 h-3" />}
                          <span className="text-[9px] font-black">{method === 'Binance Pay' ? 'Binance' : method}</span>
                        </button>
                      );
                    })}
                  </div>
                  {kycStatus !== 'approved' && (
                    <p className="text-[9px] text-white/30 font-semibold mt-1.5">
                      🔒 Crypto (USDT) nécessite une vérification d'identité (KYC).
                    </p>
                  )}
                </div>

                {/* Dynamic Instructions & Account Details with Copy Buttons */}
                {depositPaymentMethod !== 'Crypto' && (
                <div className="bg-black/20 border border-white/[0.05] rounded-2xl p-4 flex flex-col gap-3">
                  <span className="text-[10px] text-white/40 uppercase font-black tracking-wider block">
                    Instructions de paiement
                  </span>

                  {!depositAccounts ? (
                    <p className="text-[11px] text-white/40">Chargement des coordonnées...</p>
                  ) : (
                  <>
                  {depositPaymentMethod === 'MonCash' && (
                    <div className="flex flex-col gap-2">
                      <p className="text-[11px] text-white/70 leading-relaxed font-medium">
                        Envoyez le montant MonCash au numéro ci-dessous ({depositAccounts.moncashName}). Après le transfert, indiquez votre numéro d'envoi et téléchargez la preuve.
                      </p>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <div className="bg-[#0c0714] border border-white/[0.04] p-2.5 rounded-xl flex flex-col relative">
                          <span className="text-[9px] text-white/30 font-bold">NOM REVEVEUR</span>
                          <span className="text-white font-black text-xs mt-0.5">{depositAccounts.moncashName}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyToClipboard(depositAccounts.moncashName, 'moncash-name')}
                            className="absolute right-2 top-3 p-1.5 bg-white/[0.03] hover:bg-white/[0.08] text-[#a855f7] rounded-lg"
                          >
                            {copiedField === 'moncash-name' ? <span className="text-[8px] font-black text-emerald-400">COPIÉ</span> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <div className="bg-[#0c0714] border border-white/[0.04] p-2.5 rounded-xl flex flex-col relative">
                          <span className="text-[9px] text-white/30 font-bold">NUMÉRO</span>
                          <span className="text-[#a855f7] font-black text-xs mt-0.5">{depositAccounts.moncashNumber}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyToClipboard(depositAccounts.moncashNumber, 'moncash-num')}
                            className="absolute right-2 top-3 p-1.5 bg-white/[0.03] hover:bg-white/[0.08] text-[#a855f7] rounded-lg"
                          >
                            {copiedField === 'moncash-num' ? <span className="text-[8px] font-black text-emerald-400">COPIÉ</span> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {depositPaymentMethod === 'NatCash' && (
                    <div className="flex flex-col gap-2">
                      <p className="text-[11px] text-white/70 leading-relaxed font-medium">
                        Envoyez le transfert NatCash au numéro ci-dessous ({depositAccounts.natcashName}). Après le transfert, indiquez votre numéro d'envoi et téléchargez la preuve.
                      </p>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <div className="bg-[#0c0714] border border-white/[0.04] p-2.5 rounded-xl flex flex-col relative">
                          <span className="text-[9px] text-white/30 font-bold">NOM REVEVEUR</span>
                          <span className="text-white font-black text-xs mt-0.5">{depositAccounts.natcashName}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyToClipboard(depositAccounts.natcashName, 'natcash-name')}
                            className="absolute right-2 top-3 p-1.5 bg-white/[0.03] hover:bg-white/[0.08] text-[#a855f7] rounded-lg"
                          >
                            {copiedField === 'natcash-name' ? <span className="text-[8px] font-black text-emerald-400">COPIÉ</span> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <div className="bg-[#0c0714] border border-white/[0.04] p-2.5 rounded-xl flex flex-col relative">
                          <span className="text-[9px] text-white/30 font-bold">NUMÉRO</span>
                          <span className="text-[#a855f7] font-black text-xs mt-0.5">{depositAccounts.natcashNumber}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyToClipboard(depositAccounts.natcashNumber, 'natcash-num')}
                            className="absolute right-2 top-3 p-1.5 bg-white/[0.03] hover:bg-white/[0.08] text-[#a855f7] rounded-lg"
                          >
                            {copiedField === 'natcash-num' ? <span className="text-[8px] font-black text-emerald-400">COPIÉ</span> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {depositPaymentMethod === 'Binance Pay' && (
                    <div className="flex flex-col gap-2">
                      <p className="text-[11px] text-white/70 leading-relaxed font-medium">
                        Envoyez vos USDT par Binance Pay à l'aide de l'identifiant (Pay ID) ci-dessous. Indiquez ensuite le TxID de la transaction.
                      </p>
                      <div className="bg-[#0c0714] border border-white/[0.04] p-2.5 rounded-xl flex flex-col relative">
                        <span className="text-[9px] text-white/30 font-bold">BINANCE PAY ID</span>
                        <span className="text-[#a855f7] font-black text-xs mt-0.5">{depositAccounts.binancePayId}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyToClipboard(depositAccounts.binancePayId, 'binance-payid')}
                          className="absolute right-2 top-3.5 p-1.5 bg-white/[0.03] hover:bg-white/[0.08] text-[#a855f7] rounded-lg"
                        >
                          {copiedField === 'binance-payid' ? <span className="text-[8px] font-black text-emerald-400">COPIÉ</span> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {depositPaymentMethod === 'PayPal' && (
                    <div className="flex flex-col gap-2">
                      <p className="text-[11px] text-white/70 leading-relaxed font-medium">
                        Réglez de manière sécurisée via PayPal Checkout officiel à {depositAccounts.moncashName}. Saisissez votre adresse email ou référence PayPal de la transaction.
                      </p>
                      <div className="bg-[#0c0714] border border-white/[0.04] p-2.5 rounded-xl flex flex-col relative">
                        <span className="text-[9px] text-white/30 font-bold">PAYPAL EMAIL</span>
                        <span className="text-[#a855f7] font-black text-xs mt-0.5">{depositAccounts.paypalEmail}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyToClipboard(depositAccounts.paypalEmail, 'paypal-email')}
                          className="absolute right-2 top-3.5 p-1.5 bg-white/[0.03] hover:bg-white/[0.08] text-[#a855f7] rounded-lg"
                        >
                          {copiedField === 'paypal-email' ? <span className="text-[8px] font-black text-emerald-400">COPIÉ</span> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}
                  </>
                  )}
                </div>
                )}

                {/* Amount selection and custom input (méthodes classiques uniquement) */}
                {depositPaymentMethod !== 'Crypto' && (
                <>
                <div>
                  <label className="block text-[10px] text-white/40 uppercase tracking-widest mb-1.5 font-black">
                    {t.selectAmount}
                  </label>
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {['500', '1000', '2500', '5000'].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setDepositAmount(amt)}
                        className={`py-2 rounded-lg text-center transition-all border ${
                          depositAmount === amt
                            ? 'bg-[#a855f7]/10 border-[#a855f7] text-[#a855f7]'
                            : 'bg-black/20 border-white/[0.05] text-white/50 hover:bg-black/30'
                        }`}
                      >
                        <span className="text-[10px] font-black">{amt} HTG</span>
                      </button>
                    ))}
                  </div>
                  
                  <div className="relative">
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => { const v = e.target.value; if (v === '' || /^\d{0,7}(\.\d{0,2})?$/.test(v)) setDepositAmount(v); }}
                      placeholder="Montant personnalisé"
                      required
                      min="10"
                      max="1000000"
                      inputMode="numeric"
                      className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none transition-all pr-12 font-bold"
                    />
                    <span className="text-white/40 absolute right-4 top-3.5 text-xs font-black">HTG</span>
                  </div>
                </div>

                {/* Champs de vérification selon la méthode.
                    MonCash/NatCash : Transaction ID (TransCode) + Nom + Numéro de l'expéditeur →
                    permettent le rapprochement AUTOMATIQUE avec le SMS marchand (TxID+montant, repli numéro+montant). */}
                {depositPaymentMethod === 'MonCash' || depositPaymentMethod === 'NatCash' ? (
                  <div className="grid gap-3">
                    <div>
                      <label className="block text-[10px] text-white/40 uppercase tracking-widest mb-1.5 font-black">Transaction ID (TransCode)</label>
                      <div className="relative">
                        <input type="text" value={depositTxId} onChange={(e) => setDepositTxId(e.target.value)} placeholder="Ex. 26070198044868" required
                          className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none transition-all pl-10" />
                        <CreditCard className="w-4 h-4 text-white/30 absolute left-3.5 top-3.5" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] text-white/40 uppercase tracking-widest mb-1.5 font-black">Nom de l'expéditeur</label>
                        <input type="text" value={depositSenderName} onChange={(e) => setDepositSenderName(e.target.value)} placeholder="Ex. Jean Pierre" required maxLength={80}
                          className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none transition-all" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-white/40 uppercase tracking-widest mb-1.5 font-black">Numéro de l'expéditeur</label>
                        <input type="text" inputMode="numeric" value={depositPhoneRef} onChange={(e) => { const v = e.target.value; if (v === '' || /^[\d +-]{0,15}$/.test(v)) setDepositPhoneRef(v); }} placeholder="Ex. 43457660" required maxLength={15}
                          className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none transition-all tabular-nums" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] text-white/40 uppercase tracking-widest mb-1.5 font-black">
                      {depositPaymentMethod === 'Binance Pay' ? "Transaction ID (TxID)" : "Référence PayPal / Email"}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={depositPaymentMethod === 'Binance Pay' ? depositTxId : depositPhoneRef}
                        onChange={(e) => depositPaymentMethod === 'Binance Pay' ? setDepositTxId(e.target.value) : setDepositPhoneRef(e.target.value)}
                        placeholder={depositPaymentMethod === 'Binance Pay' ? "Ex. 29108429012" : "Ex. email@example.com"}
                        required
                        className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none transition-all pl-10"
                      />
                      {depositPaymentMethod === 'Binance Pay' ? (
                        <CreditCard className="w-4 h-4 text-white/30 absolute left-3.5 top-3.5" />
                      ) : (
                        <Mail className="w-4 h-4 text-white/30 absolute left-3.5 top-3.5" />
                      )}
                    </div>
                  </div>
                )}

                {/* DRAG AND DROP SCREENSHOT UPLOADER */}
                <div>
                  <label className="block text-[10px] text-white/40 uppercase tracking-widest mb-1.5 font-black">
                    Capture d'écran (Preuve de paiement)
                  </label>
                  
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
                    onDragLeave={() => setIsDragActive(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragActive(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        setDepositScreenshot(e.dataTransfer.files[0]);
                      }
                    }}
                    onClick={() => {
                      const el = document.getElementById('depositScreenshotInput');
                      if (el) el.click();
                    }}
                    className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                      isDragActive 
                        ? 'border-[#a855f7] bg-[#a855f7]/5 text-[#a855f7]' 
                        : depositScreenshot 
                          ? 'border-emerald-500 bg-emerald-500/[0.02] text-emerald-400' 
                          : 'border-white/10 hover:border-white/20 bg-black/10 text-white/50'
                    }`}
                  >
                    <input
                      id="depositScreenshotInput"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setDepositScreenshot(e.target.files[0]);
                        }
                      }}
                    />
                    
                    {depositScreenshot ? (
                      <>
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                          <CheckCircle className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-white">{depositScreenshot.name}</p>
                          <p className="text-[10px] text-white/40 font-bold uppercase mt-0.5">
                            {(depositScreenshot.size / 1024).toFixed(1)} KB — Prêt à l'envoi
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 group-hover:text-white/60">
                          <Camera className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-white/70">Faites glisser votre capture d'écran ici</p>
                          <p className="text-[10px] text-white/30 font-semibold mt-0.5">
                            ou cliquez pour parcourir vos fichiers
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submittingDeposit}
                  className="mt-2 w-full py-3.5 bg-[#a855f7] hover:bg-orange-500 text-black font-black text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {submittingDeposit ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>{t.submitDeposit}</span>
                    </>
                  )}
                </button>
                </>
                )}

                {/* Recharge crypto (OxaPay) — kycStatus === 'approved' uniquement */}
                {depositPaymentMethod === 'Crypto' && (
                  <div className="flex flex-col gap-4">
                    {!cryptoInvoice ? (
                      <>
                        <div className="bg-black/20 border border-white/[0.05] rounded-2xl p-4 flex flex-col gap-2">
                          <span className="text-[10px] text-white/40 uppercase font-black tracking-wider block">
                            Recharge par crypto (USDT)
                          </span>
                          <p className="text-[11px] text-white/70 leading-relaxed font-medium">
                            Une facture de paiement est générée via notre passerelle crypto. Le solde est crédité automatiquement dès la confirmation du paiement — aucune capture d'écran requise.
                          </p>
                        </div>

                        <div>
                          <label className="block text-[10px] text-white/40 uppercase tracking-widest mb-1.5 font-black">
                            Montant (USD)
                          </label>
                          <div className="grid grid-cols-4 gap-2 mb-2">
                            {['10', '25', '50', '100'].map((amt) => (
                              <button
                                key={amt}
                                type="button"
                                onClick={() => setCryptoAmountUsd(amt)}
                                className={`py-2 rounded-lg text-center transition-all border ${
                                  cryptoAmountUsd === amt
                                    ? 'bg-[#a855f7]/10 border-[#a855f7] text-[#a855f7]'
                                    : 'bg-black/20 border-white/[0.05] text-white/50 hover:bg-black/30'
                                }`}
                              >
                                <span className="text-[10px] font-black">${amt}</span>
                              </button>
                            ))}
                          </div>
                          <div className="relative">
                            <input
                              type="number"
                              value={cryptoAmountUsd}
                              onChange={(e) => { const v = e.target.value; if (v === '' || /^\d{0,4}(\.\d{0,2})?$/.test(v)) setCryptoAmountUsd(v); }}
                              placeholder="Montant personnalisé"
                              min="5"
                              max="1000"
                              inputMode="numeric"
                              className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none transition-all pr-12 font-bold"
                            />
                            <span className="text-white/40 absolute right-4 top-3.5 text-xs font-black">USD</span>
                          </div>
                        </div>

                        {cryptoError && <p className="text-[11px] text-red-400 font-semibold">{cryptoError}</p>}

                        <button
                          type="button"
                          onClick={handleCreateCryptoInvoice}
                          disabled={creatingCryptoInvoice || !cryptoAmountUsd}
                          className="mt-1 w-full py-3.5 bg-[#a855f7] hover:bg-orange-500 text-black font-black text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          {creatingCryptoInvoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
                          <span>{creatingCryptoInvoice ? 'Génération...' : 'Générer une facture de paiement'}</span>
                        </button>
                      </>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <div className="bg-black/20 border border-white/[0.05] rounded-2xl p-4 flex flex-col items-center gap-3 text-center">
                          <div className="w-10 h-10 rounded-xl bg-[#a855f7]/10 flex items-center justify-center text-[#a855f7]">
                            <Loader2 className="w-5 h-5 animate-spin" />
                          </div>
                          <div>
                            <p className="text-xs font-black text-white">En attente du paiement — ${cryptoInvoice.amountUsd}</p>
                            <p className="text-[10px] text-white/40 font-semibold mt-0.5">
                              Le solde sera crédité automatiquement dès confirmation.
                            </p>
                          </div>
                          <a
                            href={cryptoInvoice.paymentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-3 bg-[#a855f7] hover:bg-orange-500 text-black font-black text-xs rounded-xl transition-all flex items-center justify-center gap-2"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Payer maintenant
                          </a>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCryptoInvoice(null)}
                          className="w-full py-2.5 bg-white/[0.03] hover:bg-white/[0.08] text-white/60 border border-white/[0.06] text-[10px] font-black rounded-xl transition-all"
                        >
                          Annuler / nouvelle facture
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==========================================
          MODAL: WITHDRAW FEATURE (ALERT/COMING SOON)
          ========================================== */}
      <AnimatePresence>
        {withdrawAlertOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fadeIn backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1c1030] border border-white/10 w-full max-w-sm rounded-3xl p-6 relative text-center flex flex-col items-center gap-4 text-xs"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-[#a855f7]">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-black text-white">Retrait de Portefeuille</h4>
                <p className="text-[11px] text-white/50 mt-1.5 leading-relaxed">
                  {t.withdrawComingSoon}
                </p>
              </div>
              <button
                onClick={() => setWithdrawAlertOpen(false)}
                className="w-full py-2.5 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all text-white cursor-pointer"
              >
                Fermer
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==========================================
          MODAL: CHANGE PASSWORD
          ========================================== */}
      <AnimatePresence>
        {passwordModalOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fadeIn backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1c1030] border border-white/10 w-full max-w-md rounded-3xl p-6 relative text-xs"
            >
              <button 
                onClick={() => setPasswordModalOpen(false)}
                className="absolute top-4 right-4 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-xl transition-all"
              >
                <X className="w-4 h-4" />
              </button>

              <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                <Lock className="w-5 h-5 text-[#a855f7]" />
                {t.changePassword}
              </h3>

              {passwordSuccess && (
                <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl font-bold flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  {t.passwordChangedSuccess}
                </div>
              )}

              {passwordError && (
                <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {passwordError}
                </div>
              )}

              <form onSubmit={handleChangePassword} className="flex flex-col gap-4 font-semibold">
                <div>
                  <label className="block text-[10px] text-white/40 uppercase tracking-widest mb-1.5 font-black">
                    {t.newPasswordLabel}
                  </label>
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none transition-all pl-10"
                    />
                    <Lock className="w-4 h-4 text-white/30 absolute left-3.5 top-3.5" />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3.5 top-3.5 text-white/30 hover:text-white"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-white/40 uppercase tracking-widest mb-1.5 font-black">
                    {t.confirmPasswordLabel}
                  </label>
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none transition-all pl-10"
                    />
                    <Lock className="w-4 h-4 text-white/30 absolute left-3.5 top-3.5" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={changingPassword}
                  className="mt-2 w-full py-3.5 bg-[#a855f7] hover:bg-orange-500 text-black font-black text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {changingPassword ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Confirmer le changement</span>
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==========================================
          MODAL: ABOUT INFO
          ========================================== */}
      <AnimatePresence>
        {aboutModalOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fadeIn backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1c1030] border border-white/10 w-full max-w-sm rounded-3xl p-6 relative text-center flex flex-col items-center gap-4 text-xs font-semibold"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#a855f7] to-orange-600 flex items-center justify-center text-black font-black text-xl shadow-lg">
                TTS
              </div>
              
              <div>
                <h4 className="text-md font-black text-white">Thie Thie Services</h4>
                <p className="text-[10px] text-[#a855f7] font-black tracking-widest uppercase mt-0.5">Gaming Center App</p>
                
                <p className="text-[11px] text-white/60 leading-relaxed mt-3 px-2">
                  La plateforme de recharge de jeux vidéo et de services de streaming la plus rapide et fiable en Haïti.
                </p>

                <div className="bg-black/25 rounded-2xl p-3 border border-white/[0.04] mt-4 flex flex-col gap-1.5 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-white/40">Version de l'application</span>
                    <span className="text-white font-bold">3.2.0 (Stable)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Serveur de Base de Données</span>
                    <span className="text-[#a855f7] font-black">Firebase Firestore</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Développement</span>
                    <span className="text-white font-bold">Thie Thie Pro Team</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setAboutModalOpen(false)}
                className="w-full py-2.5 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all text-white cursor-pointer"
              >
                Fermer
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==========================================
          MODAL: VIEW PROOF (ADMIN SCREENSHOT)
          ========================================== */}
      <AnimatePresence>
        {selectedRequest && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 animate-fadeIn backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1c1030] border border-white/10 w-full max-w-lg rounded-3xl p-6 relative flex flex-col gap-4 text-xs font-semibold"
            >
              <button 
                onClick={() => setSelectedRequest(null)}
                className="absolute top-4 right-4 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-xl transition-all"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="text-left">
                <h4 className="text-sm font-black text-white flex items-center gap-2">
                  <Camera className="w-4 h-4 text-[#a855f7]" />
                  Preuve de dépôt — {selectedRequest.requestId}
                </h4>
                <p className="text-[10px] text-white/40 mt-0.5">Vérifiez la transaction de {selectedRequest.amount} HTG via {selectedRequest.paymentMethod}</p>
              </div>

              <div className="w-full max-h-[350px] overflow-hidden rounded-2xl border border-white/10 bg-black/40 flex items-center justify-center relative group">
                <img 
                  src={selectedRequest.screenshotURL} 
                  alt="Proof screenshot" 
                  className="w-full h-full object-contain max-h-[350px]"
                />
                <a 
                  href={selectedRequest.screenshotURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute bottom-3 right-3 bg-black/75 hover:bg-black/90 text-[#a855f7] px-3 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Ouvrir en grand
                </a>
              </div>

              <div className="bg-black/20 p-3 rounded-xl border border-white/[0.04] text-[10px] text-left flex flex-col gap-1">
                <div>
                  <span className="text-white/40">Utilisateur ID: </span>
                  <span className="text-white select-all font-mono">{selectedRequest.uid}</span>
                </div>
                <div>
                  <span className="text-white/40">Référence d'envoi: </span>
                  <span className="text-white select-all font-mono">{selectedRequest.transactionReference}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleApproveDeposit(selectedRequest)}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-black rounded-xl font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  Approuver le dépôt
                </button>
                <button
                  onClick={() => handleRejectDeposit(selectedRequest)}
                  className="w-full py-3 bg-red-500/10 hover:bg-[#a855f7] text-red-400 hover:text-black border border-red-500/20 rounded-xl font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  Refuser le dépôt
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==========================================
          MODAL: SOUMISSION KYC (client)
          ========================================== */}
      <AnimatePresence>
        {kycModalOpen && (
          <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 animate-fadeIn backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1c1030] border border-white/10 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl p-6 relative text-xs"
            >
              <button
                onClick={() => setKycModalOpen(false)}
                className="absolute top-4 right-4 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-xl transition-all"
              >
                <X className="w-4 h-4" />
              </button>

              <h3 className="text-lg font-black text-white mb-2 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-[#a855f7]" />
                Vérification d'identité
              </h3>
              <p className="text-[11px] text-white/50 mb-4 font-semibold">
                Requise pour débloquer la recharge par crypto (USDT). Vos documents ne sont visibles que par notre équipe.
              </p>

              {kycSuccessMsg && (
                <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl font-bold flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-xs">
                    <Check className="w-4 h-4 stroke-[3]" />
                    Demande envoyée !
                  </div>
                  <span className="text-[10px] text-emerald-400/70 font-semibold">
                    Notre équipe vérifie votre identité — vous serez notifié dès l'approbation.
                  </span>
                </div>
              )}

              <form onSubmit={handleSubmitKyc} className="flex flex-col gap-4 font-semibold">
                <div>
                  <label className="block text-[10px] text-white/40 uppercase tracking-widest mb-1.5 font-black">
                    Nom complet (comme sur la pièce d'identité)
                  </label>
                  <input
                    type="text"
                    value={kycFullName}
                    onChange={(e) => setKycFullName(e.target.value)}
                    placeholder="Ex. Jean Baptiste"
                    required
                    className="w-full bg-[#0c0714] border border-white/[0.08] focus:border-[#a855f7] text-sm text-white px-4 py-3 rounded-xl focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-white/40 uppercase tracking-widest mb-1.5 font-black">
                    Photo de pièce d'identité (CIN, passeport, permis)
                  </label>
                  <div
                    onClick={() => document.getElementById('kycIdInput')?.click()}
                    className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5 ${
                      kycIdFile ? 'border-emerald-500 bg-emerald-500/[0.02] text-emerald-400' : 'border-white/10 text-white/40 hover:border-white/20'
                    }`}
                  >
                    <Camera className="w-5 h-5" />
                    <span className="text-[10px] font-bold">{kycIdFile ? kycIdFile.name : 'Cliquez pour choisir une image'}</span>
                  </div>
                  <input
                    id="kycIdInput"
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    className="hidden"
                    onChange={(e) => setKycIdFile(e.target.files?.[0] ?? null)}
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-white/40 uppercase tracking-widest mb-1.5 font-black">
                    Selfie (visage visible, tenant la pièce d'identité si possible)
                  </label>
                  <div
                    onClick={() => document.getElementById('kycSelfieInput')?.click()}
                    className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5 ${
                      kycSelfieFile ? 'border-emerald-500 bg-emerald-500/[0.02] text-emerald-400' : 'border-white/10 text-white/40 hover:border-white/20'
                    }`}
                  >
                    <Camera className="w-5 h-5" />
                    <span className="text-[10px] font-bold">{kycSelfieFile ? kycSelfieFile.name : 'Cliquez pour choisir une image'}</span>
                  </div>
                  <input
                    id="kycSelfieInput"
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    className="hidden"
                    onChange={(e) => setKycSelfieFile(e.target.files?.[0] ?? null)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingKyc || !kycIdFile || !kycSelfieFile || !kycFullName.trim()}
                  className="w-full py-3.5 bg-[#a855f7] hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-black font-black text-xs rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submittingKyc ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                  <span>{submittingKyc ? 'Envoi...' : 'Soumettre pour vérification'}</span>
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==========================================
          MODAL: PIÈCES KYC (admin)
          ========================================== */}
      <AnimatePresence>
        {selectedKycRequest && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 animate-fadeIn backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1c1030] border border-white/10 w-full max-w-lg rounded-3xl p-6 relative flex flex-col gap-4 text-xs font-semibold"
            >
              <button
                onClick={() => setSelectedKycRequest(null)}
                className="absolute top-4 right-4 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-xl transition-all"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="text-left">
                <h4 className="text-sm font-black text-white flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-[#a855f7]" />
                  Pièces KYC — {selectedKycRequest.requestId}
                </h4>
                <p className="text-[10px] text-white/40 mt-0.5">{selectedKycRequest.fullName}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] text-white/30 font-bold uppercase">Pièce d'identité</span>
                  <div className="w-full h-40 overflow-hidden rounded-2xl border border-white/10 bg-black/40 flex items-center justify-center relative group">
                    <img src={selectedKycRequest.idPhotoURL} alt="ID" className="w-full h-full object-contain" />
                    <a href={selectedKycRequest.idPhotoURL} target="_blank" rel="noopener noreferrer"
                      className="absolute bottom-2 right-2 bg-black/75 hover:bg-black/90 text-[#a855f7] p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] text-white/30 font-bold uppercase">Selfie</span>
                  <div className="w-full h-40 overflow-hidden rounded-2xl border border-white/10 bg-black/40 flex items-center justify-center relative group">
                    <img src={selectedKycRequest.selfiePhotoURL} alt="Selfie" className="w-full h-full object-contain" />
                    <a href={selectedKycRequest.selfiePhotoURL} target="_blank" rel="noopener noreferrer"
                      className="absolute bottom-2 right-2 bg-black/75 hover:bg-black/90 text-[#a855f7] p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>

              <div className="bg-black/20 p-3 rounded-xl border border-white/[0.04] text-[10px] text-left flex flex-col gap-1">
                <div>
                  <span className="text-white/40">Utilisateur ID: </span>
                  <span className="text-white select-all font-mono">{selectedKycRequest.uid}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleApproveKyc(selectedKycRequest)}
                  disabled={submittingKycReview}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-black rounded-xl font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  Approuver
                </button>
                <button
                  onClick={() => handleRejectKyc(selectedKycRequest)}
                  disabled={submittingKycReview}
                  className="w-full py-3 bg-red-500/10 hover:bg-[#a855f7] text-red-400 hover:text-black border border-red-500/20 rounded-xl font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                  Refuser
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==========================================
          TOAST: NOTIFICATION CONFIG CHANGED
          ========================================== */}
      <AnimatePresence>
        {notifToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 z-50 bg-[#1c1030] border border-white/10 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-bold"
          >
            <div className={`p-1.5 rounded-lg ${notificationsEnabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <p className="text-white">{notificationsEnabled ? "Notifications Activées" : "Notifications Désactivées"}</p>
              <p className="text-[10px] text-white/40 font-medium">{notificationsEnabled ? t.notificationsEnabled : t.notificationsDisabled}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
