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
