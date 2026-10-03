import type { Challenge } from './challengeService';

export type OnMode = 'trend' | 'battle' | 'now';
export type DiscoverySort = 'popular' | 'recent' | 'videos';

export const normalizeRegion = (region: string) => region.normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();

export function discoverChallenges(challenges: Challenge[], options: {
  mode: OnMode; region: string; query: string; platform: string;
  sort: DiscoverySort; savedOnly: boolean; savedIds: string[];
}) {
  const terms = options.query.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const region = normalizeRegion(options.region);
  const count = (c: Challenge) => options.mode === 'trend'
    ? (c.externalVideoCount ?? c.videoCount ?? 0)
    : (c.userVideoCount ?? c.videoCount ?? 0);
  const recent = (c: Challenge) => {
    // A sync attempt is not a fresh video: use the latest stored video timestamp.
    const date = Date.parse(c.latestVideoAt || c.createdAt || '');
    return Number.isFinite(date) ? date : 0;
  };
  return challenges.filter(c => {
    const mode = c.challengeMode || (c.challengeType === 'prize' ? 'battle' : 'trend');
    if (options.mode === 'battle' ? mode !== 'battle' && !(c.userVideoCount || 0) : mode !== options.mode) return false;
    if (options.mode === 'trend' && count(c) === 0) return false;
    const itemRegion = normalizeRegion(c.region || 'Global');
    if (region !== 'global' && itemRegion !== region && itemRegion !== 'global') return false;
    if (options.platform !== 'all' && !c.platforms?.includes(options.platform)) return false;
    if (options.savedOnly && !options.savedIds.includes(c.id)) return false;
    const text = `${c.title} ${c.hashtags} ${c.notice || ''}`.normalize('NFKC').toLowerCase();
    return terms.every(term => text.includes(term));
  }).sort((a, b) => {
    if (options.sort === 'recent') return recent(b) - recent(a) || a.id.localeCompare(b.id);
    if (options.sort === 'videos') return count(b) - count(a) || a.id.localeCompare(b.id);
    if (options.mode === 'battle') {
      const prize = Number(b.challengeType === 'prize') - Number(a.challengeType === 'prize');
      if (prize) return prize;
    }
    return (b.viralScore || 0) - (a.viralScore || 0) || a.id.localeCompare(b.id);
  });
}
