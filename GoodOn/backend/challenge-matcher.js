const GENERIC_TAGS = new Set([
  'challenge',
  'challenges',
  'viral',
  'trending',
  'trend',
  'shorts',
  'short',
  'fyp',
  'foryou',
  'foryoupage',
  'wcb',
  'unon',
  'challengeon',
  'worldchallenge',
  'globaltrend',
  'dance',
  'funny',
  'popular'
]);

const TOKEN_CHARS = 'a-z0-9\\uac00-\\ud7a3\\u3040-\\u309f\\u30a0-\\u30ff\\u4e00-\\u9fff\\u0400-\\u04ff';
const TAG_CLEAN_RE = new RegExp(`[^${TOKEN_CHARS}]+`, 'gi');
const WORD_SPLIT_RE = new RegExp(`[^${TOKEN_CHARS}]+`, 'i');
const SHORT_FORM_URL_RE = /(?:youtube\.com\/shorts\/|youtu\.be\/shorts\/|tiktok\.com\/|instagram\.com\/(?:reel|reels)\/|naver\.com\/clip\/|tv\.naver\.com\/v\/|chzzk\.naver\.com\/clips\/)/i;
const SHORT_FORM_TEXT_RE = /(?:\bshorts?\b|\breels?\b|\btiktok\b|\bclip\b|쇼츠|릴스|클립)/i;

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTag(value) {
  return normalizeText(value)
    .replace(/^#/, '')
    .replace(TAG_CLEAN_RE, '');
}

function extractHashtags(text) {
  const matches = String(text || '').match(/#[\p{L}\p{N}_-]+/gu) || [];
  return Array.from(new Set(matches.map(normalizeTag).filter(Boolean)));
}

function splitWords(value) {
  return normalizeText(value)
    .replace(/challenge/g, ' ')
    .split(WORD_SPLIT_RE)
    .map((word) => normalizeTag(word))
    .filter((word) => word.length >= 3 && !GENERIC_TAGS.has(word));
}

function getChallengeSignals(challenge) {
  const hashtags = extractHashtags(challenge.hashtags || '');
  const primaryTag = normalizeTag(challenge.tag || hashtags[0] || '');
  const titleWords = splitWords(challenge.title || primaryTag);
  const tags = Array.from(new Set([primaryTag, ...hashtags].filter((tag) => tag && !GENERIC_TAGS.has(tag))));
  const aliases = Array.from(new Set([...tags, ...titleWords].filter((word) => word && !GENERIC_TAGS.has(word))));

  return {
    primaryTag,
    tags,
    aliases,
    titlePhrase: normalizeText((challenge.title || '').replace(/challenge/gi, ''))
  };
}

function hasExactHashtag(videoText, tag) {
  if (!tag || GENERIC_TAGS.has(tag)) return false;
  return extractHashtags(videoText).includes(tag);
}

function containsToken(text, token) {
  if (!token || GENERIC_TAGS.has(token)) return false;

  if (/^[a-z0-9]+$/i.test(token)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegex(token)}([^a-z0-9]|$)`, 'i').test(text);
  }

  return text.includes(token);
}

function containsCompactToken(text, token) {
  if (!token || token.length < 5 || GENERIC_TAGS.has(token)) return false;
  if (!/^[a-z0-9]+$/i.test(token)) return false;
  return normalizeTag(text).includes(token);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getVideoDurationSeconds(video) {
  const raw =
    video.durationSeconds ??
    video.duration_seconds ??
    video.durationSec ??
    video.duration ??
    video.lengthSeconds ??
    video.length_seconds;

  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);

  const parts = trimmed.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function scoreShortFormPreference(video) {
  const platform = normalizeText(video.platform || '');
  const title = video.videoTitle || video.video_title || '';
  const url = video.externalUrl || video.external_url || video.videoUrl || video.video_url || '';
  const text = `${title} ${url}`;
  const duration = getVideoDurationSeconds(video);
  let score = 0;
  const reasons = [];

  if (['tiktok', 'instagram'].includes(platform)) {
    score += 80;
    reasons.push(`short_platform:${platform}`);
  }

  if (platform === 'youtube' && /youtube\.com\/shorts\//i.test(url)) {
    score += 90;
    reasons.push('youtube_shorts_url');
  }

  if (SHORT_FORM_URL_RE.test(url)) {
    score += 70;
    reasons.push('short_form_url');
  }

  if (SHORT_FORM_TEXT_RE.test(text)) {
    score += 25;
    reasons.push('short_form_text');
  }

  if (duration !== null) {
    if (duration > 0 && duration <= 90) {
      score += 70;
      reasons.push('short_duration');
    } else if (duration > 180) {
      score -= 80;
      reasons.push('long_duration_penalty');
    }
  }

  return { score, reasons, duration };
}

function scoreVideoForChallenge(video, challenge) {
  const title = video.videoTitle || video.video_title || '';
  const url = video.externalUrl || video.external_url || video.videoUrl || video.video_url || '';
  const text = normalizeText(`${title} ${url}`);
  const signals = getChallengeSignals(challenge);
  let score = 0;
  const reasons = [];

  for (const tag of signals.tags) {
    if (hasExactHashtag(title, tag) || hasExactHashtag(url, tag)) {
      score += tag === signals.primaryTag ? 120 : 90;
      reasons.push(`exact_hashtag:${tag}`);
    }
  }

  if (signals.titlePhrase.length >= 4 && text.includes(signals.titlePhrase)) {
    score += 70;
    reasons.push('title_phrase');
  }

  for (const alias of signals.aliases) {
    if (containsToken(text, alias)) {
      score += alias === signals.primaryTag ? 45 : 25;
      reasons.push(`alias:${alias}`);
    } else if (containsCompactToken(text, alias)) {
      score += alias === signals.primaryTag ? 90 : 45;
      reasons.push(`compact_alias:${alias}`);
    }
  }

  if (String(url).toLowerCase().includes(`/tag/${signals.primaryTag}`) || String(url).toLowerCase().includes(`hashtag/${signals.primaryTag}`)) {
    score += 120;
    reasons.push('platform_tag_url');
  }

  const shortForm = scoreShortFormPreference(video);
  score += shortForm.score;
  reasons.push(...shortForm.reasons);

  const accepted = score >= 80 && reasons.some((reason) => (
    reason.startsWith('exact_hashtag:')
    || reason === 'platform_tag_url'
    || reason === 'title_phrase'
    || reason.startsWith('compact_alias:')
  ));

  return {
    score,
    accepted,
    reasons,
    signals,
    shortForm
  };
}

function findBestChallengeForVideo(video, challenges) {
  let best = null;
  let bestResult = { score: -1, accepted: false, reasons: [], signals: {} };

  for (const challenge of challenges) {
    const result = scoreVideoForChallenge(video, challenge);
    if (
      result.score > bestResult.score
      || (result.score === bestResult.score && best && result.signals.primaryTag.length > (bestResult.signals.primaryTag || '').length)
    ) {
      best = challenge;
      bestResult = result;
    }
  }

  return {
    challenge: best,
    ...bestResult
  };
}

module.exports = {
  GENERIC_TAGS,
  extractHashtags,
  findBestChallengeForVideo,
  getChallengeSignals,
  getVideoDurationSeconds,
  normalizeTag,
  normalizeText,
  scoreShortFormPreference,
  scoreVideoForChallenge
};
