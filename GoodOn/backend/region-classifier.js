const REGION_GLOBAL = 'Global 🌍';

const REGION_RULES = [
  {
    region: 'Korea 🇰🇷',
    script: /[\uac00-\ud7a3]/,
    keywords: [
      'korea', 'korean', 'kpop', 'k-pop', 'seoul', 'busan', 'gangnam',
      'kr', '한국', '대한민국', '서울', '부산', '강남', '케이팝', '챌린지'
    ]
  },
  {
    region: 'Japan 🇯🇵',
    script: /[\u3040-\u30ff]/,
    keywords: [
      'japan', 'japanese', 'tokyo', 'osaka', 'anime', 'jpop', 'j-pop',
      'jp', '日本', '東京', '大阪'
    ]
  },
  {
    region: 'China 🇨🇳',
    script: /[\u4e00-\u9fff]/,
    keywords: [
      'china', 'chinese', 'beijing', 'shanghai', 'mandarin', 'douyin',
      'cn', '中国', '中文', '北京', '上海', '抖音'
    ]
  },
  {
    region: 'Russia 🇷🇺',
    script: /[\u0400-\u04ff]/,
    keywords: ['russia', 'russian', 'moscow', 'ru', 'россия', 'москва']
  },
  {
    region: 'Middle East 🐪',
    script: /[\u0600-\u06ff]/,
    keywords: [
      'middle east', 'arab', 'arabic', 'dubai', 'uae', 'saudi', 'qatar',
      'kuwait', 'egypt', 'turkey', 'istanbul'
    ]
  },
  {
    region: 'France 🇫🇷',
    keywords: ['france', 'french', 'paris', 'francais', 'français', 'defi', 'défi']
  },
  {
    region: 'Germany 🇩🇪',
    keywords: ['germany', 'german', 'berlin', 'deutsch', 'deutschland', 'herausforderung']
  },
  {
    region: 'UK 🇬🇧',
    keywords: ['uk', 'united kingdom', 'britain', 'british', 'england', 'london', 'manchester']
  },
  {
    region: 'USA 🇺🇸',
    keywords: [
      'usa', 'u.s.a', 'united states', 'america', 'american', 'nyc',
      'new york', 'los angeles', 'california', 'texas', 'miami', 'atlanta'
    ]
  },
  {
    region: 'Southeast Asia',
    script: /[\u0e00-\u0e7f]/,
    keywords: [
      'southeast asia', 'sea', 'thailand', 'thai', 'bangkok', 'vietnam',
      'vietnamese', 'hanoi', 'indonesia', 'jakarta', 'malaysia',
      'philippines', 'filipino', 'singapore', 'myanmar', 'cambodia'
    ]
  },
  {
    region: 'Europe 🇪🇺',
    keywords: [
      'europe', 'european', 'italy', 'italian', 'spain', 'spanish',
      'netherlands', 'sweden', 'poland', 'portugal'
    ]
  }
];

function normalizeRegion(region) {
  const text = String(region || '').toLowerCase();
  if (!text) return REGION_GLOBAL;
  const match = REGION_RULES.find((rule) => text.includes(rule.region.split(' ')[0].toLowerCase()));
  if (match) return match.region;
  if (text.includes('global')) return REGION_GLOBAL;
  if (text.includes('south east') || text.includes('southeast') || text === 'sea') return 'Southeast Asia';
  return region || REGION_GLOBAL;
}

function getRegionText(source) {
  if (!source || typeof source !== 'object') return String(source || '');
  return [
    source.title,
    source.hashtags,
    source.region,
    source.videoTitle,
    source.video_title,
    source.videoUrl,
    source.video_url,
    source.externalUrl,
    source.external_url,
    source.author,
    source.uploader_comment
  ].filter(Boolean).join(' ');
}

function inferRegionDetails(source) {
  const rawText = getRegionText(source);
  const text = rawText.normalize('NFKC').toLowerCase();
  const scored = REGION_RULES.map((rule) => {
    let score = 0;
    const reasons = [];

    if (rule.script?.test(rawText)) {
      score += 45;
      reasons.push('script');
    }

    for (const keyword of rule.keywords) {
      const normalizedKeyword = keyword.toLowerCase();
      if (!normalizedKeyword) continue;
      if (text.includes(normalizedKeyword)) {
        score += normalizedKeyword.length <= 3 ? 20 : 34;
        reasons.push(`keyword:${keyword}`);
      }
    }

    return { region: rule.region, score, reasons };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0] || { region: REGION_GLOBAL, score: 0, reasons: [] };
  if (best.score < 34) {
    return { region: REGION_GLOBAL, score: 0, reasons: [] };
  }

  return best;
}

function inferRegion(source) {
  return inferRegionDetails(source).region;
}

function isGlobalRegion(region) {
  return normalizeRegion(region).includes('Global');
}

function sameRegion(a, b) {
  return normalizeRegion(a) === normalizeRegion(b);
}

function scoreRegionFit(source, targetRegion) {
  const inferred = inferRegionDetails(source);
  const normalizedTarget = normalizeRegion(targetRegion);

  if (inferred.region === REGION_GLOBAL || normalizedTarget === REGION_GLOBAL) {
    return { score: 0, inferred };
  }

  return {
    score: sameRegion(inferred.region, normalizedTarget) ? 80 : -70,
    inferred
  };
}

module.exports = {
  REGION_GLOBAL,
  inferRegion,
  inferRegionDetails,
  isGlobalRegion,
  normalizeRegion,
  sameRegion,
  scoreRegionFit
};
