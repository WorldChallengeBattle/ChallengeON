import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from './contexts/AuthContext';
import { 
  Flame, 
  TrendingUp, 
  ChevronDown, 
  Search, 
  Settings, 
  ArrowRight, 
  Zap, 
  Video, 
  X, 
  Users,
  Award,
  ThumbsUp,
  ThumbsDown,
  Star,
  MapPin,
  PlusCircle,
  User,
  ChevronUp,
  Crown,
  Trophy,
  Hash,
  Edit,
  Trash2,
  CheckCircle2,
  UploadCloud,
  Shield,
  MinusCircle,
  Languages
} from 'lucide-react';
import CameraCapture from './components/CameraCapture';
import AdminPanel from './components/AdminPanel';
import VideoPlayer from './components/VideoPlayer';
import { 
  getChallenges, 
  getAnnouncements,
  getPublicSettings,
  joinChallenge, 
  getChallengeVideos,
  updateChallenge,
  deleteChallenge
} from './services/challengeService';
import type { Announcement, Challenge, PublicDisplaySettings, ChallengeOnVideo } from './services/challengeService';
import { DEFAULT_PUBLIC_DISPLAY_SETTINGS } from './services/challengeService';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { apiUrl } from './config/api';
import { fallbackChainConfig, fetchChainConfig, type PublicChainConfig } from './config/chainConfig';
import { MiniKit } from '@worldcoin/minikit-js';
import { Permission } from '@worldcoin/minikit-js/commands';
import { db } from './firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { createPublicClient, encodeFunctionData, formatUnits, http, parseUnits } from 'viem';
import { worldchain, worldchainSepolia } from 'viem/chains';
import { SUPPORTED_LANGUAGES, useI18n } from './i18n';
import './index.css';

const getWorldChain = (chainId: number) => (chainId === 480 ? worldchain : worldchainSepolia);
const MINIKIT_API_BASE_URL = 'https://developer.world.org';
const ERC20_BALANCE_ABI = [{
  inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
  name: 'balanceOf',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
}] as const;
const ERC20_APPROVE_ABI = [{
  inputs: [
    { internalType: 'address', name: 'spender', type: 'address' },
    { internalType: 'uint256', name: 'amount', type: 'uint256' }
  ],
  name: 'approve',
  outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
  stateMutability: 'nonpayable',
  type: 'function'
}] as const;
const STAKING_MANAGER_ABI = [
  {
    inputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }],
    name: 'stake',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'availableStakeOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;
const PRIZE_MANAGER_ABI = [
  {
    inputs: [
      { internalType: 'bytes32', name: 'challengeId', type: 'bytes32' },
      { internalType: 'uint256', name: 'prizeAmount', type: 'uint256' },
      { internalType: 'uint64', name: 'submissionStart', type: 'uint64' },
      { internalType: 'uint64', name: 'submissionEnd', type: 'uint64' },
      { internalType: 'uint64', name: 'votingEnd', type: 'uint64' },
      { internalType: 'uint8', name: 'winnerCount', type: 'uint8' },
      { internalType: 'uint16[]', name: 'winnerSplitsBps', type: 'uint16[]' }
    ],
    name: 'createChallenge',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'bytes32', name: 'challengeId', type: 'bytes32' },
      { internalType: 'bytes32', name: 'videoId', type: 'bytes32' },
      { internalType: 'address', name: 'creator', type: 'address' },
      { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      { internalType: 'bytes', name: 'signature', type: 'bytes' }
    ],
    name: 'registerEntryWithSignature',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'bytes32', name: 'challengeId', type: 'bytes32' },
      { internalType: 'bytes32', name: 'videoId', type: 'bytes32' }
    ],
    name: 'voteVideo',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'bytes32', name: 'challengeId', type: 'bytes32' }],
    name: 'finalize',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'bytes32', name: 'challengeId', type: 'bytes32' }],
    name: 'claimWinningVoterReward',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const;

const UNON_BADGE_TIERS = [
  { level: 10, name: 'GALAXY', minBalance: 1_000_000, holderBand: 'Top 0.1%', tone: 'galaxy', image: new URL('./assets/badges/galaxy.svg', import.meta.url).href },
  { level: 9, name: 'LEGEND', minBalance: 500_000, holderBand: 'Top 0.5%', tone: 'legend', image: new URL('./assets/badges/legend.svg', import.meta.url).href },
  { level: 8, name: 'ELITE', minBalance: 100_000, holderBand: 'Top 1%', tone: 'elite', image: new URL('./assets/badges/elite.svg', import.meta.url).href },
  { level: 7, name: 'DIAMOND', minBalance: 50_000, holderBand: 'Top 2%', tone: 'diamond', image: new URL('./assets/badges/diamond.svg', import.meta.url).href },
  { level: 6, name: 'PLATINUM', minBalance: 10_000, holderBand: 'Top 5%', tone: 'platinum', image: new URL('./assets/badges/platinum.svg', import.meta.url).href },
  { level: 5, name: 'GOLD', minBalance: 5_000, holderBand: 'Top 10%', tone: 'gold', image: new URL('./assets/badges/gold.svg', import.meta.url).href },
  { level: 4, name: 'SILVER', minBalance: 1_000, holderBand: 'Top 20%', tone: 'silver', image: new URL('./assets/badges/silver.svg', import.meta.url).href },
  { level: 3, name: 'BRONZE', minBalance: 500, holderBand: 'Top 35%', tone: 'bronze', image: new URL('./assets/badges/bronze.svg', import.meta.url).href },
  { level: 2, name: 'STARTER', minBalance: 100, holderBand: 'Holder', tone: 'starter', image: new URL('./assets/badges/starter.svg', import.meta.url).href },
  { level: 1, name: 'ROOKIE', minBalance: 0, holderBand: 'New holder', tone: 'rookie', image: new URL('./assets/badges/rookie.svg', import.meta.url).href },
];

const getUnonBadgeTier = (balance: number) => (
  UNON_BADGE_TIERS.find((tier) => balance >= tier.minBalance) || UNON_BADGE_TIERS[UNON_BADGE_TIERS.length - 1]
);

// Gold Shower Component
const GoldShower = ({ onComplete }: { onComplete: () => void }) => {
  const particles = Array.from({ length: 40 });
  return (
    <div className="gold-shower-container">
      {particles.map((_, i) => (
        <motion.div
          key={i}
          className="gold-particle"
          initial={{
            x: Math.random() * 300 - 150,
            y: -20,
            opacity: 1,
            scale: Math.random() * 0.5 + 0.5
          }}
          animate={{
            y: 400,
            opacity: 0,
            rotate: 360
          }}
          transition={{
            duration: Math.random() * 2 + 1,
            ease: "easeIn",
            delay: Math.random() * 0.5
          }}
          onAnimationComplete={() => {
            if (i === particles.length - 1) onComplete();
          }}
        />
      ))}
      <motion.div
        className="gold-text-overlay"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
      >
        GOLD SHOWER! 🪙
      </motion.div>
    </div>
  );
};

const isLikelyTransactionHash = (value?: string | null): value is `0x${string}` =>
  !!value && /^0x[a-fA-F0-9]{64}$/.test(value);
const isLikelyAddress = (value?: string | null): value is `0x${string}` =>
  !!value && /^0x[a-fA-F0-9]{40}$/.test(value);
type MiniKitWalletFields = {
  walletAddress?: string | null;
  address?: string | null;
};
const getMiniKitWalletAddress = (): `0x${string}` | null => {
  const miniKitRoot = MiniKit as unknown as MiniKitWalletFields;
  const miniKitUser = MiniKit.user as unknown as MiniKitWalletFields | null | undefined;
  const candidates = [
    miniKitRoot.walletAddress,
    miniKitUser?.walletAddress,
    miniKitUser?.address,
  ];

  return candidates.find(isLikelyAddress) || null;
};

type MiniKitUserOperationStatus = {
  userOpHash: string;
  transactionHash?: `0x${string}`;
  transactionStatus: 'pending' | 'mined' | 'failed';
};

type PrizeEntryRegistrationPayload = {
  chainId: number;
  prizeManagerAddress: `0x${string}`;
  challengeId: `0x${string}`;
  videoId: `0x${string}`;
  creator: `0x${string}`;
  deadline: number;
  signature: `0x${string}`;
};

type VideoUploadResult = {
  success?: boolean;
  data?: { id?: string; [key: string]: unknown };
  entryRegistration?: PrizeEntryRegistrationPayload | null;
};

type PrizeFormState = {
  prizePoolUnon: string;
  submissionEnd: string;
  votingEnd: string;
  winnerCount: number;
  winnerSplitsBps: number[];
  distributionMode: 'percent' | 'amount';
  syncEndDate: boolean;
};

type PrizeStatusEntry = {
  videoId: string;
  creator: string;
  votes: number;
};

type PrizeStatusState = {
  finalized?: boolean;
  noContest?: boolean;
  winningVideoId?: string;
  winningVoteCount?: number;
  voterRewardPerWinningVote?: string;
  entries?: PrizeStatusEntry[];
};

const getReadableErrorMessage = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return 'Unknown error';
  }

  const maybeError = error as { shortMessage?: string; details?: string; message?: string; cause?: unknown };
  const rawMessage =
    maybeError.shortMessage ||
    maybeError.details ||
    maybeError.message ||
    (typeof maybeError.cause === 'object' && maybeError.cause && 'message' in maybeError.cause
      ? String((maybeError.cause as { message?: string }).message)
      : '') ||
    'Unknown error';

  return rawMessage
    .replace(/^execution reverted:\s*/i, '')
    .replace(/^Transaction execution failed:\s*/i, '')
    .trim();
};

const REGIONS = ['Global 🌐', 'USA 🇺🇸', 'China 🇨🇳', 'Korea 🇰🇷', 'Europe 🇪🇺', 'Germany 🇩🇪', 'Japan 🇯🇵', 'Southeast Asia', 'UK 🇬🇧', 'France 🇫🇷', 'Middle East 🕌', 'Russia 🇷🇺'];

const getDefaultPrizeDateTime = (offsetDays: number, time = '23:59') => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${time}`;
};

const createDefaultPrizeForm = (): PrizeFormState => ({
  prizePoolUnon: '100',
  submissionEnd: getDefaultPrizeDateTime(7),
  votingEnd: getDefaultPrizeDateTime(8),
  winnerCount: 1,
  winnerSplitsBps: [10000],
  distributionMode: 'percent',
  syncEndDate: false
});

const MICROPHONE_PERMISSION_SESSION_KEY = 'challengeOnMicrophonePermissionRequested';

const stopMediaStream = (stream: MediaStream) => {
  stream.getTracks().forEach((track) => track.stop());
};

const requestInitialMicrophoneAccess = async () => {
  if (sessionStorage.getItem(MICROPHONE_PERMISSION_SESSION_KEY) === 'true') return;
  if (!MiniKit.isInstalled()) return;

  sessionStorage.setItem(MICROPHONE_PERMISSION_SESSION_KEY, 'true');

  try {
    await MiniKit.requestPermission({ permission: Permission.Microphone });
  } catch (error) {
    const message = getReadableErrorMessage(error);
    if (!/already_granted|already_requested/i.test(message)) {
      console.warn('World App microphone permission request failed:', error);
    }
  }

  if (!navigator.mediaDevices?.getUserMedia) return;

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  stopMediaStream(stream);
};

const EDITORS_CHOICE_TAGS = [
  'nanobanana', 'agenticAI', 'generativevlog', 'aifilterchallenge',
  'sealion', 'jonhammdancing', 'takaladentro', '365buttons', 'kpopmashupmar2026', 'draculajennie'
];

function App() {
  const { language, setLanguage, t } = useI18n();
  const { currentUser, userData, refreshUserData } = useAuth();
  const [chainConfig, setChainConfig] = useState<PublicChainConfig>(fallbackChainConfig);
  const [chainConfigError, setChainConfigError] = useState<string | null>(null);
  const [isChainConfigLoading, setIsChainConfigLoading] = useState(true);
  const WORLD_CHAIN_ID = chainConfig.chainId;
  const WORLD_CHAIN_LABEL = chainConfig.label;
  const ONBOARDING_MANAGER_ADDRESS = (chainConfig.contracts.onboardingManager || '') as `0x${string}`;
  const UNON_TOKEN_ADDRESS = (chainConfig.contracts.unonToken || '') as `0x${string}`;
  const UNON_PRIZE_MANAGER_ADDRESS = (chainConfig.contracts.prizeChallengeManager || '') as `0x${string}`;
  const UNON_STAKING_MANAGER_ADDRESS = (chainConfig.contracts.stakingLevelManager || '') as `0x${string}`;
  const UNON_FAN_SUPPORT_MANAGER_ADDRESS = (chainConfig.contracts.fanSupportManager || '') as `0x${string}`;
  const WLD_TOKEN_ADDRESS = (chainConfig.contracts.wldToken || '') as `0x${string}`;
  const PLATINUM_PRIZE_MIN_UNON = chainConfig.policy.platinumMinimumUnon || 10_000;
  const worldchainPublicClient = React.useMemo(() => createPublicClient({
    chain: getWorldChain(WORLD_CHAIN_ID),
    transport: http(chainConfig.rpcUrl || undefined),
  }), [WORLD_CHAIN_ID, chainConfig.rpcUrl]);

  const [currentTab, setCurrentTab] = useState<'trend' | 'battle' | 'now' | 'create' | 'rankings' | 'profile'>('trend');
  const [isRegionOpen, setIsRegionOpen] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeRegion, setActiveRegion] = useState(REGIONS[0]);

  // Interaction State
  const [expandedChallengeId, setExpandedChallengeId] = useState<string | null>(() => {
    return localStorage.getItem('lastExpandedChallengeId');
  });
  const [challengeVideos, setChallengeVideos] = useState<Record<string, ChallengeOnVideo[]>>({});
  const [loadingVideos, setLoadingVideos] = useState<Record<string, boolean>>({});
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraEntryMode, setCameraEntryMode] = useState<'camera' | 'upload'>('camera');
  const [selectedUploadBlob, setSelectedUploadBlob] = useState<Blob | null>(null);
  const [showUploadGuidanceModal, setShowUploadGuidanceModal] = useState(false);
  const [selectedRemixSource, setSelectedRemixSource] = useState<{
    videoId: string;
    title: string;
    author: string;
    platform: string;
    url?: string;
  } | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [isPreparingCamera, setIsPreparingCamera] = useState(false);
  const [cameraPermissionError, setCameraPermissionError] = useState('');
  const [linkForm, setLinkForm] = useState({ url: '', platform: 'instagram' });
  const [isSubmittingLink, setIsSubmittingLink] = useState(false);
  const [toast, setToast] = useState('');
  const [createForm, setCreateForm] = useState({ title: '', hashtags: '', region: REGIONS[0] });
  const [createMode, setCreateMode] = useState<'standard' | 'prize'>('standard');
  const [prizeForm, setPrizeForm] = useState<PrizeFormState>(() => createDefaultPrizeForm());
  const [isCreating, setIsCreating] = useState(false);
  const [prizeStatusMap, setPrizeStatusMap] = useState<Record<string, PrizeStatusState>>({});
  const [prizeActionLoading, setPrizeActionLoading] = useState<Record<string, boolean>>({});
  const [claimedPrizeRewards, setClaimedPrizeRewards] = useState<Record<string, boolean>>({});
  const [activeVideoIndex, setActiveVideoIndex] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('lastActiveVideoIndexMap');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });
  const [showGoldShower, setShowGoldShower] = useState<string | null>(null);
  const [strikeFirstIndex, setStrikeFirstIndex] = useState(0);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementIndex, setAnnouncementIndex] = useState(0);
  const [announcementDirection, setAnnouncementDirection] = useState(1);
  const [publicDisplaySettings, setPublicDisplaySettings] = useState<PublicDisplaySettings>(DEFAULT_PUBLIC_DISPLAY_SETTINGS);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [unonBalance, setUnonBalance] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showQuickNav, setShowQuickNav] = useState(false);
  const uploadVideoInputRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<any>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const announcementSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  
  // History & Settings State
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showUnonBadgeInfoModal, setShowUnonBadgeInfoModal] = useState(false);
  const [unonBadgeInfoTab, setUnonBadgeInfoTab] = useState<'badges' | 'benefits'>('badges');
  const [rankingPeriod, setRankingPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const [rankingToken, setRankingToken] = useState<'all' | 'UNON' | 'WLD'>('all');
  const [donationRankings, setDonationRankings] = useState<Array<{ creator: string; token_symbol: string; donated_amount: string; support_count: number }>>([]);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [userChallenges, setUserChallenges] = useState<Challenge[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [userVotes, setUserVotes] = useState<Record<string, string>>({});
  const [isClaiming, setIsClaiming] = useState(false);
  const profileWalletAddress = [
    currentUser?.uid,
    getMiniKitWalletAddress(),
  ].find(isLikelyAddress) || null;

  const finalizeOnboardingClaim = async (claimHash?: string | null) => {
    if (!currentUser || !db) return;

    const userRef = doc(db, 'users', currentUser.uid);
    await updateDoc(userRef, {
      points: Math.max(userData?.points || 0, 100),
      onboardingClaimed: true,
      onboardingClaimPendingHash: null,
      onboardingClaimPendingAt: null,
      onboardingClaimTxHash: claimHash || null,
    });

    if (refreshUserData) await refreshUserData();
  };

  const fetchMiniKitUserOperationStatus = async (userOpHash: string): Promise<MiniKitUserOperationStatus> => {
    const response = await fetch(`${MINIKIT_API_BASE_URL}/api/v2/minikit/userop/${userOpHash}`);
    if (!response.ok) {
      throw new Error('Failed to fetch World App claim status.');
    }

    const data = await response.json();
    return {
      userOpHash: data.userOpHash ?? userOpHash,
      transactionHash: isLikelyTransactionHash(data.transaction_hash) ? data.transaction_hash : undefined,
      transactionStatus:
        data.status === 'success' ? 'mined' : data.status === 'failed' ? 'failed' : 'pending',
    };
  };

  const waitForMiniKitClaimReceipt = async (userOpHash: string, timeoutMs = 120_000) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const status = await fetchMiniKitUserOperationStatus(userOpHash);

      if (status.transactionStatus === 'failed') {
        throw new Error('World App reported that the claim transaction failed.');
      }

      if (status.transactionHash) {
        const receipt = await worldchainPublicClient.waitForTransactionReceipt({
          hash: status.transactionHash,
          timeout: Math.max(15_000, timeoutMs - (Date.now() - startedAt)),
          pollingInterval: 2_000,
        });

        return { transactionHash: status.transactionHash, receipt };
      }

      await new Promise(resolve => window.setTimeout(resolve, 1_000));
    }

    return null;
  };

  const verifyPendingOnboardingClaim = async (claimHash?: string | null) => {
    if (!claimHash || !isLikelyTransactionHash(claimHash)) {
      return false;
    }

    const receiptResult = await waitForMiniKitClaimReceipt(claimHash, 120_000);
    if (!receiptResult) {
      return false;
    }

    if (receiptResult.receipt.status !== 'success') {
      throw new Error(`The onboarding transaction did not succeed on ${WORLD_CHAIN_LABEL}.`);
    }

    await finalizeOnboardingClaim(receiptResult.transactionHash);
    return true;
  };

  const handleClaimOnboarding = async () => {
    if (!currentUser || isClaiming) return;
    if (!profileWalletAddress) {
      showToast('Wallet address is not ready yet. Please reopen this mini app from World App.');
      return;
    }
    
    if (!MiniKit.isInstalled()) {
      showToast('🌐 You must open this application inside the World App to claim UNON.');
      return;
    }
    
    setIsClaiming(true);
    try {
      showToast('✨ Generating Claim Signature...');
      const res = await fetch(apiUrl('/api/auth/onboarding-signature'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: profileWalletAddress })
      });
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to get signature');
      }

      showToast('📲 Please confirm the transaction in World App.');
      
      const ONBOARDING_ABI = [{
        "inputs": [
          { "internalType": "bytes32", "name": "identityNullifier", "type": "bytes32" },
          { "internalType": "address", "name": "recipient", "type": "address" },
          { "internalType": "bytes", "name": "signature", "type": "bytes" }
        ],
        "name": "claim",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      }];
      
      // Execute the On-Chain Transaction via MiniKit
      const transactionResult = await MiniKit.sendTransaction({
        chainId: WORLD_CHAIN_ID,
        transactions: [{
          to: ONBOARDING_MANAGER_ADDRESS,
          data: encodeFunctionData({
            abi: ONBOARDING_ABI,
            functionName: "claim",
            args: [data.identityNullifier, profileWalletAddress, data.signature]
          })
        }]
      });
      
      if (transactionResult?.data) {
        showToast('🎉 100 UNON Reward Claimed Successfully! Welcome to the Arena!');
        
        // Update user's remote state on success
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, { 
          points: 100,
          onboardingClaimed: true 
        });
        
        // Refresh local UI
        if (refreshUserData) await refreshUserData();
      } else {
        throw new Error('Transaction rejected or failed.');
      }
      
    } catch (error: any) {
      console.error('Claim Error:', error);
      showToast(`⚠️ Claim Failed: ${error.message}`);
    } finally {
      setIsClaiming(false);
    }
  };

  void handleClaimOnboarding;

  const handleClaimOnboardingVerified = async () => {
    if (!currentUser || isClaiming) return;
    if (!profileWalletAddress) {
      showToast('Wallet address is not ready yet. Please reopen this mini app from World App.');
      return;
    }

    if (!MiniKit.isInstalled()) {
      showToast('You must open this application inside the World App to claim UNON.');
      return;
    }

    setIsClaiming(true);
    try {
      const pendingHash = userData?.onboardingClaimPendingHash;
      if (pendingHash) {
        showToast(`Checking your pending 100 UNON claim on ${WORLD_CHAIN_LABEL}...`);
        const verified = await verifyPendingOnboardingClaim(pendingHash);
        if (verified) {
          showToast(`100 UNON reward confirmed on ${WORLD_CHAIN_LABEL}.`);
          return;
        }
      }

      showToast('Generating claim signature...');
      const res = await fetch(apiUrl('/api/auth/onboarding-signature'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: profileWalletAddress })
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to get signature');
      }

      showToast('Please confirm the transaction in World App.');

      const ONBOARDING_ABI = [{
        inputs: [
          { internalType: 'bytes32', name: 'identityNullifier', type: 'bytes32' },
          { internalType: 'address', name: 'recipient', type: 'address' },
          { internalType: 'bytes', name: 'signature', type: 'bytes' }
        ],
        name: 'claim',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function'
      }] as const;

      const claimCalldata = encodeFunctionData({
        abi: ONBOARDING_ABI,
        functionName: 'claim',
        args: [data.identityNullifier, profileWalletAddress, data.signature]
      });

      try {
        await worldchainPublicClient.call({
          account: profileWalletAddress,
          to: ONBOARDING_MANAGER_ADDRESS,
          data: claimCalldata,
        });
      } catch (simulationError) {
        throw new Error(`Claim simulation failed: ${getReadableErrorMessage(simulationError)}`);
      }

      const transactionResult = await MiniKit.sendTransaction({
        chainId: WORLD_CHAIN_ID,
        transactions: [{
          to: ONBOARDING_MANAGER_ADDRESS,
          data: claimCalldata
        }]
      });

      const claimHash = transactionResult?.data?.userOpHash || null;
      if (!claimHash) {
        throw new Error('Transaction rejected or failed before a claim hash was returned.');
      }

      if (db) {
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, {
          onboardingClaimPendingHash: claimHash,
          onboardingClaimPendingAt: new Date().toISOString(),
        });
      }

      const verified = await verifyPendingOnboardingClaim(claimHash);
      if (verified) {
        showToast('100 UNON reward claimed successfully and confirmed.');
      } else {
        if (refreshUserData) await refreshUserData();
        showToast('Claim submitted. Confirmation is still pending, so you can verify again from the same button.');
      }
    } catch (error: any) {
      const readableMessage = getReadableErrorMessage(error);
      console.error('Claim Error:', error);

      if (/already claimed/i.test(readableMessage)) {
        await finalizeOnboardingClaim(userData?.onboardingClaimPendingHash || null);
        showToast(`This wallet already claimed the 100 UNON welcome bonus on ${WORLD_CHAIN_LABEL}.`);
        return;
      }

      showToast(`Claim failed: ${readableMessage}`);
    } finally {
      setIsClaiming(false);
    }
  };

  const handleDeleteChallenge = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const challenge = challenges.find(c => c.id === id);
    if (!challenge) return;
    if ((challenge.videoCount || 0) > 0) {
      showToast('🚫 Cannot delete a challenge that already has entries!');
      return;
    }
    
    if (window.confirm('Are you sure you want to delete this challenge? This cannot be undone.')) {
      try {
        await deleteChallenge(id);
        showToast('✅ Challenge deleted successfully.');
        setChallenges(prev => prev.filter(c => c.id !== id));
      } catch (err: any) {
        showToast(`⚠️ Delete failed: ${err.message}`);
      }
    }
  };

  const handleEditChallenge = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const challenge = challenges.find(c => c.id === id);
    if (!challenge) return;
    
    const newTitle = window.prompt('Update Challenge Title:', challenge.title);
    if (newTitle === null) return;
    const newHashtags = window.prompt('Update Hashtags:', challenge.hashtags);
    if (newHashtags === null) return;

    try {
      const updated = await updateChallenge(id, { title: newTitle, hashtags: newHashtags });
      showToast('✅ Challenge updated!');
      setChallenges(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c));
    } catch (err: any) {
      showToast('⚠️ Update failed');
    }
  };
  useEffect(() => {
    let isMounted = true;
    fetchChainConfig()
      .then((config) => {
        if (!isMounted) return;
        setChainConfig(config);
        setChainConfigError(null);
      })
      .catch((error) => {
        if (!isMounted) return;
        console.error('Failed to load chain config:', error);
        setChainConfigError(error instanceof Error ? error.message : 'Failed to load chain config.');
      })
      .finally(() => {
        if (isMounted) setIsChainConfigLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetch(apiUrl(`/api/user/votes/${currentUser.uid}`))
        .then(r => r.json())
        .then(data => { if (data.success) setUserVotes(data.data); })
        .catch(console.error);
    } else {
      setUserVotes({});
    }
  }, [currentUser]);

  const submitSocialLink = async () => {
    if (!selectedChallenge || !linkForm.url) return;
    
    setIsSubmittingLink(true);
    try {
      const res = await fetch(apiUrl('/api/submit-link'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: selectedChallenge.id,
          username: currentUser?.displayName || 'Warrior',
          socialUrl: linkForm.url,
          platform: linkForm.platform
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('✅ Challenge Entry Linked Successfully!');
        setShowLinkModal(false);
        setLinkForm({ url: '', platform: 'instagram' });
        loadChallenges(); // Refresh feed
      } else {
        showToast(`⚠️ ${data.error || 'Submission failed'}`);
      }
    } catch (e) {
      showToast('⚠️ Connection error');
    } finally {
      setIsSubmittingLink(false);
    }
  };

  useEffect(() => {
    if (expandedChallengeId) {
      localStorage.setItem('lastExpandedChallengeId', expandedChallengeId);
    } else {
      localStorage.removeItem('lastExpandedChallengeId');
    }
  }, [expandedChallengeId]);

  useEffect(() => {
    if (Object.keys(activeVideoIndex).length > 0) {
      localStorage.setItem('lastActiveVideoIndexMap', JSON.stringify(activeVideoIndex));
    }
  }, [activeVideoIndex]);

  useEffect(() => {
    if (currentUser) {
      syncUser();
    }
  }, [currentUser]);

  useEffect(() => {
    let isCancelled = false;

    const checkAdminAccess = async () => {
      if (!currentUser) {
        setIsAdminUser(false);
        return;
      }

      try {
        const token = await currentUser.getIdToken();
        const response = await fetch(apiUrl('/api/admin/me'), {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json().catch(() => ({}));
        if (!isCancelled) setIsAdminUser(response.ok && data.success === true);
      } catch (error) {
        if (!isCancelled) setIsAdminUser(false);
      }
    };

    void checkAdminAccess();

    return () => {
      isCancelled = true;
    };
  }, [currentUser]);

  const syncUser = async () => {
    try {
      await fetch(apiUrl('/api/user/sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentUser?.uid,
          email: currentUser?.email,
          googleId: currentUser?.uid,
          creatorHandle: currentUser?.displayName?.replace(/\s+/g, '')
        })
      });
    } catch (e) {
      console.error("Sync fail:", e);
    }
  };

  const supportVideo = async (video: ChallengeOnVideo) => {
    if (!currentUser) {
      showToast('World ID authentication is still in progress. Please try again in a moment.');
      return;
    }

    try {
      const res = await fetch(apiUrl('/api/video-support'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.uid,
          videoAuthor: video.author,
          tokenSymbol: 'UNON',
          fanSupportManagerAddress: UNON_FAN_SUPPORT_MANAGER_ADDRESS || null,
          wldTokenAddress: WLD_TOKEN_ADDRESS || null
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowGoldShower(video.id);
        showToast('🪙 Gold Shower Support Sent!');
        setTimeout(() => setShowGoldShower(null), 3000);
      } else {
        showToast(`⚠️ ${data.error || 'Support failed'}`);
      }
    } catch (e) {
      showToast('⚠️ Connection error');
    }
  };

  const followCreator = async (video: ChallengeOnVideo) => {
    if (!currentUser) {
      showToast('World ID authentication is still in progress. Please try again in a moment.');
      return;
    }
    if (!video.authorUid) {
      showToast('This creator profile is not linked yet.');
      return;
    }
    if (video.authorUid === currentUser.uid) {
      showToast('This is your own entry.');
      return;
    }

    try {
      const token = await currentUser.getIdToken();
      const res = await fetch(apiUrl('/api/follows'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ followedUid: video.authorUid })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Follow failed');
      }
      showToast(`Following @${video.authorWorldUsername || video.author}`);
    } catch (error) {
      showToast(`Follow failed: ${getReadableErrorMessage(error)}`);
    }
  };

  const tryOnChallenge = async (challenge: Challenge, sourceVideo?: ChallengeOnVideo) => {
    setSelectedRemixSource(sourceVideo ? {
      videoId: sourceVideo.id,
      title: sourceVideo.videoTitle || challenge.title,
      author: sourceVideo.authorWorldUsername || sourceVideo.author,
      platform: sourceVideo.platform,
      url: sourceVideo.externalUrl || sourceVideo.videoUrl || undefined
    } : null);
    try {
      if (challenge.hashtags && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(challenge.hashtags);
        showToast(sourceVideo ? 'Challenge tags copied. Remix source selected.' : 'Challenge tags copied. Create your Try ON entry.');
      } else {
        showToast(sourceVideo ? 'Remix source selected.' : 'Create your Try ON entry.');
      }
    } catch {
      showToast(sourceVideo ? 'Remix source selected.' : 'Create your Try ON entry.');
    }
    openJoinChallengeModal(challenge, { keepRemixSource: true });
  };


  const getOnVideoKey = (challengeId: string, mode: 'trend' | 'battle' | 'now') => `${mode}:${challengeId}`;

  const toggleExpand = async (challenge: Challenge, mode?: 'trend' | 'battle' | 'now') => {
    const videoKey = mode ? getOnVideoKey(challenge.id, mode) : challenge.id;
    if (expandedChallengeId === challenge.id) {
      setExpandedChallengeId(null);
    } else {
      setExpandedChallengeId(challenge.id);
      setActiveVideoIndex(prev => ({ ...prev, [videoKey]: 0 }));
      if (challenge.challengeType === 'prize') {
        void loadPrizeStatus(challenge.id);
      }
      if (!challengeVideos[videoKey] && !loadingVideos[videoKey]) {
        setLoadingVideos(prev => ({ ...prev, [videoKey]: true }));
        try {
          const videos = await getChallengeVideos(challenge.id, challenge.hashtags, mode);
          setChallengeVideos(prev => ({ ...prev, [videoKey]: videos }));
        } catch (e) {
          console.error("Scraping failed:", e);
        } finally {
          setLoadingVideos(prev => ({ ...prev, [videoKey]: false }));
        }
      }
    }
  };

  useEffect(() => {
    if (expandedChallengeId) {
      const el = document.getElementById(`challenge-${expandedChallengeId}`);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
      }
      
      // Also auto-scroll the top horizontal list if it's a new trend
      const trendEl = document.getElementById(`trend-card-${expandedChallengeId}`);
      if (trendEl) {
        setTimeout(() => {
          trendEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }, 100);
      }
    }
  }, [expandedChallengeId]);

  useEffect(() => {
    const handleScroll = () => {
      if (feedRef.current) {
        setShowScrollTop(feedRef.current.scrollTop > 500);
      }
    };
    const el = feedRef.current;
    if (el) el.addEventListener('scroll', handleScroll);
    return () => { if (el) el.removeEventListener('scroll', handleScroll); };
  }, [feedRef]);

  const scrollToTop = () => {
    if (feedRef.current) {
      feedRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setShowQuickNav(false);
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el && feedRef.current) {
      const top = el.offsetTop - 20;
      feedRef.current.scrollTo({ top, behavior: 'smooth' });
    }
    setShowQuickNav(false);
  };

  const startLongPress = () => {
    longPressTimer.current = setTimeout(() => {
      setShowQuickNav(true);
    }, 500);
  };

  const endLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  useEffect(() => {
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }
  }, []);

  useEffect(() => {
    loadChallenges();
  }, [currentTab]);

  useEffect(() => {
    const loadDonationRankings = async () => {
      try {
        const res = await fetch(apiUrl(`/api/rankings/donations?period=${rankingPeriod}&token=${rankingToken}`));
        const data = await res.json();
        if (data.success) {
          setDonationRankings(data.data || []);
        }
      } catch (error) {
        console.error('Donation ranking load error:', error);
      }
    };
    if (currentTab === 'rankings') {
      void loadDonationRankings();
    }
  }, [currentTab, rankingPeriod, rankingToken]);

  const loadUserHistory = async () => {
    if (!currentUser) return;
    setIsLoadingHistory(true);
    try {
      const res = await fetch(apiUrl(`/api/user/challenges/${currentUser.uid}`));
      const data = await res.json();
      if (data.success) {
        setUserChallenges(data.data);
      }
    } catch (e) {
      console.error("History load error:", e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (showHistoryModal) {
      loadUserHistory();
    }
  }, [showHistoryModal, currentUser]);

  useEffect(() => {
    if (expandedChallengeId && challenges.length > 0) {
      const challenge = challenges.find(c => c.id === expandedChallengeId);
      if (challenge && !challengeVideos[challenge.id] && !loadingVideos[challenge.id]) {
        const fetchVideos = async () => {
          setLoadingVideos(prev => ({ ...prev, [challenge.id]: true }));
          try {
            const videos = await getChallengeVideos(challenge.id, challenge.hashtags);
            setChallengeVideos(prev => ({ ...prev, [challenge.id]: videos }));
          } catch (e) {
            console.error("Auto-Scraping failed:", e);
          } finally {
            setLoadingVideos(prev => ({ ...prev, [challenge.id]: false }));
          }
        };
        fetchVideos();
      }
    }
  }, [expandedChallengeId, challenges]);

  useEffect(() => {
    const timer = setInterval(() => {
      setStrikeFirstIndex(prev => prev + 1);
    }, 2500); 
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (announcements.length <= 1) return;

    const timer = setInterval(() => {
      setAnnouncementDirection(1);
      setAnnouncementIndex(prev => (prev + 1) % announcements.length);
    }, 4500);

    return () => clearInterval(timer);
  }, [announcements]);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const syncProfileUsername = async () => {
      if (!currentUser) {
        setProfileUsername(null);
        return;
      }

      const runtimeUsername = MiniKit.user?.username?.replace(/^@+/, '');
      if (runtimeUsername) {
        setProfileUsername(runtimeUsername);
        return;
      }

      try {
        const userInfo = await MiniKit.getUserByAddress(currentUser.uid);
        const fetchedUsername = userInfo?.username?.replace(/^@+/, '');
        if (!isCancelled) {
          setProfileUsername(fetchedUsername || null);
        }
      } catch (error) {
        if (!isCancelled) {
          setProfileUsername(null);
        }
        console.error('Failed to resolve World App username:', error);
      }
    };

    void syncProfileUsername();

    return () => {
      isCancelled = true;
    };
  }, [currentUser]);

  useEffect(() => {
    let isCancelled = false;

    const loadUnonBalance = async () => {
      if (!currentUser || isChainConfigLoading) {
        setUnonBalance(null);
        return;
      }
      if (!profileWalletAddress || !isLikelyAddress(UNON_TOKEN_ADDRESS)) {
        setUnonBalance(null);
        return;
      }

      try {
        const rawBalance = await worldchainPublicClient.readContract({
          address: UNON_TOKEN_ADDRESS,
          abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [profileWalletAddress],
        });

        if (!isCancelled) {
          setUnonBalance(formatUnits(rawBalance, 18));
        }
      } catch (error) {
        if (!isCancelled) {
          setUnonBalance(null);
        }
        console.error('Failed to load UNON balance:', error);
      }
    };

    void loadUnonBalance();

    return () => {
      isCancelled = true;
    };
  }, [
    currentUser,
    isChainConfigLoading,
    profileWalletAddress,
    UNON_TOKEN_ADDRESS,
    worldchainPublicClient,
    userData?.onboardingClaimed,
    userData?.onboardingClaimPendingHash,
  ]);

  const loadChallenges = async () => {
    setIsLoading(true);
    const [challengeData, announcementData, displaySettings] = await Promise.all([
      getChallenges(),
      getAnnouncements(),
      getPublicSettings()
    ]);
    setChallenges(challengeData);
    setAnnouncements(announcementData);
    setPublicDisplaySettings(displaySettings);
    setAnnouncementIndex(0);
    setIsLoading(false);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  useEffect(() => {
    let isCancelled = false;

    requestInitialMicrophoneAccess()
      .then(() => {
        if (!isCancelled && MiniKit.isInstalled()) {
          console.log('World App microphone permission is ready.');
        }
      })
      .catch((error) => {
        if (isCancelled) return;
        console.warn('Initial microphone permission failed:', error);
        showToast('Microphone permission is required for challenge recording.');
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  const openJoinChallengeModal = (challenge: Challenge, options: { keepRemixSource?: boolean } = {}) => {
    if (!options.keepRemixSource) setSelectedRemixSource(null);
    setSelectedChallenge(challenge);
    setCameraPermissionError('');
  };

  const requestCameraAndJoinChallenge = async (mode: 'camera' | 'upload' = 'camera') => {
    if (!selectedChallenge || isPreparingCamera) return;

    if (mode === 'camera' && !navigator.mediaDevices?.getUserMedia) {
      const unsupportedMessage = 'This device does not support in-app camera access. Please open the mini app in World App and try again.';
      setCameraPermissionError(unsupportedMessage);
      showToast(unsupportedMessage);
      return;
    }

    setIsPreparingCamera(true);
    setCameraPermissionError('');

    try {
      await joinChallenge(selectedChallenge.id);
      setChallenges(prev =>
        prev.map(c => (c.id === selectedChallenge.id ? { ...c, participants: c.participants + 1 } : c))
      );
      setCameraEntryMode(mode);
      setShowCamera(true);
      showToast(mode === 'camera' ? 'Allow camera access to record your challenge entry.' : 'Choose a video to upload for this challenge.');
    } catch (err) {
      const message = getReadableErrorMessage(err) || 'Failed to join this challenge. Please try again.';
      setCameraPermissionError(message);
      showToast(message);
      console.error('Challenge join failed:', err);
    } finally {
      setIsPreparingCamera(false);
    }
  };

  const submitExistingVideoFile = async (file: File) => {
    if (!selectedChallenge || isPreparingCamera) return;
    const challenge = selectedChallenge;

    setIsPreparingCamera(true);
    setCameraPermissionError('');

    try {
      await joinChallenge(challenge.id);
      setChallenges(prev =>
        prev.map(c => (c.id === challenge.id ? { ...c, participants: c.participants + 1 } : c))
      );
      setSelectedUploadBlob(file);
      setCameraEntryMode('upload');
      setShowCamera(true);
      showToast('Opening U&On Studio...');
    } catch (err) {
      const message = getReadableErrorMessage(err) || 'Failed to join this challenge. Please try again.';
      setCameraPermissionError(message);
      showToast(message);
      console.error('Challenge upload join failed:', err);
    } finally {
      setIsPreparingCamera(false);
    }
  };

  const openExistingVideoPicker = () => {
    if (!selectedChallenge || isPreparingCamera) return;
    setCameraPermissionError('');
    setShowUploadGuidanceModal(true);
  };

  const openExistingVideoPickerDirect = async () => {
    if (!selectedChallenge || isPreparingCamera) return;
    setCameraPermissionError('');
    uploadVideoInputRef.current?.click();
  };

  const handleExistingVideoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await submitExistingVideoFile(file);
  };

  const getAuthHeaders = async () => {
    if (!currentUser) throw new Error('World ID authentication is required.');
    const token = await currentUser.getIdToken();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };
  };

  const registerPrizeEntryAfterUpload = async (uploadResult: VideoUploadResult) => {
    const entryRegistration = uploadResult.entryRegistration;
    const localChallengeId = selectedChallenge?.id;
    const localVideoId = uploadResult.data?.id ? String(uploadResult.data.id) : '';
    if (!entryRegistration || !localChallengeId || !localVideoId) return;

    if (!currentUser) throw new Error('World ID authentication is required.');
    if (!MiniKit.isInstalled()) throw new Error('Prize entry registration must be confirmed inside World App.');
    if (entryRegistration.chainId !== WORLD_CHAIN_ID) throw new Error('Prize entry registration was prepared for an unsupported chain.');
    if (!isLikelyAddress(entryRegistration.prizeManagerAddress) || !isLikelyAddress(entryRegistration.creator)) {
      throw new Error('Prize entry registration payload is invalid.');
    }
    if (entryRegistration.creator.toLowerCase() !== currentUser.uid.toLowerCase()) {
      throw new Error('Prize entry registration wallet does not match the authenticated World ID wallet.');
    }

    const registrationCalldata = encodeFunctionData({
      abi: PRIZE_MANAGER_ABI,
      functionName: 'registerEntryWithSignature',
      args: [
        entryRegistration.challengeId,
        entryRegistration.videoId,
        entryRegistration.creator,
        BigInt(entryRegistration.deadline),
        entryRegistration.signature
      ]
    });

    showToast('Confirm prize entry registration in World App.');
    const transactionResult = await MiniKit.sendTransaction({
      chainId: WORLD_CHAIN_ID,
      transactions: [{ to: entryRegistration.prizeManagerAddress, data: registrationCalldata }]
    });

    const userOpHash = transactionResult?.data?.userOpHash || null;
    if (!userOpHash) throw new Error('World App did not return a prize entry registration hash.');
    const receiptResult = await waitForMiniKitClaimReceipt(userOpHash, 120_000);
    if (!receiptResult || receiptResult.receipt.status !== 'success') {
      throw new Error('Prize entry registration is still pending or failed.');
    }

    const headers = await getAuthHeaders();
    const confirmResponse = await fetch(apiUrl(`/api/prize-challenges/${localChallengeId}/videos/${localVideoId}/register/confirm`), {
      method: 'POST',
      headers,
      body: JSON.stringify({ txHash: receiptResult.transactionHash })
    });
    const confirmed = await confirmResponse.json();
    if (!confirmed.success) throw new Error(confirmed.error || 'Prize entry registration confirmation failed.');

    showToast(`Prize entry registered on ${WORLD_CHAIN_LABEL}.`);
    await loadPrizeStatus(localChallengeId);
    await loadChallenges();
  };

  const handleVideoUploadComplete = async (uploadResult?: VideoUploadResult) => {
    if (uploadResult?.entryRegistration) {
      await registerPrizeEntryAfterUpload(uploadResult);
    }
    setShowCamera(false);
    setSelectedChallenge(null);
    setSelectedUploadBlob(null);
    setSelectedRemixSource(null);
    setShowUploadGuidanceModal(false);
    setToast(uploadResult?.entryRegistration ? 'Video uploaded and prize entry registered!' : 'Video uploaded successfully!');
    setTimeout(() => setToast(''), 3000);
  };

  const updatePrizeWinnerCount = (winnerCount: number) => {
    const nextCount = Math.max(1, Math.min(10, winnerCount));
    const evenSplit = Math.floor(10000 / nextCount);
    const splits = Array.from({ length: nextCount }, (_, index) =>
      index === nextCount - 1 ? 10000 - evenSplit * (nextCount - 1) : evenSplit
    );
    setPrizeForm(prev => ({ ...prev, winnerCount: nextCount, winnerSplitsBps: splits }));
  };

  const getPrizeWinnerPoolUnon = () => {
    const prizePool = Number(prizeForm.prizePoolUnon || 0);
    return Number.isFinite(prizePool) ? Math.max(0, prizePool * 0.97) : 0;
  };

  const getPrizeSplitAmount = (splitBps: number) => {
    const winnerPool = getPrizeWinnerPoolUnon();
    return winnerPool > 0 ? (winnerPool * splitBps) / 10000 : 0;
  };

  const splitPrizeDateTime = (value: string) => {
    const [date = '', rawTime = ''] = value.split('T');
    return { date, time: rawTime.slice(0, 5) };
  };

  const getPrizeDateTimeParts = (value: string) => {
    const now = new Date();
    const { date, time } = splitPrizeDateTime(value);
    const [year = String(now.getFullYear()), month = String(now.getMonth() + 1).padStart(2, '0'), day = String(now.getDate()).padStart(2, '0')] = date.split('-');
    const [hour = '23', minute = '59'] = time.split(':');
    return { year, month, day, hour, minute };
  };

  const updatePrizeDateTimePart = (
    field: 'submissionEnd' | 'votingEnd',
    part: 'year' | 'month' | 'day' | 'hour' | 'minute',
    value: string
  ) => {
    setPrizeForm(prev => {
      const parts = { ...getPrizeDateTimeParts(prev[field]), [part]: value };
      const maxDay = new Date(Number(parts.year), Number(parts.month), 0).getDate();
      const safeDay = String(Math.min(Number(parts.day), maxDay)).padStart(2, '0');
      const nextDateTime = `${parts.year}-${parts.month}-${safeDay}T${parts.hour}:${parts.minute}`;
      const next = { ...prev, [field]: nextDateTime };
      if (prev.syncEndDate && ['year', 'month', 'day'].includes(part)) {
        const otherField = field === 'submissionEnd' ? 'votingEnd' : 'submissionEnd';
        const otherParts = getPrizeDateTimeParts(prev[otherField]);
        next[otherField] = `${parts.year}-${parts.month}-${safeDay}T${otherParts.hour}:${otherParts.minute}`;
      }
      return next;
    });
  };

  const togglePrizeEndDateSync = (enabled: boolean) => {
    setPrizeForm(prev => {
      if (!enabled) return { ...prev, syncEndDate: false };
      const missionParts = getPrizeDateTimeParts(prev.submissionEnd);
      const voteParts = getPrizeDateTimeParts(prev.votingEnd);
      return {
        ...prev,
        syncEndDate: true,
        votingEnd: `${missionParts.year}-${missionParts.month}-${missionParts.day}T${voteParts.hour}:${voteParts.minute}`
      };
    });
  };

  const updatePrizeSplit = (index: number, percentValue: string) => {
    const percent = Number(percentValue);
    const bps = Number.isFinite(percent) ? Math.max(0, Math.round(percent * 100)) : 0;
    setPrizeForm(prev => {
      const next = [...prev.winnerSplitsBps];
      next[index] = bps;
      return { ...prev, winnerSplitsBps: next };
    });
  };

  const updatePrizeSplitAmount = (index: number, amountValue: string) => {
    const amount = Number(amountValue);
    const winnerPool = getPrizeWinnerPoolUnon();
    const bps = Number.isFinite(amount) && winnerPool > 0
      ? Math.max(0, Math.round((amount / winnerPool) * 10000))
      : 0;
    setPrizeForm(prev => {
      const next = [...prev.winnerSplitsBps];
      next[index] = bps;
      return { ...prev, winnerSplitsBps: next };
    });
  };

  const getPrizeSplitTotal = () => prizeForm.winnerSplitsBps.reduce((sum, item) => sum + item, 0);

  const loadPrizeStatus = async (challengeId: string) => {
    try {
      const response = await fetch(apiUrl(`/api/prize-challenges/${challengeId}/status`), { method: 'POST' });
      const data = await response.json();
      if (data.success && data.data?.onchain) {
        setPrizeStatusMap(prev => ({ ...prev, [challengeId]: data.data.onchain }));
        if (data.data.challenge) {
          setChallenges(prev => prev.map(c => c.id === challengeId ? { ...c, ...data.data.challenge } : c));
        }
      }
    } catch (error) {
      console.error('Prize status load failed:', error);
    }
  };

  const handleCreatePrizeChallenge = async () => {
    if (!currentUser) {
      showToast('World ID authentication is required.');
      return;
    }
    if (!MiniKit.isInstalled()) {
      showToast('Prize challenges must be created inside World App.');
      return;
    }
    if (!isLikelyAddress(UNON_PRIZE_MANAGER_ADDRESS)) {
      showToast('Prize manager address is not configured in the frontend env.');
      return;
    }
    if (!isLikelyAddress(UNON_STAKING_MANAGER_ADDRESS)) {
      showToast('Staking manager address is not configured in the frontend env.');
      return;
    }

    const numericUnonBalance = Number(unonBalance || 0);
    if (!isAdminUser && numericUnonBalance < PLATINUM_PRIZE_MIN_UNON) {
      showToast('PLATINUM badge requires 10,000+ UNON to create prize challenges.');
      return;
    }
    if (!createForm.title || !createForm.hashtags) {
      showToast('Title and hashtags are required.');
      return;
    }
    if (!prizeForm.submissionEnd || !prizeForm.votingEnd) {
      showToast('Submission and voting deadlines are required.');
      return;
    }
    if (getPrizeSplitTotal() !== 10000) {
      showToast('Winner splits must total 100%.');
      return;
    }

    setIsCreating(true);
    try {
      const headers = await getAuthHeaders();
      const prepareResponse = await fetch(apiUrl('/api/prize-challenges/prepare'), {
        method: 'POST',
        headers,
        body: JSON.stringify({})
      });
      const prepared = await prepareResponse.json();
      if (!prepared.success) throw new Error(prepared.error || 'Failed to prepare prize challenge.');

      const prizeAmount = parseUnits(prizeForm.prizePoolUnon || '0', 18);
      const submissionStart = BigInt(Math.floor((Date.now() + 60_000) / 1000));
      const submissionEnd = BigInt(Math.floor(new Date(prizeForm.submissionEnd).getTime() / 1000));
      const votingEnd = BigInt(Math.floor(new Date(prizeForm.votingEnd).getTime() / 1000));
      if (!(submissionStart < submissionEnd && submissionEnd < votingEnd)) {
        throw new Error('Voting deadline must be after submission deadline, and both must be in the future.');
      }

      const walletAddress = currentUser.uid as `0x${string}`;
      let availableStake = 0n;
      if (isLikelyAddress(walletAddress)) {
        availableStake = await worldchainPublicClient.readContract({
          address: UNON_STAKING_MANAGER_ADDRESS,
          abi: STAKING_MANAGER_ABI,
          functionName: 'availableStakeOf',
          args: [walletAddress]
        });
      }
      const requiredStake = parseUnits(String(PLATINUM_PRIZE_MIN_UNON), 18);
      const stakeShortfall = availableStake >= requiredStake ? 0n : requiredStake - availableStake;

      showToast(stakeShortfall > 0n ? 'Confirm UNON staking and prize escrow in World App.' : 'Confirm UNON prize escrow in World App.');
      const createCalldata = encodeFunctionData({
        abi: PRIZE_MANAGER_ABI,
        functionName: 'createChallenge',
        args: [
          prepared.data.onchainChallengeId,
          prizeAmount,
          submissionStart,
          submissionEnd,
          votingEnd,
          prizeForm.winnerCount,
          prizeForm.winnerSplitsBps
        ]
      });
      const approveCalldata = encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: 'approve',
        args: [UNON_PRIZE_MANAGER_ADDRESS, prizeAmount]
      });
      const transactions: Array<{ to: `0x${string}`; data: `0x${string}` }> = [];
      if (stakeShortfall > 0n) {
        transactions.push({
          to: UNON_TOKEN_ADDRESS,
          data: encodeFunctionData({
            abi: ERC20_APPROVE_ABI,
            functionName: 'approve',
            args: [UNON_STAKING_MANAGER_ADDRESS, stakeShortfall]
          })
        });
        transactions.push({
          to: UNON_STAKING_MANAGER_ADDRESS,
          data: encodeFunctionData({
            abi: STAKING_MANAGER_ABI,
            functionName: 'stake',
            args: [stakeShortfall]
          })
        });
      }
      transactions.push({ to: UNON_TOKEN_ADDRESS, data: approveCalldata });
      transactions.push({ to: UNON_PRIZE_MANAGER_ADDRESS, data: createCalldata });

      const transactionResult = await MiniKit.sendTransaction({
        chainId: WORLD_CHAIN_ID,
        transactions
      });

      const userOpHash = transactionResult?.data?.userOpHash || null;
      if (!userOpHash) throw new Error('World App did not return a transaction hash.');

      const receiptResult = await waitForMiniKitClaimReceipt(userOpHash, 180_000);
      if (!receiptResult || receiptResult.receipt.status !== 'success') {
        throw new Error('Prize challenge transaction is still pending or failed.');
      }

      const confirmResponse = await fetch(apiUrl('/api/prize-challenges/confirm'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          localChallengeId: prepared.data.localChallengeId,
          onchainChallengeId: prepared.data.onchainChallengeId,
          txHash: receiptResult.transactionHash,
          title: createForm.title,
          hashtags: createForm.hashtags,
          region: createForm.region,
          prizePoolUnon: prizeForm.prizePoolUnon,
          submissionStart: new Date(Number(submissionStart) * 1000).toISOString(),
          submissionEnd: prizeForm.submissionEnd,
          votingEnd: prizeForm.votingEnd,
          winnerCount: prizeForm.winnerCount,
          winnerSplitsBps: prizeForm.winnerSplitsBps,
          bgGradient: createForm.region.includes('Korea') ? 'linear-gradient(45deg, #0047A0, #CD2E3A)' :
                      createForm.region.includes('USA') ? 'linear-gradient(45deg, #B22234, #3C3B6E)' :
                      'linear-gradient(135deg, #111827, #f59e0b)',
          createdByName: currentUser.displayName || 'Prize Host'
        })
      });
      const confirmed = await confirmResponse.json();
      if (!confirmed.success) throw new Error(confirmed.error || 'Failed to confirm prize challenge.');

      showToast('Prize challenge launched on-chain.');
      setCreateForm({ title: '', hashtags: '', region: REGIONS[0] });
      setPrizeForm(createDefaultPrizeForm());
      await loadChallenges();
      setCurrentTab('battle');
    } catch (error) {
      console.error('Prize challenge launch failed:', error);
      showToast(`Prize launch failed: ${getReadableErrorMessage(error)}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createMode === 'prize') {
      await handleCreatePrizeChallenge();
      return;
    }
    if (!createForm.title || !createForm.hashtags) {
      showToast('⚠️ Title and hashtags are required!');
      return;
    }

    if (!currentUser) {
      showToast('World ID authentication is still in progress. Please wait a moment and try again.');
      setCurrentTab('profile');
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch(apiUrl('/api/challenges'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createForm.title,
          hashtags: createForm.hashtags,
          region: createForm.region,
          viralScore: 1000,
          participants: 0,
          bgGradient: createForm.region.includes('Korea') ? 'linear-gradient(45deg, #0047A0, #CD2E3A)' : 
                       createForm.region.includes('USA') ? 'linear-gradient(45deg, #B22234, #3C3B6E)' : 
                       'linear-gradient(135deg, #111827, #f59e0b)',
          createdByUid: currentUser.uid,
          createdByName: currentUser.displayName || 'Warrior',
          challengeMode: 'battle',
          notice: 'Creator-run Battle ON challenge',
          eventConfig: { type: 'custom_builder', modes: ['video_submission', 'vote', 'donation_ranking', 'operator_judging'] }
        })
      });
      
      const data = await response.json();
      if (data.success) {
        showToast('🚀 Challenge Launched & Crawling Content!');
        setCreateForm({ title: '', hashtags: '', region: REGIONS[0] });
        
        // Refresh feed data
        const refreshResponse = await fetch(apiUrl('/api/challenges'));
        const refreshData = await refreshResponse.json();
        if (refreshData.success) {
          setChallenges(refreshData.data);
        }

        setTimeout(() => {
          setCurrentTab('battle');
          setIsCreating(false);
        }, 2000);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      showToast('⚠️ Launch Failed. Try again!');
      setIsCreating(false);
      console.error(err);
    }
  };

  const handlePrizeVideoVote = async (challenge: Challenge, video: ChallengeOnVideo) => {
    if (!currentUser) {
      showToast('World ID authentication is required.');
      return;
    }
    if (!MiniKit.isInstalled()) {
      showToast('UNON voting must be confirmed inside World App.');
      return;
    }
    if (!isLikelyAddress(UNON_PRIZE_MANAGER_ADDRESS) || !challenge.prizeOnchainChallengeId || !video.onchainVideoId) {
      showToast('This prize video is not ready for on-chain voting.');
      return;
    }

    const loadingKey = `vote:${challenge.id}:${video.id}`;
    setPrizeActionLoading(prev => ({ ...prev, [loadingKey]: true }));
    try {
      const voteAmount = parseUnits('1', 18);
      const approveCalldata = encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: 'approve',
        args: [UNON_PRIZE_MANAGER_ADDRESS, voteAmount]
      });
      const voteCalldata = encodeFunctionData({
        abi: PRIZE_MANAGER_ABI,
        functionName: 'voteVideo',
        args: [challenge.prizeOnchainChallengeId as `0x${string}`, video.onchainVideoId as `0x${string}`]
      });

      showToast('Confirm 1 UNON vote in World App.');
      const transactionResult = await MiniKit.sendTransaction({
        chainId: WORLD_CHAIN_ID,
        transactions: [
          { to: UNON_TOKEN_ADDRESS, data: approveCalldata },
          { to: UNON_PRIZE_MANAGER_ADDRESS, data: voteCalldata }
        ]
      });
      const userOpHash = transactionResult?.data?.userOpHash || null;
      if (!userOpHash) throw new Error('World App did not return a vote hash.');
      const receiptResult = await waitForMiniKitClaimReceipt(userOpHash, 120_000);
      if (!receiptResult || receiptResult.receipt.status !== 'success') {
        throw new Error('Vote transaction is still pending or failed.');
      }

      const headers = await getAuthHeaders();
      const confirmResponse = await fetch(apiUrl(`/api/prize-challenges/${challenge.id}/videos/${video.id}/vote/confirm`), {
        method: 'POST',
        headers,
        body: JSON.stringify({ txHash: receiptResult.transactionHash })
      });
      const confirmed = await confirmResponse.json();
      if (!confirmed.success) throw new Error(confirmed.error || 'Vote confirmation failed.');

      showToast('1 UNON vote confirmed.');
      await loadPrizeStatus(challenge.id);
    } catch (error) {
      console.error('Prize vote failed:', error);
      showToast(`Vote failed: ${getReadableErrorMessage(error)}`);
    } finally {
      setPrizeActionLoading(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  const handlePrizeFinalize = async (challenge: Challenge) => {
    if (!currentUser) {
      showToast('World ID authentication is required.');
      return;
    }
    if (!MiniKit.isInstalled()) {
      showToast('Finalization must be confirmed inside World App.');
      return;
    }
    if (!isLikelyAddress(UNON_PRIZE_MANAGER_ADDRESS) || !challenge.prizeOnchainChallengeId) {
      showToast('Prize manager is not ready.');
      return;
    }

    const loadingKey = `finalize:${challenge.id}`;
    setPrizeActionLoading(prev => ({ ...prev, [loadingKey]: true }));
    try {
      const finalizeCalldata = encodeFunctionData({
        abi: PRIZE_MANAGER_ABI,
        functionName: 'finalize',
        args: [challenge.prizeOnchainChallengeId as `0x${string}`]
      });
      showToast('Confirm prize finalization in World App.');
      const transactionResult = await MiniKit.sendTransaction({
        chainId: WORLD_CHAIN_ID,
        transactions: [{ to: UNON_PRIZE_MANAGER_ADDRESS, data: finalizeCalldata }]
      });
      const userOpHash = transactionResult?.data?.userOpHash || null;
      if (!userOpHash) throw new Error('World App did not return a finalization hash.');
      const receiptResult = await waitForMiniKitClaimReceipt(userOpHash, 180_000);
      if (!receiptResult || receiptResult.receipt.status !== 'success') {
        throw new Error('Finalization transaction is still pending or failed.');
      }

      const headers = await getAuthHeaders();
      const confirmResponse = await fetch(apiUrl(`/api/prize-challenges/${challenge.id}/finalize/confirm`), {
        method: 'POST',
        headers,
        body: JSON.stringify({ txHash: receiptResult.transactionHash })
      });
      const confirmed = await confirmResponse.json();
      if (!confirmed.success) throw new Error(confirmed.error || 'Finalization confirmation failed.');

      showToast('Prize challenge finalized.');
      await loadChallenges();
      await loadPrizeStatus(challenge.id);
    } catch (error) {
      console.error('Prize finalization failed:', error);
      showToast(`Finalize failed: ${getReadableErrorMessage(error)}`);
    } finally {
      setPrizeActionLoading(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  const handleClaimWinningVoterReward = async (challenge: Challenge) => {
    if (!currentUser || !challenge.prizeOnchainChallengeId || !isLikelyAddress(UNON_PRIZE_MANAGER_ADDRESS)) return;
    const loadingKey = `claim:${challenge.id}`;
    setPrizeActionLoading(prev => ({ ...prev, [loadingKey]: true }));
    try {
      const claimCalldata = encodeFunctionData({
        abi: PRIZE_MANAGER_ABI,
        functionName: 'claimWinningVoterReward',
        args: [challenge.prizeOnchainChallengeId as `0x${string}`]
      });
      showToast('Confirm voter reward claim in World App.');
      const transactionResult = await MiniKit.sendTransaction({
        chainId: WORLD_CHAIN_ID,
        transactions: [{ to: UNON_PRIZE_MANAGER_ADDRESS, data: claimCalldata }]
      });
      const userOpHash = transactionResult?.data?.userOpHash || null;
      if (!userOpHash) throw new Error('World App did not return a claim hash.');
      const receiptResult = await waitForMiniKitClaimReceipt(userOpHash, 120_000);
      if (!receiptResult || receiptResult.receipt.status !== 'success') {
        throw new Error('Claim transaction is still pending or failed.');
      }
      setClaimedPrizeRewards(prev => ({ ...prev, [challenge.id]: true }));
      showToast('Winning voter reward claimed.');
    } catch (error) {
      console.error('Prize reward claim failed:', error);
      showToast(`Claim failed: ${getReadableErrorMessage(error)}`);
    } finally {
      setPrizeActionLoading(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  const handleShareToInstagram = () => {
    if (selectedChallenge) {
      navigator.clipboard.writeText(selectedChallenge.hashtags);
    showToast('📋 Hashtags copied! Open Instagram to share.');
    }
  };

  const getPrizePhase = (challenge: Challenge) => {
    if (challenge.prizeStatus === 'finalized' || challenge.prizeStatus === 'no_contest') return challenge.prizeStatus;
    const now = Date.now();
    const submissionEnd = challenge.prizeSubmissionEnd ? new Date(challenge.prizeSubmissionEnd).getTime() : 0;
    const votingEnd = challenge.prizeVotingEnd ? new Date(challenge.prizeVotingEnd).getTime() : 0;
    if (submissionEnd && now <= submissionEnd) return 'submitting';
    if (votingEnd && now <= votingEnd) return 'voting';
    if (votingEnd && now > votingEnd) return 'pending_finalize';
    return challenge.prizeStatus || 'scheduled';
  };

  const renderPrizeVideoControls = (challenge: Challenge | undefined, video: ChallengeOnVideo) => {
    if (!challenge || challenge.challengeType !== 'prize') return null;
    const phase = getPrizePhase(challenge);
    const status = prizeStatusMap[challenge.id];
    const entry = status?.entries?.find(item => item.videoId?.toLowerCase() === video.onchainVideoId?.toLowerCase());
    const voteCount = entry?.votes ?? 0;
    const loadingKey = `vote:${challenge.id}:${video.id}`;
    const isVoteOpen = phase === 'voting' && video.prizeEligible && !!video.onchainVideoId;

    return (
      <div className="prize-video-controls">
        <span>{voteCount} UNON votes</span>
        {video.prizeEligible ? (
          <button
            type="button"
            disabled={!isVoteOpen || !!prizeActionLoading[loadingKey]}
            onClick={(event) => {
              event.stopPropagation();
              void handlePrizeVideoVote(challenge, video);
            }}
          >
            {prizeActionLoading[loadingKey] ? 'Voting...' : 'Vote 1 UNON'}
          </button>
        ) : (
          <small>Prize entries require WorldID uploads</small>
        )}
      </div>
    );
  };

  const renderPrizeChallengeActions = (challenge: Challenge) => {
    if (challenge.challengeType !== 'prize') return null;
    const phase = getPrizePhase(challenge);
    const status = prizeStatusMap[challenge.id];
    const finalizeKey = `finalize:${challenge.id}`;
    const claimKey = `claim:${challenge.id}`;
    const winningReward = status?.voterRewardPerWinningVote ? Number(formatUnits(BigInt(status.voterRewardPerWinningVote), 18)) : 0;

    return (
      <div className="prize-challenge-actions">
        <span>{phase}</span>
        {phase === 'pending_finalize' && (
          <button
            type="button"
            disabled={!!prizeActionLoading[finalizeKey]}
            onClick={(event) => {
              event.stopPropagation();
              void handlePrizeFinalize(challenge);
            }}
          >
            {prizeActionLoading[finalizeKey] ? 'Finalizing...' : 'Finalize'}
          </button>
        )}
        {phase === 'finalized' && winningReward > 0 && !claimedPrizeRewards[challenge.id] && (
          <button
            type="button"
            disabled={!!prizeActionLoading[claimKey]}
            onClick={(event) => {
              event.stopPropagation();
              void handleClaimWinningVoterReward(challenge);
            }}
          >
            {prizeActionLoading[claimKey] ? 'Claiming...' : 'Claim voter reward'}
          </button>
        )}
      </div>
    );
  };

  const listVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
  };

  const formatScore = (s: number | string | undefined) => {
    if (!s || s === 0 || s === 'NEW') return 'NEW';
    const num = Number(s);
    return num >= 1000 ? (num / 1000).toFixed(1) + 'k' : num;
  };

  const moveAnnouncement = (direction: 1 | -1) => {
    if (announcements.length <= 1) return;
    setAnnouncementDirection(direction);
    setAnnouncementIndex(prev => (prev + direction + announcements.length) % announcements.length);
  };

  const handleAnnouncementPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (announcements.length <= 1) return;
    announcementSwipeStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleAnnouncementPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = announcementSwipeStartRef.current;
    announcementSwipeStartRef.current = null;
    if (!start || announcements.length <= 1) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 44 || Math.abs(dx) < Math.abs(dy) * 1.2) return;

    moveAnnouncement(dx < 0 ? 1 : -1);
  };

  const handleAnnouncementAction = (target?: string | null) => {
    if (!target) return;

    if (target === 'profile' || target === '/profile') {
      setCurrentTab('profile');
      return;
    }

    if (target === 'create' || target === '/create') {
      setCurrentTab('create');
      return;
    }

    if (target === 'home' || target === '/home') {
      setCurrentTab('trend');
      return;
    }

    if (/^https?:\/\//.test(target)) {
      window.open(target, '_blank', 'noopener,noreferrer');
    }
  };

  const getVideoScrollIndex = (container: HTMLElement) => {
    const firstChild = container.firstElementChild as HTMLElement | null;
    const itemWidth = firstChild ? firstChild.offsetWidth + 12 : container.clientWidth;
    if (itemWidth <= 0) return 0;

    const maxIndex = Math.max(container.children.length - 1, 0);
    return Math.max(0, Math.min(maxIndex, Math.round(container.scrollLeft / itemWidth)));
  };

  const handleVideoStripScroll = (challengeId: string, container: HTMLElement) => {
    const newIndex = getVideoScrollIndex(container);
    setActiveVideoIndex(prev => (
      prev[challengeId] === newIndex ? prev : { ...prev, [challengeId]: newIndex }
    ));
  };

  const shouldKeepVideoWarm = (challengeId: string, index: number) => {
    const currentIndex = activeVideoIndex[challengeId] ?? 0;
    return Math.abs(currentIndex - index) <= 1;
  };

  const handleOnVideoEnd = (challengeId: string, videoIndex: number) => {
    const currentVideos = challengeVideos[challengeId] || [];
    if (videoIndex >= currentVideos.length - 1) return;

    const nextVideoIndex = videoIndex + 1;
    setActiveVideoIndex(prev => ({ ...prev, [challengeId]: nextVideoIndex }));
    setTimeout(() => {
      const nextEl = document.getElementById(`video-${challengeId}-${nextVideoIndex}`);
      if (nextEl) nextEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, 100);
  };

  const handleOnVideoUnavailable = (challengeId: string, videoId: string, videoIndex: number) => {
    const currentVideos = challengeVideos[challengeId] || [];
    const remainingCount = Math.max(currentVideos.length - 1, 0);

    setChallengeVideos(prev => ({
      ...prev,
      [challengeId]: (prev[challengeId] || []).filter(v => v.id !== videoId)
    }));

    fetch(apiUrl(`/api/videos/${videoId}`), { method: 'DELETE' }).catch(err => {
      console.error("Failed to delete unplayable video:", err);
    });

    if (remainingCount > 0) {
      const nextVideoIndex = Math.min(videoIndex, remainingCount - 1);
      setActiveVideoIndex(prev => ({ ...prev, [challengeId]: nextVideoIndex }));
      setTimeout(() => {
        const nextEl = document.getElementById(`video-${challengeId}-${nextVideoIndex}`);
        if (nextEl) nextEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }, 120);
    }
  };

    const _renderHome = () => {
    const regionalChallenges = activeRegion === REGIONS[0]
      ? challenges
      : challenges.filter(c => c.region === activeRegion || c.region === REGIONS[0]);


    // 2. EDITOR'S CHOICE (Handpicked)
    const editorsChoiceChallenges = regionalChallenges
      .filter(c => EDITORS_CHOICE_TAGS.some(tag => c.id === `trend_${tag}`))
      .sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0));

    // 1. USER CHALLENGES (Current user's history - ALWAYS visible to owner regardless of region)
    const userChallengesList = challenges
      .filter(c => c.createdByUid === currentUser?.uid)
      .sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });

    // STRIKE FIRST (Strictly USER-REGISTERED challenges only / UGC Only)
    const strikeFirstChallenges = challenges
      .filter(c => (c.createdByUid != null || c.id.startsWith('user_')) && (c.createdByUid === currentUser?.uid || activeRegion === REGIONS[0] || c.region === activeRegion || c.region === REGIONS[0]))
      .sort((a, b) => {
        // Prioritize current user's challenges
        const isMineA = a.createdByUid === currentUser?.uid ? 1 : 0;
        const isMineB = b.createdByUid === currentUser?.uid ? 1 : 0;
        if (isMineA !== isMineB) return isMineB - isMineA;
        return (b.viralScore || 0) - (a.viralScore || 0);
      });

    // 3. NEW TRENDS (Recent or Auto-tagged, excluding previous lists)
    const newTrendChallenges = regionalChallenges
      .filter(c => (c.videoCount || 0) > 0 && 
              !userChallengesList.some(uc => uc.id === c.id) &&
              !editorsChoiceChallenges.some(ec => ec.id === c.id) && 
              !strikeFirstChallenges.some(sf => sf.id === c.id) &&
              (c.id.startsWith('auto_') || c.id.startsWith('trend_') || (c.createdAt && new Date().getTime() - new Date(c.createdAt).getTime() < 86400000)))
      .sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0))
      .slice(0, 10);

    // 4. ACTIVE TRENDS (Everything else with content, excluding previous lists)
    const activeTrendChallenges = regionalChallenges
      .filter(c => (c.videoCount || 0) > 0 && 
              !userChallengesList.some(uc => uc.id === c.id) &&
              !editorsChoiceChallenges.some(ec => ec.id === c.id) && 
              !strikeFirstChallenges.some(sf => sf.id === c.id) &&
              !newTrendChallenges.some(nt => nt.id === c.id))
      .sort((a, b) => ((b.videoCount || 0) - (a.videoCount || 0)) || ((b.viralScore || 0) - (a.viralScore || 0)));

    const editorsChoiceDisplay = publicDisplaySettings.editorsChoice;

    const currentStrikeChallenge = strikeFirstChallenges.length > 0 
      ? strikeFirstChallenges[strikeFirstIndex % strikeFirstChallenges.length] 
      : { 
          id: 'placeholder_strike', 
          title: 'FORGE YOUR FIRST ARENA', 
          hashtags: '#CreateTrend #YourStrike', 
          bgGradient: 'linear-gradient(135deg, rgba(0, 255, 255, 0.1), rgba(138, 43, 226, 0.1))',
          isPlaceholder: true,
          videoCount: 0
        } as any;

    const handleVideoEnd = async (challengeId: string, videoIndex: number) => {
      const currentVideos = challengeVideos[challengeId] || [];
      if (videoIndex < currentVideos.length - 1) {
        // Next video in same arena
        const nextVideoIndex = videoIndex + 1;
        setActiveVideoIndex(prev => ({ ...prev, [challengeId]: nextVideoIndex }));
        setTimeout(() => {
          const nextEl = document.getElementById(`video-${challengeId}-${nextVideoIndex}`);
          if (nextEl) nextEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }, 100);
      } else {
        // Category-wise transitions logic
        const goToChallenge = (challenge: Challenge) => {
          toggleExpand(challenge);
          setTimeout(() => {
            const el = document.getElementById(`section-${challenge.id}`) || document.getElementById(`trend-card-${challenge.id}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);
        };

        const restartLoop = async () => {
          showToast('🔄 Refreshing feed & restarting loop...');
          await loadChallenges();
          setActiveVideoIndex({});
          setExpandedChallengeId(null);
          feedRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          // Note: After loadChallenges finishes, the first category (User) will be expanded if available
          setTimeout(() => {
             // Redetermine lists for fresh data (simplified restart)
             window.location.reload(); // Hardest reset for clean loop, but let's try soften
          }, 1000);
        };

        // 1. User Categorization
        const uIdx = userChallengesList.findIndex(c => c.id === challengeId);
        if (uIdx !== -1) {
          if (uIdx < userChallengesList.length - 1) return goToChallenge(userChallengesList[uIdx + 1]);
          if (strikeFirstChallenges.length > 0) return goToChallenge(strikeFirstChallenges[0]);
          if (editorsChoiceChallenges.length > 0) return goToChallenge(editorsChoiceChallenges[0]);
          if (newTrendChallenges.length > 0) return goToChallenge(newTrendChallenges[0]);
          if (activeTrendChallenges.length > 0) return goToChallenge(activeTrendChallenges[0]);
          return restartLoop();
        }

        // Strike First Categorization
        const sfIdx = strikeFirstChallenges.findIndex(c => c.id === challengeId);
        if (sfIdx !== -1) {
          if (sfIdx < strikeFirstChallenges.length - 1) return goToChallenge(strikeFirstChallenges[sfIdx + 1]);
          if (editorsChoiceChallenges.length > 0) return goToChallenge(editorsChoiceChallenges[0]);
          if (newTrendChallenges.length > 0) return goToChallenge(newTrendChallenges[0]);
          if (activeTrendChallenges.length > 0) return goToChallenge(activeTrendChallenges[0]);
          return restartLoop();
        }

        // 2. Editor's Choice
        const ecIdx = editorsChoiceChallenges.findIndex(c => c.id === challengeId);
        if (ecIdx !== -1) {
          if (ecIdx < editorsChoiceChallenges.length - 1) return goToChallenge(editorsChoiceChallenges[ecIdx + 1]);
          if (newTrendChallenges.length > 0) return goToChallenge(newTrendChallenges[0]);
          if (activeTrendChallenges.length > 0) return goToChallenge(activeTrendChallenges[0]);
          return restartLoop();
        }

        // 3. New Trends
        const ntIdx = newTrendChallenges.findIndex(c => c.id === challengeId);
        if (ntIdx !== -1) {
          if (ntIdx < newTrendChallenges.length - 1) return goToChallenge(newTrendChallenges[ntIdx + 1]);
          if (activeTrendChallenges.length > 0) return goToChallenge(activeTrendChallenges[0]);
          return restartLoop();
        }

        // 4. Active Trends
        const atIdx = activeTrendChallenges.findIndex(c => c.id === challengeId);
        if (atIdx !== -1) {
          if (atIdx < activeTrendChallenges.length - 1) return goToChallenge(activeTrendChallenges[atIdx + 1]);
          return restartLoop();
        }
      }
    };

    const handleVideoUnavailable = async (challengeId: string, videoId: string, videoIndex: number) => {
      const currentVideos = challengeVideos[challengeId] || [];
      const remainingCount = Math.max(currentVideos.length - 1, 0);

      setChallengeVideos(prev => ({
        ...prev,
        [challengeId]: (prev[challengeId] || []).filter(v => v.id !== videoId)
      }));

      fetch(apiUrl(`/api/videos/${videoId}`), { method: 'DELETE' }).catch(err => {
        console.error("Failed to delete unplayable video:", err);
      });

      if (remainingCount > 0) {
        const nextVideoIndex = Math.min(videoIndex, remainingCount - 1);
        setActiveVideoIndex(prev => ({ ...prev, [challengeId]: nextVideoIndex }));
        setTimeout(() => {
          const nextEl = document.getElementById(`video-${challengeId}-${nextVideoIndex}`);
          if (nextEl) nextEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }, 120);
        return;
      }

      await handleVideoEnd(challengeId, videoIndex);
    };

    return (
      <motion.main
        ref={feedRef}
        className="feed"
        variants={listVariants}
        initial="hidden"
        animate="show"
        style={{ paddingTop: '20px' }}
      >
        {announcements.length > 0 && (
          <div className="announcement-carousel-container">
            <div className="carousel-header">
              <div className="announcement-live-indicator">
                <div className="live-dot" />
                TOP NOTICE
              </div>
              <div className="carousel-pagination">
                {announcements.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`page-dot ${announcementIndex === i ? 'active' : ''}`}
                    aria-label={`Show notice ${i + 1}`}
                    onClick={() => {
                      if (i === announcementIndex) return;
                      setAnnouncementDirection(i > announcementIndex ? 1 : -1);
                      setAnnouncementIndex(i);
                    }}
                  />
                ))}
              </div>
            </div>

            <div
              className="announcement-swipe-zone"
              onPointerDown={handleAnnouncementPointerDown}
              onPointerUp={handleAnnouncementPointerUp}
              onPointerCancel={() => { announcementSwipeStartRef.current = null; }}
              style={{ position: 'relative', minHeight: '168px', marginTop: '10px', marginBottom: '22px' }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={announcements[announcementIndex].id}
                  initial={{ x: announcementDirection * 32, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: announcementDirection * -32, opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%' }}
                >
                  <div className={`announcement-content ${announcements[announcementIndex].isImportant ? 'important' : ''}`}>
                    <div className="announcement-badge-row">
                      <div className={`announcement-badge ${announcements[announcementIndex].isImportant ? 'important' : ''}`}>
                        {announcements[announcementIndex].isImportant ? 'IMPORTANT EVENT' : 'LATEST NOTICE'}
                      </div>
                      {announcements.length > 1 && (
                        <div className="announcement-count">
                          {announcementIndex + 1}/{announcements.length}
                        </div>
                      )}
                    </div>

                    <h2 className="announcement-title">{announcements[announcementIndex].title}</h2>
                    <p className="announcement-body">{announcements[announcementIndex].body}</p>

                    <div className="announcement-footer">
                      {announcements[announcementIndex].endsAt ? (
                        <div className="announcement-expiry">
                          Until {new Date(announcements[announcementIndex].endsAt as string).toUTCString()}
                        </div>
                      ) : (
                        <div />
                      )}

                      {announcements[announcementIndex].ctaLabel && (
                        <button
                          className="announcement-action-btn"
                          onClick={() => handleAnnouncementAction(announcements[announcementIndex].ctaTarget)}
                        >
                          {announcements[announcementIndex].ctaLabel} <ArrowRight size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        )}
        {/* CATEGORY 1: USER-CREATED ARENAS */}
        {userChallengesList.length > 0 && (
          <div id="section-user-challenges" style={{ marginBottom: '40px' }}>
            <div className="new-trend-header">
              <div className="new-trend-title-container">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '20px', fontWeight: '900', color: 'var(--secondary)' }}>
                  <Users size={22} fill="var(--secondary)"/> My Arena History
                </h3>
                <div style={{ fontSize: '12px', opacity: 0.6, fontWeight: '600' }}>Your Created and Joined Trends</div>
              </div>
            </div>
            
            <div className="new-trend-list">
              {userChallengesList.map((c) => (
                <motion.div 
                  key={c.id}
                  id={`trend-card-${c.id}`}
                  className={`new-trend-card ${expandedChallengeId === c.id ? 'active' : ''}`} 
                  style={{ 
                    minWidth: '220px', 
                    background: 'rgba(0, 255, 255, 0.05)',
                    borderColor: 'rgba(0, 255, 255, 0.2)'
                  }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    toggleExpand(c);
                    setTimeout(() => {
                      const el = document.getElementById(`trend-card-${c.id}`);
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                    }, 50);
                  }}
                >
                  <div className="trend-tag" style={{ background: 'rgba(0, 255, 255, 0.2)', color: 'var(--secondary)' }}>
                    MY CHALLENGE
                  </div>
                  <div className="trend-title" style={{ fontSize: '19px' }}>{c.title}</div>
                  <div className="trend-footer">
                    <div className="entry-count-pill" style={{ background: 'rgba(0, 255, 255, 0.1)' }}>
                      <Video size={10} fill="var(--secondary)" />
                      <span style={{ color: 'var(--secondary)' }}>{c.videoCount || 0}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Expanded Video Section for User Challenges */}
            <AnimatePresence>
              {expandedChallengeId && userChallengesList.some(uc => uc.id === expandedChallengeId) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="full-bleed-section"
                >
                  <div id={`challenge-${expandedChallengeId}`} className="new-trend-expanded-container" style={{ borderColor: 'rgba(0, 255, 255, 0.3)', background: 'linear-gradient(to bottom, rgba(0, 255, 255, 0.05), rgba(0,0,0,0))' }}>
                    <div className="expanded-arena-header">
                       <div className="battling-badge" style={{ background: 'var(--secondary)', color: '#000' }}>YOUR ARENA</div>
                       <h2 className="expanded-arena-title">{challenges.find(ch => ch.id === expandedChallengeId)?.title}</h2>
                    </div>
                    
                    <div
                      className="video-horizontal-scroll"
                      onScroll={(e) => handleVideoStripScroll(expandedChallengeId, e.currentTarget)}
                    >
                      {(challengeVideos[expandedChallengeId] || []).map((video, vIdx) => (
                        <div key={video.id} id={`video-${expandedChallengeId}-${vIdx}`} className={`video-card-wrapper ${activeVideoIndex[expandedChallengeId] === vIdx ? 'active' : ''}`}>
                           <VideoPlayer 
                             video={video} 
                             isActive={(activeVideoIndex[expandedChallengeId] ?? 0) === vIdx}
                             shouldPreload={shouldKeepVideoWarm(expandedChallengeId, vIdx)}
                             isMuted={false}
                             onEnded={() => handleVideoEnd(expandedChallengeId, vIdx)}
                             onDelete={() => handleVideoUnavailable(expandedChallengeId, video.id, vIdx)}
                           />
                        </div>
                      ))}
                      {loadingVideos[expandedChallengeId] && (
                        <div className="video-card-wrapper loading">
                            <div className="loading-spinner" />
                            <span>Fetching Entries...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* STRIKE FIRST HERO CAROUSEL */}
        <div id="section-strike-first" className="strike-carousel-container" style={{ marginBottom: '0' }}>
           <div className="carousel-header">
             <div className="strike-live-indicator">
               <div className="live-dot" />
               STRIKE FIRST (USER)
             </div>
             <div className="carousel-pagination">
               {strikeFirstChallenges.length > 0 ? strikeFirstChallenges.map((_, i) => {
                 const activeIdx = strikeFirstIndex % strikeFirstChallenges.length;
                 const distance = Math.abs(i - activeIdx);
                 if (strikeFirstChallenges.length > 9 && distance > 3) return null;
                 return (
                   <div 
                     key={i} 
                     className={`page-dot ${activeIdx === i ? 'active' : ''}`} 
                   />
                 );
               }) : <div className="page-dot active" />}
             </div>
           </div>

           <div style={{ position: 'relative', minHeight: '210px', marginTop: '10px' }}>
             <AnimatePresence>
               <motion.div
                 key={currentStrikeChallenge.id}
                 initial={{ x: 30, opacity: 0 }}
                 animate={{ x: 0, opacity: 1 }}
                 exit={{ x: -30, opacity: 0 }}
                 transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
                 className="strike-hero-item"
                 style={{ position: 'absolute', top: 0, left: 0, width: '100%' }}
                 onClick={async () => {
                   if (currentStrikeChallenge.isPlaceholder) {
                     setCurrentTab('create');
                     return;
                   }
                   openJoinChallengeModal(currentStrikeChallenge);
                   return;
                   try {
                     await navigator.clipboard.writeText(currentStrikeChallenge.hashtags);
                     showToast('📋 Hashtags copied! Be the first to strike!');
                     await joinChallenge(currentStrikeChallenge.id);
                     setChallenges(prev => prev.map(c => c.id === currentStrikeChallenge.id ? { ...c, participants: c.participants + 1 } : c));
                     setShowCamera(true);
                   } catch (err) {
                     console.error("Hero Claim failed:", err);
                   }
                 }}
               >
                  <div className="hero-content" style={{ 
                    background: currentStrikeChallenge.bgGradient || 'linear-gradient(135deg, #1a1a1a, #000)',
                    border: currentStrikeChallenge.isPlaceholder ? '2px dashed rgba(0, 255, 255, 0.3)' : '1px solid rgba(0, 255, 255, 0.2)',
                    position: 'relative',
                    color: '#fff'
                  }}>
                     <h2 className="hero-title" style={{ color: '#fff' }}>{currentStrikeChallenge.title}</h2>
                     <div className="hero-desc" style={{ color: 'rgba(255,255,255,0.8)' }}>
                        {currentStrikeChallenge.isPlaceholder 
                          ? 'Be the first to ignite a global wave. Forge your arena now!' 
                          : 'No entries yet. Be the first to start the trend!'}
                     </div>
                     
                     {!currentStrikeChallenge.isPlaceholder && currentUser?.uid === currentStrikeChallenge.createdByUid && (
                       <div className="hero-managed-actions" style={{ position: 'absolute', top: '15px', right: '15px', display: 'flex', gap: '10px' }}>
                         <button 
                           className="action-icon-btn" 
                           onClick={(e) => { e.stopPropagation(); handleEditChallenge(currentStrikeChallenge.id, e); }}
                           style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', padding: '8px', color: '#fff' }}
                         >
                           <Edit size={16} />
                         </button>
                         {(currentStrikeChallenge.videoCount || 0) === 0 && (
                           <button 
                             className="action-icon-btn" 
                             onClick={(e) => { e.stopPropagation(); handleDeleteChallenge(currentStrikeChallenge.id, e); }}
                             style={{ background: 'rgba(255,40,40,0.2)', border: 'none', borderRadius: '50%', padding: '8px', color: '#ff4b2b' }}
                           >
                             <Trash2 size={16} />
                           </button>
                         )}
                       </div>
                     )}

                     <div className="hero-footer">
                        <div className="hero-action-btn">
                          {currentStrikeChallenge.isPlaceholder ? 'FORGE NOW' : 'PARTICIPATE'} <ArrowRight size={14}/>
                        </div>
                     </div>
                  </div>
               </motion.div>
             </AnimatePresence>
           </div>
        </div>
        {/* MAR 2026 EDITOR'S CHOICE SECTION */}
        {editorsChoiceChallenges.length > 0 && (
          <div id="section-editors-choice" style={{ marginBottom: '30px' }}>
            <div className="new-trend-header">
              <div className="new-trend-title-container">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '20px', fontWeight: '900', color: '#fbbf24' }}>
                  <Star size={22} fill="#fbbf24"/> {editorsChoiceDisplay.title}
                </h3>
                <div style={{ fontSize: '12px', opacity: 0.6, fontWeight: '600' }}>{editorsChoiceDisplay.subtitle}</div>
              </div>
            </div>
            
            <div className="new-trend-list">
              {editorsChoiceChallenges.map((c, idx) => {
                const isAI = ['nanobanana', 'agenticAI', 'generativevlog', 'aifilterchallenge'].some(tag => c.id === `trend_${tag}`);
                return (
                  <motion.div 
                    key={c.id}
                    id={`trend-card-${c.id}`}
                    className={`new-trend-card ${expandedChallengeId === c.id ? 'active' : ''}`} 
                    style={{ 
                      minWidth: '240px', 
                      background: 'rgba(251, 191, 36, 0.05)',
                      borderColor: 'rgba(251, 191, 36, 0.2)',
                      boxShadow: expandedChallengeId === c.id ? '0 0 20px rgba(251, 191, 36, 0.2)' : 'none'
                    }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => {
                      toggleExpand(c);
                      setTimeout(() => {
                        const el = document.getElementById(`trend-card-${c.id}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                      }, 50);
                    }}
                  >
                    <div className="trend-tag" style={{ background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24' }}>
                      <Award size={10} fill="currentColor" /> {isAI ? editorsChoiceDisplay.aiBadge : editorsChoiceDisplay.defaultBadge}
                    </div>
                    
                    <div className="trend-title" style={{ fontSize: '19px' }}>{c.title}</div>
                    
                    <div className="trend-footer">
                      <div className="entry-count-pill" style={{ background: 'rgba(251, 191, 36, 0.1)' }}>
                        <Video size={10} fill="#fbbf24" />
                        <span style={{ color: '#fbbf24' }}>{c.videoCount || 0}</span>
                      </div>
                      <div style={{ fontSize: '9px', fontWeight: '900', color: '#fbbf24', letterSpacing: '1px' }}>
                        {[editorsChoiceDisplay.rankingPrefix, idx + 1, editorsChoiceDisplay.rankingSuffix].filter(Boolean).join(' ')}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Expanded Video Section for Editor's Choice */}
            <AnimatePresence>
              {expandedChallengeId && editorsChoiceChallenges.some(ec => ec.id === expandedChallengeId) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="full-bleed-section"
                >
                  <div id={`challenge-${expandedChallengeId}`} className="new-trend-expanded-container" style={{ borderColor: 'rgba(251, 191, 36, 0.3)', background: 'linear-gradient(to bottom, rgba(251, 191, 36, 0.05), rgba(0,0,0,0))' }}>
                    <div className="expanded-arena-header">
                      <div className="battling-badge" style={{ background: '#fbbf24', color: '#000' }}>
                        <Star size={14} fill="currentColor" /> {editorsChoiceDisplay.pickBadge}
                      </div>
                      <h3 className="expanded-arena-title">
                        {editorsChoiceChallenges.find(ec => ec.id === expandedChallengeId)?.title}
                      </h3>
                      <div style={{ fontSize: '11px', color: '#fbbf24', marginTop: '8px', fontWeight: '800' }}>
                        {editorsChoiceChallenges.find(ec => ec.id === expandedChallengeId)?.hashtags}
                      </div>
                    </div>
                    
                    <div
                      className="video-horizontal-scroll"
                      onScroll={(e) => handleVideoStripScroll(expandedChallengeId, e.currentTarget)}
                    >
                      {loadingVideos[expandedChallengeId] ? (
                        <div className="loading-container"><div className="loading-spinner"></div></div>
                      ) : (
                        (challengeVideos[expandedChallengeId] || []).map((video, vIdx) => (
                          <div key={video.id} id={`video-${expandedChallengeId}-${vIdx}`} className={`video-card-wrapper ${activeVideoIndex[expandedChallengeId] === vIdx ? 'active' : ''}`}>
                            <VideoPlayer 
                              video={video} 
                              isActive={(activeVideoIndex[expandedChallengeId] ?? 0) === vIdx}
                              shouldPreload={shouldKeepVideoWarm(expandedChallengeId, vIdx)}
                              onEnded={() => handleVideoEnd(expandedChallengeId, vIdx)}
                              onDelete={() => handleVideoUnavailable(expandedChallengeId, video.id, vIdx)}
                              onSupport={() => supportVideo(video)}
                              showGoldShower={showGoldShower === video.id}
                            />
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* NEW TREND SECTION - PREMIUM REDESIGN */}
        {newTrendChallenges.length > 0 && (
          <div id="section-new-trend" style={{ marginBottom: '30px' }}>
            <div className="new-trend-header">
              <div className="new-trend-title-container">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '20px', fontWeight: '900' }}>
                  <Flame size={22} color="#ff4b2b" fill="#ff4b2b"/> New Trend
                </h3>
                <div style={{ fontSize: '12px', opacity: 0.6, fontWeight: '600' }}>Freshly Ignited Arenas</div>
              </div>
              <div style={{ padding: '4px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', fontSize: '11px', fontWeight: '800', color: '#888' }}>
                SEE ALL
              </div>
            </div>
            
            <motion.div 
              className="new-trend-list"
              variants={{
                show: { transition: { staggerChildren: 0.1 } }
              }}
              initial="hidden"
              animate="show"
            >
              {newTrendChallenges.map((c, idx) => {
                const glowColor = c.bgGradient?.includes('linear-gradient') 
                  ? c.bgGradient.split(',')[1].trim().split(' ')[0] 
                  : 'rgba(138, 43, 226, 0.4)';
                
                return (
                  <motion.div 
                    key={c.id}
                    id={`trend-card-${c.id}`}
                    className={`new-trend-card ${expandedChallengeId === c.id ? 'active' : ''}`} 
                    variants={{
                      hidden: { opacity: 0, x: 50, scale: 0.9 },
                      show: { opacity: 1, x: 0, scale: 1, transition: { type: 'spring', stiffness: 200, damping: 20 } }
                    }}
                    style={{ '--glow-color': glowColor } as any}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => {
                      toggleExpand(c);
                      setTimeout(() => {
                        const el = document.getElementById(`trend-card-${c.id}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                      }, 50);
                    }}
                  >
                    <div className="trend-tag">
                      <Zap size={10} fill="currentColor" /> NEW ARENA
                    </div>
                    
                    <div className="trend-title">{c.title}</div>
                    
                    <div className="trend-footer">
                      <div className="entry-count-pill">
                        <Video size={10} fill="currentColor" />
                        <span>{c.videoCount || 0}</span>
                      </div>
                      <div style={{ fontSize: '10px', fontWeight: '800', color: 'var(--secondary)', letterSpacing: '0.5px' }}>
                        JOINED #{idx + 1}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>

            {/* Expanded Video Section for New Trends */}
            <AnimatePresence>
              {expandedChallengeId && newTrendChallenges.some(nt => nt.id === expandedChallengeId) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="full-bleed-section"
                >
                  <div id={`challenge-${expandedChallengeId}`} className="new-trend-expanded-container">
                    {/* Now Battling Header */}
                    {expandedChallengeId && (
                      <div className="expanded-arena-header">
                        <div className="battling-badge">
                          <Zap size={14} fill="currentColor" /> NOW BATTLING
                        </div>
                        <h3 className="expanded-arena-title">
                          {newTrendChallenges.find(nt => nt.id === expandedChallengeId)?.title}
                        </h3>
                      </div>
                    )}

                    {loadingVideos[expandedChallengeId] ? (
                       <div style={{ padding: '60px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '24px' }}>
                         <TrendingUp className="spinning" size={32} color="var(--primary)" />
                         <p style={{ marginTop: '16px', color: '#888', fontSize: '13px' }}>Awakening the Arena...</p>
                       </div>
                    ) : (
                      <div 
                        className="videos-scroll-container"
                        onScroll={(e) => handleVideoStripScroll(expandedChallengeId, e.currentTarget)}
                      >
                         {(challengeVideos[expandedChallengeId] && challengeVideos[expandedChallengeId].length > 0) ? (
                           challengeVideos[expandedChallengeId].map((video, index) => (
                            <div key={video.id} className={`video-card-wrapper ${activeVideoIndex[expandedChallengeId] === index ? 'active' : ''}`} id={`video-${expandedChallengeId}-${index}`} style={{ height: 'calc(100dvh - 340px)', minHeight: '440px' }}>
                               <div className="video-sidebar">
                                 <div className="video-sidebar-item" style={{ gap: '24px', marginTop: 'auto' }}>
                                   <div className="video-user-container">
                                     <div className="video-title-sidebar">{video.videoTitle || 'Trending Entry'}</div>
                                     <div className="video-user">
                                       <User size={12} color="rgba(255,255,255,0.5)" />
                                       <span className="user-name-text">@{video.author}</span>
                                     </div>
                                   </div>
                                   <div className="video-view-count">
                                     <TrendingUp size={12} color="#00ffff" />
                                     <span>{formatScore(video.viewCount)}</span>
                                   </div>
                                 </div>
                                 <div className="video-sidebar-item">
                                   <div className={`platform-badge ${video.platform}`}>
                                     {video.platform === 'youtube' ? 'Shorts' : video.platform === 'tiktok' ? 'TikTok' : 'Reels'}
                                   </div>
                                   <motion.button 
                                     whileTap={{ scale: 0.9 }} 
                                     className="gold-support-btn" 
                                     onClick={() => supportVideo(video)}
                                   >
                                     <Flame size={14} /> <span>GOLD</span>
                                   </motion.button>
                                   {renderPrizeVideoControls(newTrendChallenges.find(nt => nt.id === expandedChallengeId), video)}
                                 </div>
                               </div>
                               <div className="video-main">
                                 <AnimatePresence>
                                   {showGoldShower === video.id && <GoldShower onComplete={() => setShowGoldShower(null)} />}
                                 </AnimatePresence>
                                 <VideoPlayer
                                   video={video}
                                   isMuted={false}
                                   isActive={(activeVideoIndex[expandedChallengeId] ?? 0) === index}
                                   shouldPreload={shouldKeepVideoWarm(expandedChallengeId, index)}
                                   onDelete={() => handleVideoUnavailable(expandedChallengeId, video.id, index)}
                                   onEnded={() => handleVideoEnd(expandedChallengeId, index)}
                                 />
                               </div>
                            </div>
                           ))
                         ) : (
                           <div style={{ padding: '40px', textAlign: 'center', width: '100%', color: '#888' }}>
                              No videos found for this trend yet.
                           </div>
                         )}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <div id="section-active-trends" className="feed-title-section">
           <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '20px 0 0 0' }}>
             <TrendingUp size={18} color="var(--primary)"/> Active Trends
           </h3>
           <span>Total: {activeTrendChallenges.length}</span>
        </div>
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                <Zap size={32} color="var(--secondary)" />
              </motion.div>
            </div>
          ) : activeTrendChallenges.length === 0 && !currentStrikeChallenge && newTrendChallenges.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 40px', color: '#888' }}>
              <Award size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
              <p>No active competitions in {activeRegion} yet.</p>
            </div>
          ) : (
            activeTrendChallenges.map(challenge => (
              <motion.div
                key={challenge.id}
                id={`challenge-${challenge.id}`}
                className={`challenge-card ${challenge.isOfficial ? 'official' : ''}`}
                variants={itemVariants}
                style={{ background: challenge.bgGradient || 'var(--surface)', border: 'none', marginBottom: '20px' }}
              >
                <div
                  className="challenge-header"
                  onClick={() => toggleExpand(challenge)}
                  style={{ cursor: 'pointer', padding: '12px 16px' }}
                >
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                       {challenge.isOfficial && (
                         <div className="official-badge" style={{ fontSize: '9px', padding: '2px 6px' }}>
                           <Crown size={8} /> Official
                         </div>
                       )}
                       <div className="trending-badge" style={{ fontSize: '9px', padding: '2px 6px' }}>
                          <Flame size={8} /> Trending
                       </div>
                    </div>
                    <h2 className="card-title" style={{ justifyContent: 'center', fontSize: '18px', marginBottom: '4px' }}>
                      {challenge.title}
                      {expandedChallengeId === challenge.id ? (
                        <ChevronUp size={16} style={{ marginLeft: '6px', color: '#888' }} />
                      ) : (
                        <ChevronDown size={16} style={{ marginLeft: '6px', color: '#888' }} />
                      )}
                    </h2>
                    <div className="card-hashtags" style={{ textAlign: 'center', fontSize: '11px', opacity: 0.8 }}>{challenge.hashtags}</div>
                    <div className="participants" style={{ display: 'flex', justifyContent: 'center', marginTop: '6px', fontSize: '11px' }}>
                      <MapPin size={10} color="#aaa" />
                      <span style={{ color: '#aaa' }}>{challenge.region}</span>
                      <span style={{ margin: '0 4px', color: '#444' }}>/</span>
                      <Flame size={10} color="#00ffff" />
                      <span style={{ color: '#00ffff' }}>{formatScore(challenge.viralScore)} Score</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', padding: '0 16px 12px 16px' }}>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    className="participate-btn primary"
                    style={{ width: 'auto', minWidth: '160px', padding: '8px 20px', fontSize: '13px', justifyContent: 'center' }}
                    onClick={async (e) => {
                      e.stopPropagation();
                      openJoinChallengeModal(challenge);
                      return;
                      try {
                        await navigator.clipboard.writeText(challenge.hashtags);
                        showToast('📋 Hashtags copied!');
                        await joinChallenge(challenge.id);
                        setChallenges(prev => prev.map(c => c.id === challenge.id ? { ...c, participants: c.participants + 1 } : c));
                        setShowCamera(true);
                      } catch (err) {
                        console.error("Join fail:", err);
                      }
                    }}
                  >
                    Join Challenge <Video size={14} />
                  </motion.button>
                </div>

                {/* Like/Dislike */}
                {challenge.challengeType === 'prize' && (
                  <div className="prize-challenge-strip">
                    <span><Crown size={13} /> {challenge.prizePoolUnon || '0'} UNON prize</span>
                    <span>{challenge.prizeStatus || 'scheduled'}</span>
                    <span>{challenge.prizeWinnerCount || 1} winners</span>
                    {renderPrizeChallengeActions(challenge)}
                  </div>
                )}
                <div style={{ display: challenge.challengeType === 'prize' ? 'none' : 'flex', justifyContent: 'center', gap: '12px', padding: '0 16px 14px 16px' }}>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', background: userVotes[challenge.id] === 'like' ? 'rgba(0,255,100,0.25)' : 'rgba(0,255,100,0.1)', border: `1px solid ${userVotes[challenge.id] === 'like' ? '#4ade80' : 'rgba(0,255,100,0.2)'}`, borderRadius: '14px', padding: '6px 16px', color: '#4ade80', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!currentUser) { showToast('Login is required.'); return; }
                      try {
                        const res = await fetch(apiUrl(`/api/challenges/${challenge.id}/vote`), {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ userId: currentUser.uid, voteType: 'like' })
                        });
                        const data = await res.json();
                        if (data.success) {
                          if (data.deleted) {
                            setChallenges(prev => prev.filter(c => c.id !== challenge.id));
                            showToast('🗑️ Challenge removed by community');
                          } else {
                            setChallenges(prev => prev.map(c => c.id === challenge.id ? { ...c, likes: parseInt(data.data.likes) || 0, dislikes: parseInt(data.data.dislikes) || 0 } : c));
                            setUserVotes(prev => data.userVote ? { ...prev, [challenge.id]: data.userVote } : (() => { const n = { ...prev }; delete n[challenge.id]; return n; })());
                          }
                        }
                      } catch (err) { console.error(err); }
                    }}
                  >
                    <ThumbsUp size={14} fill={userVotes[challenge.id] === 'like' ? 'currentColor' : 'none'} /> {challenge.likes || 0}
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', background: userVotes[challenge.id] === 'dislike' ? 'rgba(255,50,50,0.25)' : 'rgba(255,50,50,0.1)', border: `1px solid ${userVotes[challenge.id] === 'dislike' ? '#f87171' : 'rgba(255,50,50,0.2)'}`, borderRadius: '14px', padding: '6px 16px', color: '#f87171', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!currentUser) { showToast('Login is required.'); return; }
                      try {
                        const res = await fetch(apiUrl(`/api/challenges/${challenge.id}/vote`), {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ userId: currentUser.uid, voteType: 'dislike' })
                        });
                        const data = await res.json();
                        if (data.success) {
                          if (data.deleted) {
                            setChallenges(prev => prev.filter(c => c.id !== challenge.id));
                            showToast('🗑️ Challenge removed by community');
                          } else {
                            setChallenges(prev => prev.map(c => c.id === challenge.id ? { ...c, likes: parseInt(data.data.likes) || 0, dislikes: parseInt(data.data.dislikes) || 0 } : c));
                            setUserVotes(prev => data.userVote ? { ...prev, [challenge.id]: data.userVote } : (() => { const n = { ...prev }; delete n[challenge.id]; return n; })());
                          }
                        }
                      } catch (err) { console.error(err); }
                    }}
                  >
                    <ThumbsDown size={14} fill={userVotes[challenge.id] === 'dislike' ? 'currentColor' : 'none'} /> {challenge.dislikes || 0}
                  </motion.button>
                </div>

                <AnimatePresence initial={false}>
                  {expandedChallengeId === challenge.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div
                        className="videos-scroll-container"
                        onScroll={(e) => handleVideoStripScroll(challenge.id, e.currentTarget)}
                      >
                        {loadingVideos[challenge.id] ? (
                          <div style={{ padding: '40px', color: '#888', width: '100%', textAlign: 'center' }}>
                            <div className="loading-spinner" style={{ marginBottom: '16px' }}>
                               <TrendingUp size={32} className="spinning" />
                            </div>
                            <div>Gathering viral energy...</div>
                          </div>
                        ) : (!challengeVideos[challenge.id] || challengeVideos[challenge.id].length === 0) ? (
                           <div style={{ padding: '40px 20px', width: '100%' }}>
                              <div className="empty-state-start-prompt" style={{ margin: '0 auto' }}>
                                 <Trophy size={40} style={{ marginBottom: '16px' }} />
                                 <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>BE THE FIRST TO STRIKE!</h3>
                                 <p style={{ fontSize: '13px', color: '#fff', opacity: 0.7 }}>
                                   No warriors have entered this arena yet. <br/>
                                   Upload your video and take the crown!
                                 </p>
                              </div>
                           </div>
                        ) : (
                          challengeVideos[challenge.id].map((video, index) => (
                            <div key={video.id} className={`video-card-wrapper ${activeVideoIndex[challenge.id] === index ? 'active' : ''}`} id={`video-${challenge.id}-${index}`} style={{ height: 'calc(100dvh - 340px)', minHeight: '440px' }}>
                              <div className="video-sidebar">
                                <div className="video-sidebar-item" style={{ gap: '24px', marginTop: 'auto' }}>
                                  <div className="video-user-container">
                                    <div className="video-title-sidebar">{video.videoTitle || 'Trending Entry'}</div>
                                    <div className="video-user">
                                      <User size={12} color="rgba(255,255,255,0.5)" />
                                      <span className="user-name-text">@{video.author}</span>
                                    </div>
                                  </div>
                                  <div className="video-view-count">
                                    <TrendingUp size={12} color="#00ffff" />
                                    <span>{formatScore(video.viewCount)}</span>
                                  </div>
                                </div>
                                <div className="video-sidebar-item">
                                  <div className={`platform-badge ${video.platform}`}>
                                    {video.platform === 'youtube' ? 'Shorts' : video.platform === 'tiktok' ? 'TikTok' : 'Reels'}
                                  </div>
                                  <motion.button whileTap={{ scale: 0.9 }} className="gold-support-btn" onClick={() => supportVideo(video)}>
                                    <Flame size={14} /> <span>GOLD</span>
                                  </motion.button>
                                  {renderPrizeVideoControls(challenge, video)}
                                </div>
                              </div>
                              <div className="video-main">
                                <AnimatePresence>
                                  {showGoldShower === video.id && <GoldShower onComplete={() => setShowGoldShower(null)} />}
                                </AnimatePresence>
                                <VideoPlayer
                                  video={video}
                                  isMuted={false}
                                  isActive={(activeVideoIndex[challenge.id] ?? 0) === index}
                                  shouldPreload={shouldKeepVideoWarm(challenge.id, index)}
                                  onDelete={() => handleVideoUnavailable(challenge.id, video.id, index)}
                                  onEnded={() => handleVideoEnd(challenge.id, index)}
                                />
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))
          )}
        </motion.main>
    );
  };

  const renderCreate = () => {
    if (!currentUser) {
      return (
        <div className="page-container" style={{ paddingBottom: '100px' }}>
          <div className="create-premium-card" style={{ 
            background: 'rgba(255, 255, 255, 0.03)', 
            borderRadius: '32px', 
            padding: '60px 30px', 
            border: '1px solid rgba(255, 255, 255, 0.05)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            textAlign: 'center'
          }}>
            <motion.div 
              initial={{ scale: 0 }} 
              animate={{ scale: 1 }} 
              style={{ width: '80px', height: '80px', background: 'rgba(255,255,255,0.05)', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px auto' }}
            >
              <div className="loading-spinner" style={{ width: '40px', height: '40px', borderTopColor: 'var(--primary)' }} />
            </motion.div>
            <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '12px' }}>{t('authTitle')}</h2>
            <p style={{ color: '#888', marginBottom: '16px', lineHeight: '1.6' }}>
              {t('authBody')}
            </p>
            <p style={{ color: '#666', margin: 0, fontSize: '13px' }}>
              {t('authOutside')}
            </p>
          </div>
        </div>
      );
    }

    const numericUnonBalance = Number(unonBalance || 0);
    const hasPrizeCreatorEligibility = isAdminUser || numericUnonBalance >= PLATINUM_PRIZE_MIN_UNON;
    const prizeManagerConfigured = isLikelyAddress(UNON_PRIZE_MANAGER_ADDRESS);
    const isPrizeModeLocked = createMode === 'prize' && (!hasPrizeCreatorEligibility || !prizeManagerConfigured);
    const prizeFieldsDisabled = isCreating || !hasPrizeCreatorEligibility || !prizeManagerConfigured;

    return (
      <div className="page-container" style={{ paddingBottom: '100px' }}>
        <div className="create-premium-card" style={{ 
          background: 'rgba(255, 255, 255, 0.03)', 
          borderRadius: '32px', 
          padding: '30px', 
          border: '1px solid rgba(255, 255, 255, 0.05)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <motion.div 
              initial={{ scale: 0 }} 
              animate={{ scale: 1 }} 
              style={{ width: '64px', height: '64px', background: 'var(--primary)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto' }}
            >
              <Zap size={32} color="#fff" />
            </motion.div>
            <motion.h1 className="page-title" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: '10px' }}>{t('createTitle')}</motion.h1>
            <motion.p className="page-subtitle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
              {t('createSummary')}
            </motion.p>
          </div>

          <div className="challenge-type-toggle">
            <button
              type="button"
              className={createMode === 'standard' ? 'active' : ''}
              onClick={() => setCreateMode('standard')}
            >
              {t('standard')}
            </button>
            <button
              type="button"
              className={`${createMode === 'prize' ? 'active' : ''} ${!hasPrizeCreatorEligibility ? 'locked' : ''}`}
              onClick={() => {
                if (!hasPrizeCreatorEligibility) return;
                setCreateMode('prize');
              }}
              disabled={!hasPrizeCreatorEligibility || isCreating}
              title={!hasPrizeCreatorEligibility ? 'PLATINUM badge requires 10,000+ UNON.' : isAdminUser ? 'Admin prize battle creation enabled' : 'Create a UNON prize battle'}
            >
              {t('prize')}
            </button>
          </div>

          {isAdminUser ? (
            <div className="prize-lock-card prize-admin-unlock-card">
              <Settings size={18} />
              <span>Admin mode: Prize UNON battle creation is enabled.</span>
            </div>
          ) : null}

          {!hasPrizeCreatorEligibility ? (
            <div className="prize-lock-card prize-lock-card-toggle">
              <Shield size={18} />
              <span>Prize UNON battles unlock at PLATINUM: hold 10,000+ UNON.</span>
            </div>
          ) : null}

          <form className="create-form" onSubmit={handleCreateChallenge}>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--primary)', marginBottom: '8px', fontWeight: '800' }}>
                <Trophy size={14} /> {t('arenaName')}
              </label>
              <input 
                type="text" 
                className="form-input" 
                style={{ background: 'rgba(255,255,255,0.05)', height: '56px', borderRadius: '16px', fontSize: '16px' }}
                placeholder={t('arenaPlaceholder')}
                value={createForm.title} 
                onChange={e => setCreateForm({ ...createForm, title: e.target.value })} 
                disabled={isCreating} 
              />
            </div>

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--secondary)', marginBottom: '8px', fontWeight: '800' }}>
                <Hash size={14} /> {t('mainHashtag')}
              </label>
              <input 
                type="text" 
                className="form-input" 
                style={{ background: 'rgba(255,255,255,0.05)', height: '56px', borderRadius: '16px', fontSize: '16px' }}
                placeholder="#MustIncludeThis #GlobalTrend" 
                value={createForm.hashtags} 
                onChange={e => setCreateForm({ ...createForm, hashtags: e.target.value })} 
                disabled={isCreating} 
              />
            </div>

            <div className="form-group" style={{ marginBottom: '30px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#00ffff', marginBottom: '8px', fontWeight: '800' }}>
                <MapPin size={14} /> {t('territory')}
              </label>
              <select 
                className="form-input" 
                style={{ background: 'rgba(255,255,255,0.05)', height: '56px', borderRadius: '16px', fontSize: '16px' }}
                value={createForm.region} 
                onChange={e => setCreateForm({ ...createForm, region: e.target.value })} 
                disabled={isCreating}
              >
                {REGIONS.map(r => <option key={r} value={r} style={{ background: '#111' }}>{r}</option>)}
              </select>
            </div>

            {createMode === 'prize' && (
              <div className={`prize-create-panel ${prizeFieldsDisabled ? 'disabled' : ''}`}>
                {!hasPrizeCreatorEligibility ? (
                  <div className="prize-lock-card">
                    <Shield size={18} />
                    <span>PLATINUM unlock required: hold 10,000+ UNON to create prize challenges.</span>
                  </div>
                ) : null}
                {!prizeManagerConfigured ? (
                  <div className="prize-lock-card warning">
                    <Settings size={18} />
                    <span>Set VITE_UNON_PRIZE_MANAGER_ADDRESS after deploying PrizeChallengeManager.</span>
                  </div>
                ) : null}

                <div className="form-group">
                  <label><Crown size={14} /> PRIZE POOL UNON</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    className="form-input"
                    value={prizeForm.prizePoolUnon}
                    onChange={e => setPrizeForm({ ...prizeForm, prizePoolUnon: e.target.value })}
                    disabled={prizeFieldsDisabled}
                  />
                </div>
                <div className="prize-date-grid">
                  {([
                    { field: 'submissionEnd' as const, title: 'MISSION END', hint: '영상 제출 종료', icon: <UploadCloud size={16} /> },
                    { field: 'votingEnd' as const, title: 'VOTE END', hint: 'UNON 투표 종료', icon: <Trophy size={16} /> }
                  ]).map(item => {
                    const dateTime = getPrizeDateTimeParts(prizeForm[item.field]);
                    const currentYear = new Date().getFullYear();
                    const years = Array.from({ length: 4 }, (_, index) => String(currentYear + index));
                    const months = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));
                    const maxDay = new Date(Number(dateTime.year), Number(dateTime.month), 0).getDate();
                    const days = Array.from({ length: maxDay }, (_, index) => String(index + 1).padStart(2, '0'));
                    const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
                    const minutes = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
                    return (
                      <div className="prize-date-card" key={item.field}>
                        <div className="prize-date-card-head">
                          <span>{item.icon}</span>
                          <div>
                            <strong>{item.title}</strong>
                            <small>{item.hint}</small>
                          </div>
                        </div>
                        <div className="prize-date-fields">
                          <label>
                            <span>Year</span>
                            <select value={dateTime.year} onChange={e => updatePrizeDateTimePart(item.field, 'year', e.target.value)} disabled={prizeFieldsDisabled}>
                              {years.map(value => <option key={value} value={value}>{value}</option>)}
                            </select>
                          </label>
                          <label>
                            <span>Month</span>
                            <select value={dateTime.month} onChange={e => updatePrizeDateTimePart(item.field, 'month', e.target.value)} disabled={prizeFieldsDisabled}>
                              {months.map(value => <option key={value} value={value}>{value}</option>)}
                            </select>
                          </label>
                          <label>
                            <span>Day</span>
                            <select value={dateTime.day} onChange={e => updatePrizeDateTimePart(item.field, 'day', e.target.value)} disabled={prizeFieldsDisabled}>
                              {days.map(value => <option key={value} value={value}>{value}</option>)}
                            </select>
                          </label>
                          <label>
                            <span>Hour</span>
                            <select value={dateTime.hour} onChange={e => updatePrizeDateTimePart(item.field, 'hour', e.target.value)} disabled={prizeFieldsDisabled}>
                              {hours.map(value => <option key={value} value={value}>{value}</option>)}
                            </select>
                          </label>
                          <label>
                            <span>Min</span>
                            <select value={dateTime.minute} onChange={e => updatePrizeDateTimePart(item.field, 'minute', e.target.value)} disabled={prizeFieldsDisabled}>
                              {minutes.map(value => <option key={value} value={value}>{value}</option>)}
                            </select>
                          </label>
                        </div>
                        <div className="prize-date-preview">
                          {dateTime.year}.{dateTime.month}.{dateTime.day} {dateTime.hour}:{dateTime.minute}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <label className="prize-date-sync-toggle">
                  <input
                    type="checkbox"
                    checked={prizeForm.syncEndDate}
                    onChange={e => togglePrizeEndDateSync(e.target.checked)}
                    disabled={prizeFieldsDisabled}
                  />
                  <span>
                    <strong>미션종료와 투표종료 날짜를 동일하게 적용</strong>
                    <small>활성화하면 연/월/일 변경 시 두 날짜가 함께 맞춰지고, 시간은 각각 설정할 수 있습니다.</small>
                  </span>
                </label>
                <div className="form-group">
                  <label><Award size={14} /> WINNERS</label>
                  <div className="prize-winner-stepper">
                    <button
                      type="button"
                      onClick={() => updatePrizeWinnerCount(prizeForm.winnerCount - 1)}
                      disabled={prizeFieldsDisabled || prizeForm.winnerCount <= 1}
                      aria-label="Decrease winner count"
                    >
                      <MinusCircle size={18} />
                    </button>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      className="form-input"
                      value={prizeForm.winnerCount}
                      onChange={e => updatePrizeWinnerCount(Number(e.target.value))}
                      disabled={prizeFieldsDisabled}
                    />
                    <button
                      type="button"
                      onClick={() => updatePrizeWinnerCount(prizeForm.winnerCount + 1)}
                      disabled={prizeFieldsDisabled || prizeForm.winnerCount >= 10}
                      aria-label="Increase winner count"
                    >
                      <PlusCircle size={18} />
                    </button>
                  </div>
                </div>
                <div className="prize-distribution-header">
                  <div>
                    <strong>Winner Distribution</strong>
                    <span>Prize winners share {getPrizeWinnerPoolUnon().toFixed(2)} UNON after the 3% operations fee.</span>
                  </div>
                  <div className="prize-distribution-toggle">
                    <button
                      type="button"
                      className={prizeForm.distributionMode === 'percent' ? 'active' : ''}
                      onClick={() => setPrizeForm(prev => ({ ...prev, distributionMode: 'percent' }))}
                      disabled={prizeFieldsDisabled}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      className={prizeForm.distributionMode === 'amount' ? 'active' : ''}
                      onClick={() => setPrizeForm(prev => ({ ...prev, distributionMode: 'amount' }))}
                      disabled={prizeFieldsDisabled}
                    >
                      UNON
                    </button>
                  </div>
                </div>
                <div className="prize-split-list">
                  {prizeForm.winnerSplitsBps.map((split, index) => (
                    <label key={index}>
                      <span>{index + 1}등</span>
                      <input
                        type="number"
                        min="0"
                        max={prizeForm.distributionMode === 'percent' ? '100' : undefined}
                        step="0.01"
                        value={prizeForm.distributionMode === 'percent' ? split / 100 : Number(getPrizeSplitAmount(split).toFixed(2))}
                        onChange={e => {
                          if (prizeForm.distributionMode === 'percent') {
                            updatePrizeSplit(index, e.target.value);
                          } else {
                            updatePrizeSplitAmount(index, e.target.value);
                          }
                        }}
                        disabled={prizeFieldsDisabled}
                      />
                      <small>{prizeForm.distributionMode === 'percent' ? '%' : 'UNON'}</small>
                    </label>
                  ))}
                </div>
                <div className={`prize-split-total ${getPrizeSplitTotal() === 10000 ? 'valid' : 'invalid'}`}>
                  Total {(getPrizeSplitTotal() / 100).toFixed(2)}%
                  {prizeForm.distributionMode === 'amount' ? ` / ${(getPrizeWinnerPoolUnon() * getPrizeSplitTotal() / 10000).toFixed(2)} UNON` : ''}
                </div>
              </div>
            )}

            <motion.button 
              type="submit" 
              className="btn-primary" 
              style={{ width: '100%', height: '60px', borderRadius: '20px', fontSize: '18px', fontWeight: '900', boxShadow: '0 10px 30px var(--primary-box-shadow)' }} 
              disabled={isCreating || isPrizeModeLocked} 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isCreating ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                  <TrendingUp size={20} className="spinning" /> {t('creating')}
                </div>
              ) : (
                createMode === 'prize' ? t('prize') : t('ignite')
              )}
            </motion.button>
          </form>
        </div>

        <div style={{ marginTop: '30px', padding: '20px', background: 'rgba(0, 255, 255, 0.05)', borderRadius: '20px', border: '1px dashed rgba(0, 255, 255, 0.2)' }}>
          <p style={{ fontSize: '11px', color: '#00ffff', textAlign: 'center', margin: 0, opacity: 0.8 }}>
            <Crown size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
            New arenas are immediately checked for viral social content from Instagram, TikTok, and YouTube.
          </p>
        </div>
      </div>
    );
  };
  void _renderHome;

  const getOnChallenges = (mode: 'trend' | 'battle' | 'now') => {
    const fallbackMode = (challenge: Challenge) => challenge.challengeType === 'prize' ? 'battle' : 'trend';
    return challenges
      .filter(challenge => {
        const challengeMode = challenge.challengeMode || fallbackMode(challenge);
        if (mode === 'battle') {
          return challengeMode === 'battle' || (challenge.userVideoCount || 0) > 0;
        }
        return challengeMode === mode;
      })
      .filter(challenge => activeRegion === REGIONS[0] || challenge.region === activeRegion || challenge.region === REGIONS[0])
      .sort((a, b) => {
        if (mode === 'battle') {
          const aPrize = a.challengeType === 'prize' ? 1 : 0;
          const bPrize = b.challengeType === 'prize' ? 1 : 0;
          if (aPrize !== bPrize) return bPrize - aPrize;
          const aUserVideos = a.userVideoCount || 0;
          const bUserVideos = b.userVideoCount || 0;
          if (aUserVideos !== bUserVideos) return bUserVideos - aUserVideos;
        }
        return (b.viralScore || 0) - (a.viralScore || 0);
      });
  };

  const renderOnChallengeVideos = (challenge: Challenge, mode: 'trend' | 'battle' | 'now') => {
    const videoKey = getOnVideoKey(challenge.id, mode);
    const videos = challengeVideos[videoKey] || [];
    const activeIndex = activeVideoIndex[videoKey] ?? 0;

    return (
    <AnimatePresence initial={false}>
      {expandedChallengeId === challenge.id && (
        <motion.div
          className="on-video-panel"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.28, ease: 'easeInOut' }}
        >
          <div
            className="videos-scroll-container"
            onScroll={(event) => handleVideoStripScroll(videoKey, event.currentTarget)}
          >
            {loadingVideos[videoKey] ? (
              <div className="on-video-state">
                <TrendingUp size={30} className="spinning" />
                <span>Loading videos...</span>
              </div>
            ) : (videos.length === 0) ? (
              <div className="on-video-state">
                <Video size={34} />
                <strong>No videos yet</strong>
                <span>{mode === 'trend' ? 'Only external trend videos are shown here.' : 'User entries will appear here after upload.'}</span>
              </div>
            ) : (
              videos.map((video, index) => (
                <div
                  key={video.id}
                  id={`video-${videoKey}-${index}`}
                  className={`video-card-wrapper ${activeIndex === index ? 'active' : ''}`}
                  style={{ height: 'calc(100dvh - 340px)', minHeight: '440px' }}
                >
                  <div className="video-sidebar">
                    <div className="video-sidebar-item" style={{ gap: '24px', marginTop: 'auto' }}>
                      <div className="video-user-container">
                        <div className="video-title-sidebar">{video.videoTitle || 'Trending Entry'}</div>
                        <div className="video-user">
                          {mode !== 'trend' ? (
                            <button
                              type="button"
                              className="follow-user-icon-btn"
                              aria-label={`Follow ${video.authorWorldUsername || video.author}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                void followCreator(video);
                              }}
                            >
                              <User size={12} />
                              <PlusCircle size={10} />
                            </button>
                          ) : (
                            <User size={12} color="rgba(255,255,255,0.5)" />
                          )}
                          <span className="user-name-text">@{video.authorWorldUsername || video.author}</span>
                        </div>
                      </div>
                      <div className="video-view-count">
                        <TrendingUp size={12} color="#00ffff" />
                        <span>{formatScore(video.viewCount)}</span>
                      </div>
                    </div>
                    <div className="video-sidebar-item">
                      <div className={`platform-badge ${video.platform}`}>
                        {video.platform === 'youtube' ? 'Shorts' : video.platform === 'tiktok' ? 'TikTok' : 'Reels'}
                      </div>
                      {mode === 'trend' ? (
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          className="try-on-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            void tryOnChallenge(challenge, video);
                          }}
                        >
                          <Video size={14} /> <span>TRY ON</span>
                        </motion.button>
                      ) : (
                        <>
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            className="gold-support-btn"
                            onClick={(event) => {
                              event.stopPropagation();
                              supportVideo(video);
                            }}
                          >
                            <Flame size={14} /> <span>GOLD</span>
                          </motion.button>
                        </>
                      )}
                      {renderPrizeVideoControls(challenge, video)}
                    </div>
                  </div>
                  <div className="video-main">
                    <AnimatePresence>
                      {showGoldShower === video.id && <GoldShower onComplete={() => setShowGoldShower(null)} />}
                    </AnimatePresence>
                    <VideoPlayer
                      video={video}
                      isMuted={false}
                      isActive={activeIndex === index}
                      shouldPreload={shouldKeepVideoWarm(videoKey, index)}
                      onDelete={() => handleOnVideoUnavailable(videoKey, video.id, index)}
                      onEnded={() => handleOnVideoEnd(videoKey, index)}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    );
  };

  const renderOnChallengeCard = (challenge: Challenge, mode: 'trend' | 'battle' | 'now') => (
    <div
      key={challenge.id}
      className={`on-card-shell ${expandedChallengeId === challenge.id ? 'expanded' : ''} ${challenge.challengeType === 'prize' ? 'platinum' : ''}`}
      id={`challenge-${challenge.id}`}
    >
      <motion.div className="on-card" whileTap={{ scale: 0.99 }} onClick={() => toggleExpand(challenge, mode)}>
        <div className="on-card-topline">
          <span>{mode === 'trend' ? 'TREND ON' : mode === 'battle' ? 'BATTLE ON' : 'NOW ON'}</span>
          <small>{challenge.challengeType === 'prize' ? 'PLATINUM CHALLENGE' : (challenge.region || 'Global')}</small>
        </div>
        <h3>{challenge.title}</h3>
        <p>{challenge.notice || challenge.hashtags}</p>
        <div className="on-card-meta">
          <span><Video size={14} /> {mode === 'battle' ? (challenge.userVideoCount || 0) : mode === 'trend' ? (challenge.externalVideoCount ?? challenge.videoCount ?? 0) : (challenge.videoCount || 0)}</span>
          <span><Flame size={14} /> {formatScore(challenge.viralScore || 0)}</span>
          {challenge.prizePoolUnon && <span><Award size={14} /> {challenge.prizePoolUnon} UNON</span>}
          {challenge.rewardUnon && <span><Star size={14} /> {challenge.rewardUnon} UNON</span>}
        </div>
        <div className="on-card-actions">
          {mode === 'trend' && (
            <button
              type="button"
              className="try-on-inline-btn"
              onClick={(event) => {
                event.stopPropagation();
                void tryOnChallenge(challenge);
              }}
            >
              <Video size={15} /> Try ON
            </button>
          )}
          {mode === 'battle' && challenge.challengeType === 'prize' && (
            <span className="platinum-inline-badge"><Crown size={14} /> Platinum+</span>
          )}
        </div>
      </motion.div>
      {renderOnChallengeVideos(challenge, mode)}
    </div>
  );

  const renderOnSection = (mode: 'trend' | 'battle' | 'now') => {
    const copy = {
      trend: {
        title: 'Trend ON',
        kicker: t('trendKicker'),
        summary: t('trendSummary'),
        empty: t('trendEmpty')
      },
      battle: {
        title: 'Battle ON',
        kicker: t('battleKicker'),
        summary: t('battleSummary'),
        empty: t('battleEmpty')
      },
      now: {
        title: 'Now ON',
        kicker: t('nowKicker'),
        summary: t('nowSummary'),
        empty: t('nowEmpty')
      }
    }[mode];
    const items = getOnChallenges(mode);

    return (
      <div className="on-page" ref={feedRef}>
        <section className="on-hero">
          <div>
            <span>{copy.kicker}</span>
            <h1>{copy.title}</h1>
            <p>{copy.summary}</p>
          </div>
          {mode === 'now' && (
            <button type="button" className="on-primary-action" onClick={() => setCurrentTab('create')}>
              <UploadCloud size={18} /> {t('sayHello')}
            </button>
          )}
          {mode === 'battle' && (
            <button type="button" className="on-primary-action" onClick={() => setCurrentTab('create')}>
              <PlusCircle size={18} /> {t('navCreate')}
            </button>
          )}
        </section>

        {mode === 'now' && (
          <section className="on-tutorial">
            {[
              [t('welcomeBonus'), t('welcomeBonusBody')],
              [t('sayHello'), t('sayHelloBody')],
              [t('goldHeart'), t('goldHeartBody')],
              [t('navRanking'), t('rankingBody')]
            ].map(([title, body]) => (
              <div key={title}>
                <CheckCircle2 size={16} />
                <strong>{title}</strong>
                <span>{body}</span>
              </div>
            ))}
          </section>
        )}

        <section className="on-grid">
          {items.length > 0 ? items.map(item => renderOnChallengeCard(item, mode)) : (
            <div className="on-empty">{copy.empty}</div>
          )}
        </section>
      </div>
    );
  };

  const renderRankings = () => (
    <div className="on-page">
      <section className="on-hero compact">
        <div>
          <span>{t('rankingKicker')}</span>
          <h1>{t('navRanking')}</h1>
          <p>{t('rankingSummary')}</p>
        </div>
      </section>
      <div className="ranking-controls">
        {(['month', 'quarter', 'year'] as const).map(period => (
          <button key={period} className={rankingPeriod === period ? 'active' : ''} onClick={() => setRankingPeriod(period)}>
            {t(period)}
          </button>
        ))}
        {(['all', 'UNON', 'WLD'] as const).map(token => (
          <button key={token} className={rankingToken === token ? 'active' : ''} onClick={() => setRankingToken(token)}>
            {token}
          </button>
        ))}
      </div>
      <div className="ranking-list">
        {donationRankings.length > 0 ? donationRankings.map((row, index) => (
          <div key={`${row.creator}-${row.token_symbol}-${index}`} className="ranking-row">
            <div className="ranking-position">{index + 1}</div>
            <div>
              <strong>{row.creator}</strong>
              <span>{row.support_count} {t('supports')}</span>
            </div>
            <div className="ranking-amount">{Number(row.donated_amount || 0).toFixed(2)} {row.token_symbol}</div>
          </div>
        )) : (
          <div className="on-empty">{t('rankingEmpty')}</div>
        )}
      </div>
    </div>
  );

  const renderProfile = () => {
    // Calculate level progress (placeholder logic)
    const currentPoints = userData?.points || 0;
    const pointsPerLevel = 1000;
    const progress = (currentPoints % pointsPerLevel) / 10; // Percent
    const fallbackProfileHandle = currentUser
      ? `${currentUser.uid.substring(0, 6)}...${currentUser.uid.substring(currentUser.uid.length - 4)}`
      : 'WorldID';
    const profileHandle = (profileUsername || MiniKit.user?.username || fallbackProfileHandle).replace(/^@+/, '');
    const isUnonBalanceLoading = unonBalance === null;
    const numericUnonBalance = Number(unonBalance || 0);
    const unonBadgeTier = getUnonBadgeTier(numericUnonBalance);
    const unonBadgeIndex = UNON_BADGE_TIERS.findIndex((tier) => tier.level === unonBadgeTier.level);
    const nextUnonBadgeTier = unonBadgeIndex > 0 ? UNON_BADGE_TIERS[unonBadgeIndex - 1] : null;
    const previousUnonThreshold = UNON_BADGE_TIERS[unonBadgeIndex + 1]?.minBalance || 0;
    const badgeProgress = nextUnonBadgeTier
      ? Math.max(0, Math.min(100, ((numericUnonBalance - previousUnonThreshold) / (nextUnonBadgeTier.minBalance - previousUnonThreshold)) * 100))
      : 100;
    const hasPendingWelcomeBonusClaim = !!userData?.onboardingClaimPendingHash;
    const hasClaimedWelcomeBonus = !!userData?.onboardingClaimed || (!isUnonBalanceLoading && numericUnonBalance >= 100);
    const canClaimWelcomeBonus = !!profileWalletAddress && (hasPendingWelcomeBonusClaim || (!isUnonBalanceLoading && !hasClaimedWelcomeBonus));

    return (
      <div className="page-container profile-container">
        {!currentUser ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ textAlign: 'center', padding: '60px 20px', background: 'rgba(255,255,255,0.03)', borderRadius: '32px', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            <div style={{ width: '80px', height: '80px', background: 'rgba(255,255,255,0.05)', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px auto' }}>
              <div className="loading-spinner" style={{ width: '40px', height: '40px', borderTopColor: 'var(--primary)' }} />
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '12px' }}>Preparing Your World ID Profile</h2>
            <p style={{ color: '#888', marginBottom: '12px' }}>This mini app authenticates automatically inside World App.</p>
            <p style={{ color: '#666', margin: 0, fontSize: '13px' }}>If this screen does not move forward, reopen the mini app from World App and try again.</p>
          </motion.div>
        ) : (
          <motion.div 
            className="profile-card-premium"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 20 }}
          >
            <div className="profile-avatar-glow">
              {currentUser.photoURL ? <img src={currentUser.photoURL} alt="Avatar" /> : <div className="avatar-placeholder"><User size={40} /></div>}
              <div className="level-badge-floating">LVL {userData?.level || 1}</div>
            </div>

            <motion.div
              className={`unon-profile-badge ${unonBadgeTier.tone}`}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.15, type: 'spring', damping: 18 }}
            >
              <button
                type="button"
                className="unon-badge-info-btn"
                onClick={() => setShowUnonBadgeInfoModal(true)}
                aria-label="Show UNON badge requirements"
              >
                i
              </button>
              <div className="unon-medal">
                <img src={unonBadgeTier.image} alt={`${unonBadgeTier.name} UNON badge`} />
              </div>
              <div className="unon-badge-copy">
                <div className="unon-badge-kicker">U&On HOLDER BADGE · LEVEL {unonBadgeTier.level}</div>
                <div className="unon-badge-title">{unonBadgeTier.name}</div>
                <div className="unon-badge-meta">
                  {unonBadgeTier.holderBand} · {unonBadgeTier.minBalance.toLocaleString()}+ UNON
                </div>
              </div>
            </motion.div>
            
            <div style={{ textAlign: 'center' }}>
              <h1 style={{ fontSize: '28px', fontWeight: '900', color: '#fff', marginBottom: '8px' }}>
                @{profileHandle}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', fontWeight: '600', fontFamily: 'monospace', padding: '4px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px' }}>
                  {currentUser.uid.substring(0, 6)}...{currentUser.uid.substring(currentUser.uid.length - 4)}
                </div>
              </div>
              <div className="profile-human-verified">
                <CheckCircle2 size={14} />
                <span>Human Identity Verified</span>
              </div>
              <div className="unon-badge-progress">
                <div>
                  <span>{nextUnonBadgeTier ? `Next: ${nextUnonBadgeTier.name}` : 'Highest badge unlocked'}</span>
                  <strong>
                    {nextUnonBadgeTier
                      ? `${Math.max(0, nextUnonBadgeTier.minBalance - numericUnonBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })} UNON needed`
                      : 'Top tier'}
                  </strong>
                </div>
                <div className="unon-badge-progress-track">
                  <motion.i
                    initial={{ width: 0 }}
                    animate={{ width: `${badgeProgress}%` }}
                    transition={{ delay: 0.4, duration: 0.8 }}
                  />
                </div>
              </div>
            </div>

            <div className="level-progress-container">
              <div className="level-progress-info">
                <span>Progress to Level {(userData?.level || 1) + 1}</span>
                <span>{progress.toFixed(0)}%</span>
              </div>
              <div className="level-progress-track">
                <motion.div 
                  className="level-progress-fill" 
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ delay: 0.5, duration: 1 }}
                />
              </div>
            </div>

            <div className="unon-balance-horizontal" style={{ width: '100%', marginBottom: '24px' }}>
              <motion.div 
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }}
                style={{ 
                  background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%)', 
                  borderRadius: '24px', 
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
                }}
              >
                <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '12px' }}>
                  <div style={{ 
                    fontSize: '10px', 
                    fontWeight: '900', 
                    color: 'rgba(0, 255, 255, 0.5)', 
                    letterSpacing: '3px', 
                    textTransform: 'uppercase',
                    marginBottom: '4px'
                  }}>
                    Available Balance
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#fff' }}>
                    U&On <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '12px', marginLeft: '4px' }}>(UNON)</span>
                  </div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ width: '44px', height: '44px', background: 'var(--primary)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 15px rgba(0, 255, 255, 0.2)' }}>
                    <Flame size={22} fill="#fff" color="#fff" />
                  </div>
                  
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '36px', fontWeight: '950', color: '#fff', letterSpacing: '-1.5px', lineHeight: '1' }}>
                      {unonBalance === null ? '--' : Number(unonBalance).toFixed(2)}
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: '900', color: 'var(--primary)', letterSpacing: '1px', marginTop: '4px' }}>ON-CHAIN BALANCE</div>
                  </div>
                </div>
                
                {canClaimWelcomeBonus && (
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleClaimOnboardingVerified}
                    disabled={isClaiming}
                    style={{
                      width: '100%',
                      marginTop: '16px',
                      padding: '16px',
                      borderRadius: '16px',
                      background: 'linear-gradient(90deg, #10b981, #059669)',
                      color: '#fff',
                      fontWeight: '900',
                      fontSize: '14px',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)'
                    }}
                  >
                    {isClaiming ? <div className="loading-spinner" style={{ width: '16px', height: '16px', borderTopColor: '#fff' }}></div> : <Zap size={18} />}
                    {isClaiming ? 'Checking 100 UNON claim...' : (userData?.onboardingClaimPendingHash ? 'VERIFY 100 UNON CLAIM STATUS' : 'CLAIM 100 UNON WELCOME BONUS')}
                  </motion.button>
                )}
                {!canClaimWelcomeBonus && isUnonBalanceLoading && !hasClaimedWelcomeBonus && (
                  <div style={{ marginTop: '16px', padding: '14px 16px', borderRadius: '14px', background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)', color: 'rgba(255,255,255,0.72)', fontSize: '13px', lineHeight: 1.5 }}>
                    Checking UNON balance and welcome bonus status...
                  </div>
                )}
                {!canClaimWelcomeBonus && !isUnonBalanceLoading && (
                  <div style={{ marginTop: '16px', padding: '14px 16px', borderRadius: '14px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.25)', color: '#bbf7d0', fontSize: '13px', lineHeight: 1.5 }}>
                    Your 100 UNON welcome bonus has already been claimed for this wallet.
                  </div>
                )}
              </motion.div>
            </div>

            <div className="profile-stats-dashboard" style={{ marginTop: '0' }}>
              <motion.div className="stat-card-premium level" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
                <div className="stat-icon"><Award size={18} /></div>
                <div className="stat-value">{userData?.level || 1}</div>
                <div className="stat-label">Level</div>
              </motion.div>
              <motion.div className="stat-card-premium rank" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}>
                <div className="stat-icon"><TrendingUp size={18} /></div>
                <div className="stat-value">Rank #12</div>
                <div className="stat-label">Global</div>
              </motion.div>
            </div>

            <div className="profile-menu-container">
              <button className="profile-menu-item" onClick={() => setShowHistoryModal(true)}>
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '12px' }}><Trophy size={18} /></div>
                <span>My Arena History</span>
              </button>
              <button className="profile-menu-item" onClick={() => setShowSettingsModal(true)}>
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '12px' }}><Settings size={18} /></div>
                <span>Arena Settings</span>
              </button>
              {isAdminUser && (
                <button className="profile-menu-item" onClick={() => setShowAdminPanel(true)}>
                  <div style={{ background: 'rgba(103,232,249,0.12)', padding: '10px', borderRadius: '12px' }}><Shield size={18} /></div>
                  <span>Admin Operations</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </div>
    );
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo-container" onClick={() => setCurrentTab('trend')}>
          <div className="logo-icon">U</div>
        </div>
        <div className="search-bar-container"><Search size={16} className="search-icon" /><input type="text" placeholder={t('search')} className="search-input" /></div>
        <div className="header-right-group">
          <div className="user-points"><Flame size={14} color="#00ffff" /><span>{userData?.points || 0}</span></div>
          <button type="button" className="profile-shortcut" onClick={() => setCurrentTab('profile')} aria-label={t('openProfile')}>
            <User size={16} />
          </button>
          <div className="language-selector-container">
            <button
              type="button"
              className={`language-selector-trigger ${isLanguageOpen ? 'open' : ''}`}
              onClick={(event) => {
                event.stopPropagation();
                setIsLanguageOpen(!isLanguageOpen);
                setIsRegionOpen(false);
              }}
              aria-label={t('selectLanguage')}
              title={t('selectLanguage')}
            >
              <Languages size={16} />
            </button>
            <AnimatePresence>
              {isLanguageOpen && (
                <motion.div
                  className="language-dropdown-list"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  {SUPPORTED_LANGUAGES.map(option => (
                    <button
                      type="button"
                      key={option.code}
                      className={language === option.code ? 'selected' : ''}
                      onClick={() => {
                        setLanguage(option.code);
                        setIsLanguageOpen(false);
                      }}
                    >
                      <span>{option.label}</span>
                      <small>{option.code.toUpperCase()}</small>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="region-selector-container">
            <motion.div className={`region-selector-trigger ${isRegionOpen ? 'open' : ''}`} onClick={(e) => { e.stopPropagation(); setIsRegionOpen(!isRegionOpen); setIsLanguageOpen(false); }} whileTap={{ scale: 0.95 }}>
              <MapPin size={12} className="region-icon" /><span className="region-name" style={{ fontSize: '12px' }}>{activeRegion === 'Southeast Asia' ? 'SEA' : (activeRegion.split(' ').pop() || activeRegion)}</span><ChevronDown size={12} className={`chevron-icon ${isRegionOpen ? 'rotate' : ''}`} />
            </motion.div>
            <AnimatePresence>
              {isRegionOpen && (
                <motion.div className="region-dropdown-list" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ right: 0, top: 'calc(100% + 10px)', width: '160px' }}>
                  {(() => {
                    const counts: Record<string, number> = {};
                    challenges.forEach(c => {
                      if (c.region) counts[c.region] = (counts[c.region] || 0) + 1;
                    });
                    
                    const sortedRegions = [...REGIONS].sort((a, b) => {
                      if (a === REGIONS[0]) return -1;
                      if (b === REGIONS[0]) return 1;
                      const countA = counts[a] || 0;
                      const countB = counts[b] || 0;
                      return countB - countA;
                    });

                    return sortedRegions.map(region => (
                      <div key={region} className={`region-option ${activeRegion === region ? 'selected' : ''}`} onClick={() => { setActiveRegion(region); setIsRegionOpen(false); }}>
                        <span style={{ flex: 1 }}>{region}</span>
                        <span style={{ fontSize: '10px', opacity: 0.5, marginLeft: '8px' }}>{(counts[region] || (region === REGIONS[0] ? challenges.length : 0))}</span>
                        {activeRegion === region && <div className="selected-dot" />}
                      </div>
                    ));
                  })()}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {(isChainConfigLoading || chainConfigError) && (
        <div className="chain-config-status">
          {isChainConfigLoading
            ? `Loading ${WORLD_CHAIN_LABEL} contract config...`
            : `Contract config unavailable. Using local fallback: ${chainConfigError}`}
        </div>
      )}

      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {currentTab === 'trend' && renderOnSection('trend')}
        {currentTab === 'battle' && renderOnSection('battle')}
        {currentTab === 'now' && renderOnSection('now')}
        {currentTab === 'rankings' && renderRankings()}
        {currentTab === 'create' && renderCreate()}
        {currentTab === 'profile' && renderProfile()}
      </main>

      <AnimatePresence>
        {showHistoryModal && (
          <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={() => setShowHistoryModal(false)}>
            <motion.div 
              className="modal-content" 
              onClick={e => e.stopPropagation()}
              initial={{ y: '100dvh' }} 
              animate={{ y: 0 }} 
              exit={{ y: '100dvh' }}
              style={{ height: '85dvh', padding: '24px', background: 'rgba(10, 10, 10, 0.95)', backdropFilter: 'blur(30px)', borderRadius: '32px 32px 0 0', borderTop: '1px solid var(--primary)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Trophy size={20} color="var(--primary)" />
                  <h2 style={{ fontSize: '20px', color: '#fff', fontWeight: '900' }}>MY ARENA HISTORY</h2>
                </div>
                <button onClick={() => setShowHistoryModal(false)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#fff', width: '36px', height: '36px', borderRadius: '18px' }}><X size={20} /></button>
              </div>

              <div style={{ height: 'calc(100% - 60px)', overflowY: 'auto', paddingBottom: '40px' }}>
                {isLoadingHistory ? (
                   <div style={{ padding: '60px', textAlign: 'center' }}>
                     <TrendingUp className="spinning" size={32} color="var(--primary)" />
                     <p style={{ marginTop: '16px', color: '#888' }}>Loading your history...</p>
                   </div>
                ) : userChallenges.length === 0 ? (
                   <div style={{ padding: '60px 40px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                     <Flame size={40} style={{ opacity: 0.3, marginBottom: '16px' }} />
                     <h3 style={{ fontSize: '18px', color: '#fff', marginBottom: '8px' }}>NO ARENAS FORGED YET</h3>
                     <p style={{ fontSize: '13px', color: '#888' }}>Ignite your first challenge from the Create tab!</p>
                   </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {userChallenges.map(c => (
                      <motion.div 
                        key={c.id} 
                        initial={{ opacity: 0, x: -10 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '16px' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                          <h4 style={{ fontSize: '15px', fontWeight: '800', color: '#fff' }}>{c.title}</h4>
                          <span style={{ fontSize: '10px', background: 'rgba(0, 255, 255, 0.1)', color: 'var(--secondary)', padding: '2px 8px', borderRadius: '8px' }}>{c.region}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#888' }}>
                            <Flame size={12} color="#ffaa00" />
                            <span>{formatScore(c.viralScore)} Viral Score</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#888' }}>
                            <TrendingUp size={12} color="var(--primary)" />
                            <span>{c.videoCount} Videos</span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {showSettingsModal && (
          <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={() => setShowSettingsModal(false)}>
            <motion.div 
              className="modal-content" 
              onClick={e => e.stopPropagation()}
              initial={{ y: '100dvh' }} 
              animate={{ y: 0 }} 
              exit={{ y: '100dvh' }}
              style={{ height: '65dvh', padding: '24px', background: 'rgba(10, 10, 10, 0.95)', backdropFilter: 'blur(30px)', borderRadius: '32px 32px 0 0', borderTop: '1px solid var(--secondary)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Settings size={20} color="var(--secondary)" />
                  <h2 style={{ fontSize: '20px', color: '#fff', fontWeight: '900' }}>{t('settings')}</h2>
                </div>
                <button onClick={() => setShowSettingsModal(false)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#fff', width: '36px', height: '36px', borderRadius: '18px' }}><X size={20} /></button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ padding: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <h4 style={{ fontSize: '14px', marginBottom: '4px', color: '#fff' }}>{t('profileVisibility')}</h4>
                  <p style={{ fontSize: '12px', color: '#888' }}>{t('profileVisibilityBody')}</p>
                </div>
                <div style={{ padding: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <h4 style={{ fontSize: '14px', marginBottom: '4px', color: '#fff' }}>{t('territoryPreference')}</h4>
                  <p style={{ fontSize: '12px', color: '#888' }}>{t('optimizedFor', { region: activeRegion })}</p>
                </div>
                <div style={{ padding: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)', marginTop: '20px' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--secondary)' }}>
                     <TrendingUp size={16} />
                     <span style={{ fontSize: '13px', fontWeight: '700' }}>U&On Alpha v1.2.0</span>
                   </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showUnonBadgeInfoModal && (
          <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={() => setShowUnonBadgeInfoModal(false)}>
            <motion.div
              className="modal-content unon-badge-info-modal"
              onClick={e => e.stopPropagation()}
              initial={{ y: '100dvh' }}
              animate={{ y: 0 }}
              exit={{ y: '100dvh' }}
            >
              <div className="unon-badge-info-header">
                <div>
                  <span>U&On Holder Badge</span>
                  <h2>Badge Requirements</h2>
                </div>
                <button onClick={() => setShowUnonBadgeInfoModal(false)} aria-label="Close UNON badge information">
                  <X size={20} />
                </button>
              </div>

              <p className="unon-badge-info-copy">
                Badges are applied from your on-chain U&On balance. Switch tabs to view holder tiers or PLATINUM+ benefits.
              </p>

              <div className="unon-badge-info-tabs" role="tablist" aria-label="UNON badge information sections">
                <button
                  type="button"
                  className={unonBadgeInfoTab === 'badges' ? 'active' : ''}
                  onClick={() => setUnonBadgeInfoTab('badges')}
                  role="tab"
                  aria-selected={unonBadgeInfoTab === 'badges'}
                >
                  Badges
                </button>
                <button
                  type="button"
                  className={unonBadgeInfoTab === 'benefits' ? 'active' : ''}
                  onClick={() => setUnonBadgeInfoTab('benefits')}
                  role="tab"
                  aria-selected={unonBadgeInfoTab === 'benefits'}
                >
                  Benefits
                </button>
              </div>

              <div className="unon-badge-info-panel">
                {unonBadgeInfoTab === 'badges' ? (
                  <div className="unon-badge-tier-grid">
                    {UNON_BADGE_TIERS.map((tier, index) => {
                      const unlocked = Number(unonBalance || 0) >= tier.minBalance;
                      return (
                        <div key={tier.level} className={`unon-badge-tier-card ${unlocked ? 'unlocked' : ''}`}>
                          <img src={tier.image} alt={`${tier.name} badge`} />
                          <div>
                            <strong>{index + 1}. {tier.name}</strong>
                            <span>{tier.holderBand}</span>
                            <small>{tier.minBalance.toLocaleString()}+ UNON</small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="unon-prize-challenge-info">
                    <strong>Prize Challenge Unlocks From PLATINUM</strong>
                    <p>
                      PLATINUM and higher holders can create timed prize challenges by staking UNON as prize money, setting the challenge period, and choosing how many winners will be paid.
                    </p>
                    <p>
                      Participants compete with WorldID-uploaded videos. Voters can vote once per video, and each vote consumes 1 UNON.
                    </p>
                    <p>
                      Winners receive the prize pool after a 3% operations fee. Voters who voted for the 1st-place video share the voted UNON pool after the same 3% operations fee.
                    </p>
                    <p>
                      Prize escrow, fee handling, automatic winner selection, payout, and voter reward claims are handled by smart contract rules.
                    </p>
                    <div className="unon-benefit-note">
                      PLATINUM minimum: 10,000 UNON
                      <br />
                      Vote cost: 1 UNON per video
                      <br />
                      Operations fee: 3%
                      </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

       <AnimatePresence>
        {showScrollTop && (
          <div className="scroll-top-container">
            <AnimatePresence>
              {showQuickNav && (
                <motion.div 
                  className="quick-nav-menu"
                  initial={{ opacity: 0, scale: 0.5, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.5, y: 20 }}
                >
                  <button onClick={() => scrollToSection('section-strike-first')}>
                    <Zap size={14} /> <span>STRIKE</span>
                  </button>
                  <button onClick={() => scrollToSection('section-editors-choice')}>
                    <Star size={14} /> <span>{publicDisplaySettings.editorsChoice.quickNavLabel}</span>
                  </button>
                  <button onClick={() => scrollToSection('section-new-trend')}>
                    <Flame size={14} /> <span>NEW</span>
                  </button>
                  <button onClick={() => scrollToSection('section-active-trends')}>
                    <TrendingUp size={14} /> <span>ACTIVE</span>
                  </button>
                  <div className="quick-nav-arrow" />
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button 
              className="scroll-top-btn"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              onPointerDown={startLongPress}
              onPointerUp={endLongPress}
              onMouseLeave={endLongPress}
              onClick={scrollToTop}
              whileTap={{ scale: 0.9 }}
            >
              <ChevronUp size={24} color="#fff" />
            </motion.button>
          </div>
        )}
      </AnimatePresence>

      <nav className="bottom-nav">
        <div className={`nav-item ${currentTab === 'trend' ? 'active' : ''}`} onClick={() => { setCurrentTab('trend'); }}><TrendingUp size={22} className="nav-icon" /><span className="nav-label">{t('navTrend')}</span></div>
        <div className={`nav-item ${currentTab === 'battle' ? 'active' : ''}`} onClick={() => { setCurrentTab('battle'); }}><Trophy size={22} className="nav-icon" /><span className="nav-label">{t('navBattle')}</span></div>
        <div className="nav-item" onClick={() => { setCurrentTab('create'); }}><div className={`logo-icon ${currentTab === 'create' ? 'active' : ''}`} style={{ width: '40px', height: '40px' }}><PlusCircle size={28} /></div><span className="nav-label">{t('navCreate')}</span></div>
        <div className={`nav-item ${currentTab === 'now' ? 'active' : ''}`} onClick={() => { setCurrentTab('now'); }}><Zap size={22} className="nav-icon" /><span className="nav-label">{t('navNow')}</span></div>
        <div className={`nav-item ${currentTab === 'rankings' ? 'active' : ''}`} onClick={() => { setCurrentTab('rankings'); }}><Crown size={22} className="nav-icon" /><span className="nav-label">{t('navRanking')}</span></div>
      </nav>

      <input
        ref={uploadVideoInputRef}
        type="file"
        accept="video/*"
        onChange={handleExistingVideoSelected}
        style={{ display: 'none' }}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -24, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {showAdminPanel && currentUser && (
        <AdminPanel currentUser={currentUser} onClose={() => setShowAdminPanel(false)} />
      )}

      {showCamera && selectedChallenge && (
        <CameraCapture 
           challengeTitle={selectedChallenge.title} 
           challengeId={selectedChallenge.id}
           authorName={profileUsername || MiniKit.user?.username || currentUser?.displayName || currentUser?.uid || 'Challenger'}
           authorUid={currentUser?.uid || null}
           authorWorldUsername={profileUsername || MiniKit.user?.username || null}
           initialMode={cameraEntryMode}
           initialBlob={selectedUploadBlob}
           remixSource={selectedRemixSource}
           onClose={() => {
             setShowCamera(false);
             setSelectedUploadBlob(null);
             setSelectedRemixSource(null);
             setShowUploadGuidanceModal(false);
           }} 
           onRecordingComplete={handleVideoUploadComplete} 
        />
      )}

      {showUploadGuidanceModal && selectedChallenge && !showCamera && (
        <div className="modal-overlay" style={{ zIndex: 3200 }} onClick={() => setShowUploadGuidanceModal(false)}>
          <motion.div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            style={{ padding: '24px', background: 'var(--surface)', borderRadius: '28px 28px 0 0', borderTop: '1px solid rgba(103,232,249,0.35)' }}
          >
            <div className="modal-header" style={{ padding: 0, marginBottom: '16px' }}>
              <h2>{t('uploadTitle')}</h2>
              <button
                onClick={() => setShowUploadGuidanceModal(false)}
                style={{ background: 'none', border: 'none', color: '#fff' }}
                aria-label={t('closeUpload')}
              >
                <X size={24} />
              </button>
            </div>
            <div style={{ display: 'grid', gap: '14px' }}>
              <div style={{ padding: '14px 16px', borderRadius: '14px', background: 'rgba(103,232,249,0.08)', border: '1px solid rgba(103,232,249,0.18)', color: '#dffbff', lineHeight: 1.5 }}>
                <strong style={{ display: 'block', color: '#67e8f9', marginBottom: '6px' }}>{t('uploadWarning')}</strong>
                {t('uploadHelp')}
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setShowUploadGuidanceModal(false);
                  void openExistingVideoPickerDirect();
                }}
                disabled={isPreparingCamera}
                style={{ width: '100%', minHeight: '54px', borderRadius: '16px', fontWeight: 900 }}
              >
                {t('continueFile')}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowUploadGuidanceModal(false)}
                style={{ width: '100%', minHeight: '48px', borderRadius: '14px' }}
              >
                {t('cancel')}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showLinkModal && selectedChallenge && (
        <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={() => setShowLinkModal(false)}>
          <motion.div 
            className="modal-content" 
            onClick={e => e.stopPropagation()}
            initial={{ y: '100%' }} 
            animate={{ y: 0 }}
            style={{ padding: '24px', background: 'var(--surface)', borderRadius: '32px 32px 0 0', borderTop: '1px solid var(--primary)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', color: '#fff' }}>Official Entry Submission</h2>
              <button onClick={() => setShowLinkModal(false)} style={{ background: 'none', border: 'none', color: '#888' }}><X size={24} /></button>
            </div>
            
            <p style={{ color: '#aaa', fontSize: '13px', marginBottom: '20px' }}>
              Paste the link to your public post (Instagram Reels, TikTok, or YouTube Shorts) to officially enter the battle!
            </p>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', color: 'var(--primary)', marginBottom: '8px', display: 'block' }}>Select Platform</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['instagram', 'tiktok', 'youtube'].map(p => (
                  <button 
                    key={p} 
                    onClick={() => setLinkForm({ ...linkForm, platform: p })}
                    style={{ 
                      flex: 1, 
                      padding: '10px', 
                      borderRadius: '12px', 
                      border: '1px solid', 
                      borderColor: linkForm.platform === p ? 'var(--primary)' : '#333',
                      background: linkForm.platform === p ? 'rgba(138, 43, 226, 0.2)' : 'transparent',
                      color: linkForm.platform === p ? '#fff' : '#888',
                      textTransform: 'capitalize',
                      fontSize: '12px'
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '12px', color: 'var(--primary)', marginBottom: '8px', display: 'block' }}>Social Post URL</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="https://..." 
                value={linkForm.url} 
                onChange={e => setLinkForm({ ...linkForm, url: e.target.value })}
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid #333', color: '#fff' }}
              />
            </div>

            <button 
              className="btn-primary" 
              onClick={submitSocialLink} 
              disabled={isSubmittingLink || !linkForm.url}
              style={{ width: '100%', padding: '16px', borderRadius: '16px', fontWeight: 'bold' }}
            >
              {isSubmittingLink ? 'Verifying...' : 'Finalize Entry 🚀'}
            </button>
          </motion.div>
        </div>
      )}

      {selectedChallenge && !showCamera && !showLinkModal && (
        <div className="modal-overlay" onClick={() => setSelectedChallenge(null)}>
          <motion.div className="modal-content" onClick={e => e.stopPropagation()} initial={{ y: '100%' }} animate={{ y: 0 }}>
            <div className="modal-header"><h2>Join Challenge</h2><button onClick={() => setSelectedChallenge(null)} style={{ background: 'none', border: 'none', color: '#fff' }}><X size={24} /></button></div>
            <div style={{ padding: '24px' }}>
              <p style={{ color: '#aaa', marginBottom: '18px', lineHeight: 1.5 }}>
                Choose how you want to enter <strong style={{ color: '#fff' }}>{selectedChallenge.title}</strong>.
              </p>
              <div style={{ display: 'grid', gap: '12px' }}>
                <button
                  type="button"
                  className="btn-primary"
                    onClick={() => requestCameraAndJoinChallenge('camera')}
                  disabled={isPreparingCamera}
                  style={{
                    width: '100%',
                    minHeight: '76px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    gap: '14px',
                    padding: '16px',
                    opacity: isPreparingCamera ? 0.75 : 1
                  }}
                >
                  <Video size={24} />
                  <span style={{ textAlign: 'left' }}>
                    <span style={{ display: 'block', fontSize: '15px', fontWeight: 900 }}>{isPreparingCamera ? 'Preparing...' : 'Record Now'}</span>
                    <span style={{ display: 'block', fontSize: '12px', opacity: 0.78, marginTop: '4px' }}>Open U&On camera and record up to 3 minutes.</span>
                  </span>
                  </button>
                  {selectedRemixSource && (
                    <div style={{ gridColumn: '1 / -1', padding: '12px', borderRadius: '14px', background: 'rgba(103,232,249,0.08)', border: '1px solid rgba(103,232,249,0.18)', color: '#dffbff', fontSize: '12px', lineHeight: 1.45 }}>
                      <strong style={{ display: 'block', color: '#67e8f9', marginBottom: '4px' }}>Remix source selected</strong>
                      {selectedRemixSource.title} by @{selectedRemixSource.author}
                    </div>
                  )}
                <button
                  type="button"
                  className="btn-primary"
                  onClick={openExistingVideoPicker}
                  disabled={isPreparingCamera}
                  style={{
                    width: '100%',
                    minHeight: '76px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    gap: '14px',
                    padding: '16px',
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.16)',
                    opacity: isPreparingCamera ? 0.75 : 1
                  }}
                >
                  <UploadCloud size={24} />
                  <span style={{ textAlign: 'left' }}>
                    <span style={{ display: 'block', fontSize: '15px', fontWeight: 900 }}>Upload Existing Video</span>
                    <span style={{ display: 'block', fontSize: '12px', opacity: 0.78, marginTop: '4px' }}>Pick a clip from your phone, then edit and submit.</span>
                  </span>
                </button>
              </div>
              <div style={{ marginTop: '16px', padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ color: 'rgba(255,255,255,0.66)', fontSize: '11px', fontWeight: 900, marginBottom: '8px' }}>Challenge hashtags</div>
                <div style={{ color: '#dce4ef', fontSize: '12px', lineHeight: 1.4, wordBreak: 'break-word' }}>{selectedChallenge.hashtags}</div>
                <button
                  type="button"
                  onClick={handleShareToInstagram}
                  style={{ marginTop: '10px', background: 'transparent', border: '0', color: 'var(--primary)', fontSize: '12px', fontWeight: 900, padding: 0 }}
                >
                  Copy hashtags
                </button>
              </div>
              {cameraPermissionError && (
                <div style={{ marginTop: '14px', padding: '14px 16px', borderRadius: '14px', background: 'rgba(255, 82, 82, 0.12)', border: '1px solid rgba(255, 82, 82, 0.24)', color: '#ffd4d4', fontSize: '13px', lineHeight: 1.5 }}>
                  {cameraPermissionError}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
}

export default App;
