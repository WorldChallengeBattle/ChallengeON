import React, { useEffect, useRef, useState } from 'react';
import { Play, Star, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MiniKit } from '@worldcoin/minikit-js';

interface VideoPlayerProps {
  video: {
    id: string;
    platform: string;
    videoUrl?: string;
    thumbnailUrl?: string;
    duration?: number;
    author?: string;
  };
  isMuted?: boolean;
  onEnded?: () => void;
  onDelete?: () => void;
  onSupport?: () => void;
  isActive?: boolean;
  shouldPreload?: boolean;
  showGoldShower?: boolean;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  video,
  isMuted = false,
  onEnded,
  onDelete,
  onSupport,
  isActive,
  shouldPreload = false,
  showGoldShower
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const isActiveRef = useRef(isActive);
  const isMutedRef = useRef(isMuted);
  const onEndedRef = useRef(onEnded);
  const onDeleteRef = useRef(onDelete);
  const unavailableReportedRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const hasWorldMiniKit = MiniKit.isInstalled();

  const [soundAutoplayUnlocked, setSoundAutoplayUnlocked] = useState(() => {
    if (!MiniKit.isInstalled()) return true;
    return localStorage.getItem('challengeOnSoundAutoplayUnlocked') === 'true';
  });
  const soundAutoplayUnlockedRef = useRef(soundAutoplayUnlocked);
  const [isInView, setIsInView] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [embedLoaded, setEmbedLoaded] = useState(false);

  const isDirectVideoUrl = (url?: string) => {
    if (!url) return false;
    if (/^(blob:|data:video\/)/i.test(url)) return true;
    if (/\.(mp4|webm|mov|m4v|m3u8)(\?|#|$)/i.test(url)) return true;
    return /^https?:\/\//i.test(url)
      && !/(youtube\.com|youtu\.be|tiktok\.com|instagram\.com)/i.test(url);
  };

  const shouldUseNativeVideo = isDirectVideoUrl(video.videoUrl);
  const shouldMountNativeVideo = shouldUseNativeVideo && (!!isActive || shouldPreload);
  const shouldMountEmbed = !shouldUseNativeVideo && !!isActive;
  const shouldMountMedia = shouldMountNativeVideo || shouldMountEmbed;
  const shouldPrimeYouTubeMuted = video.platform === 'youtube'
    && hasWorldMiniKit
    && !soundAutoplayUnlocked
    && !isMuted;

  useEffect(() => {
    isActiveRef.current = isActive;
    isMutedRef.current = isMuted;
    onEndedRef.current = onEnded;
    onDeleteRef.current = onDelete;
  }, [isActive, isMuted, onEnded, onDelete]);

  useEffect(() => {
    soundAutoplayUnlockedRef.current = soundAutoplayUnlocked;
  }, [soundAutoplayUnlocked]);

  useEffect(() => {
    unavailableReportedRef.current = false;
    setAutoplayBlocked(false);
    setEmbedLoaded(false);
  }, [soundAutoplayUnlocked, video.id]);

  const reportUnavailable = (reason: string) => {
    if (unavailableReportedRef.current) return;
    unavailableReportedRef.current = true;
    console.warn(`Removing unplayable video (${reason}):`, video.id);
    onDeleteRef.current?.();
  };

  const playCurrentVideo = () => {
    if (!shouldUseNativeVideo && video.platform === 'youtube' && playerRef.current) {
      if (isMutedRef.current || shouldPrimeYouTubeMuted) playerRef.current.mute();
      else playerRef.current.unMute();
      playerRef.current.playVideo();
      return true;
    }

    if (shouldUseNativeVideo && videoRef.current) {
      videoRef.current.muted = isMutedRef.current;
      videoRef.current.play()
        .then(() => setAutoplayBlocked(false))
        .catch((error) => {
          console.warn('Playback blocked:', error);
          setAutoplayBlocked(true);
        });
      return true;
    }

    return false;
  };

  const playCurrentVideoWithSound = () => {
    if (!shouldUseNativeVideo && video.platform === 'youtube' && playerRef.current) {
      playerRef.current.unMute();
      playerRef.current.playVideo();
      return true;
    }

    if (shouldUseNativeVideo && videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.play()
        .then(() => setAutoplayBlocked(false))
        .catch((error) => {
          console.warn('Playback blocked:', error);
          setAutoplayBlocked(true);
        });
      return true;
    }

    return playCurrentVideo();
  };

  useEffect(() => {
    const handleSoundUnlock = () => {
      soundAutoplayUnlockedRef.current = true;
      setSoundAutoplayUnlocked(true);
      if (isActiveRef.current) playCurrentVideo();
    };

    window.addEventListener('challengeon:sound-autoplay-unlocked', handleSoundUnlock);
    return () => window.removeEventListener('challengeon:sound-autoplay-unlocked', handleSoundUnlock);
  }, [shouldUseNativeVideo, video.id, video.platform]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { threshold: 0, rootMargin: '250px' }
    );

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (shouldUseNativeVideo || video.platform !== 'youtube' || !shouldMountMedia || !isInView) return;

    const markBlockedIfNotPlaying = () => {
      window.setTimeout(() => {
        const yt = (window as any).YT;
        if (!playerRef.current || !yt?.PlayerState || !isActiveRef.current) return;

        if (playerRef.current.getPlayerState?.() !== yt.PlayerState.PLAYING) {
          if (hasWorldMiniKit && soundAutoplayUnlockedRef.current) {
            if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
            retryTimerRef.current = window.setTimeout(() => {
              if (isActiveRef.current) playCurrentVideo();
            }, 1200);
          } else if (!hasWorldMiniKit) {
            setAutoplayBlocked(true);
          }
        }
      }, 900);
    };

    const initPlayer = () => {
      if ((window as any).YT?.Player && !playerRef.current) {
        playerRef.current = new (window as any).YT.Player(`yt-player-${video.id}`, {
          playerVars: {
            autoplay: isActiveRef.current && soundAutoplayUnlockedRef.current ? 1 : 0,
            playsinline: 1,
            controls: 1,
            mute: shouldPrimeYouTubeMuted ? 1 : isMutedRef.current ? 1 : 0,
            rel: 0,
            modestbranding: 1,
            iv_load_policy: 3
          },
          events: {
            onReady: (event: any) => {
              setIsPlayerReady(true);
              setEmbedLoaded(true);
              if (isActiveRef.current && soundAutoplayUnlockedRef.current) {
                if (isMutedRef.current || shouldPrimeYouTubeMuted) event.target.mute();
                else event.target.unMute();
                event.target.playVideo();
                markBlockedIfNotPlaying();
              }
            },
            onStateChange: (event: any) => {
              if (event.data === (window as any).YT.PlayerState.PLAYING) {
                setEmbedLoaded(true);
                setAutoplayBlocked(false);
              }
              if (event.data === (window as any).YT.PlayerState.ENDED) {
                onEndedRef.current?.();
              }
            },
            onError: (event: any) => {
              if ([2, 5, 100, 101, 150].includes(event.data)) {
                reportUnavailable(`youtube-${event.data}`);
              }
            }
          }
        });
      }
    };

    if ((window as any).YT?.Player) initPlayer();
    else (window as any).onYouTubeIframeAPIReady = initPlayer;

    return () => {
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
        setIsPlayerReady(false);
      }
    };
  }, [hasWorldMiniKit, isActive, isInView, shouldMountMedia, shouldPrimeYouTubeMuted, shouldUseNativeVideo, video.id, video.platform]);

  useEffect(() => {
    if (shouldUseNativeVideo || !playerRef.current || !isPlayerReady) return;

    if (isActive && soundAutoplayUnlocked) {
      if (isMuted || shouldPrimeYouTubeMuted) playerRef.current.mute();
      else playerRef.current.unMute();
      playerRef.current.playVideo();

      window.setTimeout(() => {
        const yt = (window as any).YT;
        if (!playerRef.current || !yt?.PlayerState || !isActive) return;
        if (playerRef.current.getPlayerState?.() !== yt.PlayerState.PLAYING) {
          if (hasWorldMiniKit && soundAutoplayUnlockedRef.current) playCurrentVideo();
          else if (!hasWorldMiniKit) setAutoplayBlocked(true);
        }
      }, 900);
    } else {
      playerRef.current.pauseVideo();
      setAutoplayBlocked(false);
    }
  }, [hasWorldMiniKit, isActive, isMuted, isPlayerReady, shouldPrimeYouTubeMuted, shouldUseNativeVideo, soundAutoplayUnlocked]);

  useEffect(() => {
    if (!shouldUseNativeVideo || !videoRef.current) return;

    if (!video.videoUrl) {
      reportUnavailable('missing-video-url');
      return;
    }

    if (isActive && isInView && soundAutoplayUnlocked) {
      playCurrentVideo();
    } else {
      videoRef.current.pause();
      setAutoplayBlocked(false);
    }
  }, [isActive, isInView, shouldUseNativeVideo, soundAutoplayUnlocked, video.id, video.videoUrl]);

  const unlockSoundAutoplay = () => {
    localStorage.setItem('challengeOnSoundAutoplayUnlocked', 'true');
    soundAutoplayUnlockedRef.current = true;
    setSoundAutoplayUnlocked(true);
    window.dispatchEvent(new Event('challengeon:sound-autoplay-unlocked'));
    playCurrentVideoWithSound();
  };

  const handleManualPlay = () => {
    setAutoplayBlocked(false);
    playCurrentVideoWithSound();
  };

  useEffect(() => {
    if (!isActive || !hasWorldMiniKit || !soundAutoplayUnlocked) return;

    const retryFromGesture = () => {
      setAutoplayBlocked(false);
      playCurrentVideo();
    };

    window.addEventListener('pointerdown', retryFromGesture, { capture: true });
    window.addEventListener('touchstart', retryFromGesture, { capture: true, passive: true });
    window.addEventListener('click', retryFromGesture, { capture: true });

    return () => {
      window.removeEventListener('pointerdown', retryFromGesture, { capture: true });
      window.removeEventListener('touchstart', retryFromGesture, { capture: true });
      window.removeEventListener('click', retryFromGesture, { capture: true });
    };
  }, [hasWorldMiniKit, isActive, shouldUseNativeVideo, soundAutoplayUnlocked, video.id, video.platform]);

  const getPlatformId = () => {
    const url = video.videoUrl || '';

    if (video.platform === 'youtube') {
      if (video.id.startsWith('yt_')) return video.id.replace('yt_', '');
      if (video.id.startsWith('youtube_')) return video.id.replace(/^youtube_/, '').split('_')[0];
      const ytMatch = url.match(/(?:shorts\/|v=|v\/|embed\/|youtu.be\/)([^?&/]+)/);
      return ytMatch ? ytMatch[1] : video.id;
    }

    if (video.platform === 'tiktok') {
      if (video.id.startsWith('tiktok_')) return video.id.split('_')[1];
      const ttMatch = url.match(/video\/(\d+)/);
      return ttMatch ? ttMatch[1] : video.id;
    }

    if (video.platform === 'instagram') {
      if (video.id.startsWith('instagram_')) return video.id.split('_')[1];
      const igMatch = url.match(/(?:\/p\/|\/reels\/|\/reel\/)([^/?#&]+)/);
      return igMatch ? igMatch[1] : video.id;
    }

    return video.id;
  };

  const platformId = getPlatformId();

  return (
    <div ref={containerRef} className="video-item">
      <div
        className="video-skeleton"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `url(${video.thumbnailUrl}) center/cover no-repeat #000`,
          filter: 'blur(5px) brightness(0.7)',
          zIndex: 0
        }}
      />

      {shouldMountMedia && (
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: shouldUseNativeVideo || embedLoaded ? 1 : 0,
            transition: 'opacity 160ms ease'
          }}
        >
          {shouldUseNativeVideo ? (
            <video
              ref={videoRef}
              className="video-player"
              src={video.videoUrl}
              poster={video.thumbnailUrl}
              muted={isMuted}
              playsInline
              autoPlay={isActive && soundAutoplayUnlocked}
              preload={shouldPreload ? 'auto' : 'metadata'}
              onCanPlay={() => {
                if (isActiveRef.current && soundAutoplayUnlockedRef.current) playCurrentVideo();
              }}
              onError={() => reportUnavailable('native-media-error')}
              onStalled={() => {
                if (!isActiveRef.current) return;
                window.setTimeout(() => {
                  if (videoRef.current && videoRef.current.readyState < 2) {
                    reportUnavailable('native-media-stalled');
                  }
                }, 5000);
              }}
              onEnded={() => {
                if (isActiveRef.current) onEndedRef.current?.();
              }}
              controls
            />
          ) : video.platform === 'youtube' ? (
            <iframe
              key={`${video.id}-${soundAutoplayUnlocked ? 'sound' : 'locked'}`}
              id={`yt-player-${video.id}`}
              className="video-player"
              src={`https://www.youtube.com/embed/${platformId}?autoplay=${isActive && soundAutoplayUnlocked ? 1 : 0}&controls=1&rel=0&enablejsapi=1&origin=${window.location.origin}&modestbranding=1&iv_load_policy=3&playsinline=1&mute=${shouldPrimeYouTubeMuted ? 1 : isMuted ? 1 : 0}&widgetid=1`}
              title="YouTube Shorts"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              loading="eager"
              allowFullScreen
              onLoad={() => setEmbedLoaded(true)}
              onError={() => reportUnavailable('youtube-iframe-load')}
            />
          ) : video.platform === 'tiktok' ? (
            <iframe
              key={`${video.id}-${soundAutoplayUnlocked ? 'sound' : 'locked'}`}
              className="video-player"
              src={`https://www.tiktok.com/embed/v2/${platformId}?autoplay=${isActive && soundAutoplayUnlocked ? 1 : 0}`}
              title="TikTok"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              loading="eager"
              allowFullScreen
              onLoad={() => setEmbedLoaded(true)}
              onError={() => reportUnavailable('tiktok-iframe-load')}
            />
          ) : video.platform === 'instagram' ? (
            <iframe
              key={`${video.id}-${soundAutoplayUnlocked ? 'sound' : 'locked'}`}
              className="video-player"
              src={`https://www.instagram.com/reels/${platformId}/embed/?autoplay=${isActive && soundAutoplayUnlocked ? 1 : 0}`}
              title="Instagram Reels"
              frameBorder="0"
              allowTransparency
              loading="eager"
              allowFullScreen
              onLoad={() => setEmbedLoaded(true)}
              onError={() => reportUnavailable('instagram-iframe-load')}
            />
          ) : null}
        </div>
      )}

      {isActive && hasWorldMiniKit && !soundAutoplayUnlocked && (
        <button
          type="button"
          className="video-autoplay-unblock"
          onClick={(e) => {
            e.stopPropagation();
            unlockSoundAutoplay();
          }}
        >
          <span className="video-autoplay-icon">
            <Play size={28} fill="currentColor" />
          </span>
          <span className="video-autoplay-copy">
            <Volume2 size={16} />
            Tap to start with sound
          </span>
        </button>
      )}

      {isActive && autoplayBlocked && (!hasWorldMiniKit || soundAutoplayUnlocked) && (
        <button
          type="button"
          className="video-autoplay-unblock"
          onClick={(e) => {
            e.stopPropagation();
            handleManualPlay();
          }}
        >
          <span className="video-autoplay-icon">
            <Play size={28} fill="currentColor" />
          </span>
          <span className="video-autoplay-copy">
            <Volume2 size={16} />
            Tap to play with sound
          </span>
        </button>
      )}

      {isActive && onSupport && (
        <div className="video-overlay-actions">
          <motion.button
            className="video-support-btn"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={(e) => {
              e.stopPropagation();
              onSupport();
            }}
          >
            <Star size={24} fill="#fbbf24" color="#fbbf24" />
            <span style={{ fontSize: '10px', color: '#fbbf24', fontWeight: '900', marginTop: '4px' }}>GOLD</span>
          </motion.button>
        </div>
      )}

      <AnimatePresence>
        {showGoldShower && (
          <motion.div
            className="gold-shower-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {[...Array(20)].map((_, index) => (
              <motion.div
                key={index}
                className="gold-particle"
                initial={{
                  y: -100,
                  x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 500),
                  rotate: 0,
                  opacity: 1
                }}
                animate={{
                  y: typeof window !== 'undefined' ? window.innerHeight : 800,
                  rotate: 360,
                  opacity: 0
                }}
                transition={{
                  duration: 1.5 + Math.random(),
                  repeat: Infinity,
                  delay: Math.random() * 0.5
                }}
                style={{
                  position: 'absolute',
                  width: '8px',
                  height: '8px',
                  background: '#fbbf24',
                  borderRadius: '2px',
                  boxShadow: '0 0 10px #fbbf24'
                }}
              />
            ))}
            <motion.div
              className="gold-msg"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              style={{
                position: 'absolute',
                top: '40%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                color: '#fbbf24',
                fontWeight: '950',
                fontSize: '24px',
                textShadow: '0 0 20px #000'
              }}
            >
              GOLD SHOWER!
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VideoPlayer;
