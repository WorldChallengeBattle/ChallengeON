export function getVideoSourceId(video: { id: string; platform: string; videoUrl?: string }) {
  const prefix = `${video.platform}_`;
  if (video.id.startsWith(prefix)) return video.id.slice(prefix.length);
  if (video.platform === 'youtube' && video.id.startsWith('yt_')) return video.id.slice(3);
  const patterns: Record<string, RegExp> = {
    youtube: /(?:shorts\/|v=|v\/|embed\/|youtu.be\/)([^?&#/]+)/,
    tiktok: /video\/(\d+)/,
    instagram: /(?:\/p\/|\/reels\/|\/reel\/)([^/?#&]+)/
  };
  return video.videoUrl?.match(patterns[video.platform] || /$^/)?.[1] || video.id;
}

export function getSocialVideoEmbedUrl(video: { id: string; platform: string; videoUrl?: string }, autoplay: boolean) {
  const id = getVideoSourceId(video);
  if (video.platform === 'tiktok' && /^\d{6,30}$/.test(id)) {
    return `https://www.tiktok.com/player/v1/${id}?autoplay=${autoplay ? 1 : 0}&controls=1&description=1&music_info=1`;
  }
  if (video.platform === 'instagram' && /^[A-Za-z0-9_-]{5,20}$/.test(id)) {
    const type = video.videoUrl?.match(/instagram\.com\/(p|reel|reels)\//i)?.[1]?.toLowerCase();
    return `https://www.instagram.com/${type === 'p' ? 'p' : 'reel'}/${id}/embed/`;
  }
  return '';
}
