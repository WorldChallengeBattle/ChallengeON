// Removed direct Firebase imports for challenges, now using backend API
import { apiUrl } from '../config/api';

export interface Challenge {
  id: string;
  title: string;
  hashtags: string;
  region: string;
  viralScore: number;
  participants: number;
  bgGradient: string;
  isOfficial?: boolean;
  category?: string;
  createdAt?: any;
  videoCount?: number;
  userVideoCount?: number;
  externalVideoCount?: number;
  likes?: number;
  dislikes?: number;
  createdByUid?: string | null;
  creatorWalletAddress?: string | null;
  challengeMode?: 'trend' | 'battle' | 'now';
  notice?: string | null;
  eventConfig?: Record<string, unknown>;
  rewardUnon?: string | null;
  challengeType?: 'standard' | 'prize';
  prizeStatus?: string | null;
  prizePoolUnon?: string | null;
  prizePoolWei?: string | null;
  prizeOnchainChallengeId?: string | null;
  prizeManagerAddress?: string | null;
  prizeCreateTxHash?: string | null;
  prizeFinalizeTxHash?: string | null;
  prizeSubmissionStart?: string | null;
  prizeSubmissionEnd?: string | null;
  prizeVotingEnd?: string | null;
  prizeWinnerCount?: number | null;
  prizeWinnerSplitsBps?: number[];
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  ctaLabel?: string | null;
  ctaTarget?: string | null;
  isImportant: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt?: string;
}

export interface EditorsChoiceDisplaySettings {
  title: string;
  subtitle: string;
  aiBadge: string;
  defaultBadge: string;
  pickBadge: string;
  rankingPrefix: string;
  rankingSuffix: string;
  quickNavLabel: string;
}

export interface PublicDisplaySettings {
  editorsChoice: EditorsChoiceDisplaySettings;
}

export const DEFAULT_PUBLIC_DISPLAY_SETTINGS: PublicDisplaySettings = {
  editorsChoice: {
    title: "Mar 2026 Editor's Choice",
    subtitle: 'Handpicked Global Trends',
    aiBadge: 'AI VERIFIED',
    defaultBadge: 'MUST WATCH',
    pickBadge: "EDITOR'S PICK",
    rankingPrefix: 'TOP',
    rankingSuffix: 'INSIGHT',
    quickNavLabel: 'CHOICE'
  }
};

// Removed Mock Data per User Request

const gradientPresets = [
  'linear-gradient(45deg, #2a0845, #6441A5)',
  'linear-gradient(45deg, #1A2980, #26D0CE)',
  'linear-gradient(45deg, #b224ef, #7579ff)',
  'linear-gradient(45deg, #4b1248, #F0C27B)'
];

export const getChallenges = async (): Promise<Challenge[]> => {
  try {
    const res = await fetch(apiUrl('/api/challenges'));
    if (res.ok) {
      const result = await res.json();
      if (result.success && result.data) {
        return result.data;
      }
    }
  } catch (e) {
    console.error("Failed to fetch real challenges from backend:", e);
  }
  return [];
};

export const getAnnouncements = async (): Promise<Announcement[]> => {
  try {
    const res = await fetch(apiUrl('/api/announcements'));
    if (res.ok) {
      const result = await res.json();
      if (result.success && result.data) {
        return result.data;
      }
    }
  } catch (e) {
    console.error("Failed to fetch announcements from backend:", e);
  }
  return [];
};

export const getPublicSettings = async (): Promise<PublicDisplaySettings> => {
  try {
    const res = await fetch(apiUrl('/api/public-settings'));
    if (res.ok) {
      const result = await res.json();
      if (result.success && result.data?.editorsChoice) {
        return {
          editorsChoice: {
            ...DEFAULT_PUBLIC_DISPLAY_SETTINGS.editorsChoice,
            ...result.data.editorsChoice
          }
        };
      }
    }
  } catch (e) {
    console.error("Failed to fetch public display settings from backend:", e);
  }
  return DEFAULT_PUBLIC_DISPLAY_SETTINGS;
};

export const createChallenge = async (challengeData: Omit<Challenge, 'id' | 'createdAt' | 'bgGradient' | 'participants' | 'viralScore'>): Promise<Challenge> => {
  const newGradient = gradientPresets[Math.floor(Math.random() * gradientPresets.length)];
  const completeData = {
    ...challengeData,
    viralScore: 0,
    participants: 0,
    bgGradient: newGradient
  };

  try {
    const response = await fetch(apiUrl('/api/challenges'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(completeData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (result.success && result.data) {
      return result.data;
    }
    throw new Error(result.error || 'Failed to create challenge');
  } catch (error) {
    console.error("Failed to create challenge via backend:", error);
    // Fallback/Simulate for UI continuity if backend is down
    return { ...completeData, id: `temp_${Date.now()}` } as Challenge;
  }
};

export const joinChallenge = async (challengeId: string): Promise<void> => {
  try {
    const response = await fetch(apiUrl(`/api/challenges/${challengeId}/join`), {
      method: 'POST'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error("Failed to join challenge via backend:", error);
  }
};

export const updateChallenge = async (id: string, updates: { title?: string, hashtags?: string }): Promise<Challenge> => {
  try {
    const response = await fetch(apiUrl(`/api/challenges/${id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const result = await response.json();
    if (result.success) return result.data;
    throw new Error(result.error || 'Failed to update challenge');
  } catch (error) {
    console.error("Update failed:", error);
    throw error;
  }
};

export const deleteChallenge = async (id: string): Promise<void> => {
  try {
    const response = await fetch(apiUrl(`/api/challenges/${id}`), {
      method: 'DELETE'
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error("Delete failed:", error);
    throw error;
  }
};

export interface ChallengeOnVideo {
  id: string;
  author: string;
  platform: 'instagram' | 'tiktok' | 'youtube';
  viewCount: number;
  videoTitle?: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  externalUrl?: string;
  authorUid?: string | null;
  authorWalletAddress?: string | null;
  authorWorldUsername?: string | null;
  uploaderComment?: string | null;
  onchainVideoId?: string | null;
  prizeEligible?: boolean;
  entryRegisteredTx?: string | null;
}

const normalizeVideo = (video: any): ChallengeOnVideo => ({
  id: String(video.id || ''),
  author: video.author || 'Creator',
  platform: video.platform || 'instagram',
  viewCount: Number(video.viewCount ?? video.view_count ?? 0),
  videoTitle: video.videoTitle ?? video.video_title ?? video.title ?? 'Trending Entry',
  thumbnailUrl: video.thumbnailUrl ?? video.thumbnail_url ?? video.thumbnail ?? '',
  videoUrl: video.videoUrl ?? video.video_url ?? video.url ?? '',
  externalUrl: video.externalUrl ?? video.external_url ?? video.webVideoUrl ?? '',
  authorUid: video.authorUid ?? video.author_uid ?? null,
  authorWalletAddress: video.authorWalletAddress ?? video.author_wallet_address ?? video.uploader_wallet_address ?? null,
  authorWorldUsername: video.authorWorldUsername ?? video.author_world_username ?? null,
  uploaderComment: video.uploaderComment ?? video.uploader_comment ?? null,
  onchainVideoId: video.onchainVideoId ?? video.onchain_video_id ?? null,
  prizeEligible: Boolean(video.prizeEligible ?? video.prize_eligible ?? false),
  entryRegisteredTx: video.entryRegisteredTx ?? video.entry_registered_tx ?? null
});

export const getChallengeVideos = async (
  challengeId: string,
  hashtags: string = '#GoodON #kindnesson #PraiseRelay',
  mode?: 'trend' | 'battle' | 'now'
): Promise<ChallengeOnVideo[]> => {
  try {
    const response = await fetch(apiUrl('/api/challenge-videos'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        challengeId, 
        hashtags,
        mode
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    if (result.success && result.data) {
      return result.data.map(normalizeVideo); // Shuffling is handled by backend
    }
    throw new Error(result.error || 'Invalid API response');
  } catch (error) {
    console.error("Backend scraping API unavaliable or failed, falling back to local simulation:", error);
    // Simulate network latency as fallback
    await new Promise(r => setTimeout(r, 800));
    
    // Return dummy data corresponding to the requested challenge
    const mockVideos: ChallengeOnVideo[] = Array.from({ length: 5 }).map((_, idx) => ({
      id: `${challengeId}-fallback-${idx}`,
      author: `user_${Math.floor(Math.random() * 9000) + 1000}`,
      platform: 'instagram', // Default fallback platform
      videoTitle: `Watch this ${challengeId} good-deed story!`,
      viewCount: Math.floor(Math.random() * 500000) + 1000,
    }));
    
    return mockVideos.sort((a,b) => b.viewCount - a.viewCount);
  }
};
