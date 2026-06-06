import { useState, useRef, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { CSSProperties } from 'react';
import {
  Check,
  Download,
  Gauge,
  Image as ImageIcon,
  Layers,
  MessageSquare,
  Music,
  Palette,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Type,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import humanVerifiedBadgeUrl from '../../human-verified-badge.svg';
import challengeOnIconUrl from '../assets/brand/ChallengeOnICO.png';
import endingOneUrl from '../assets/brand/Ending1.png';
import endingTwoUrl from '../assets/brand/Ending2.png';

interface VideoEditorProps {
  blob: Blob;
  onCancel: () => void;
  onSave: (finalBlob: Blob) => void;
  isProcessing: boolean;
  videoTitle?: string;
  onVideoTitleChange?: (value: string) => void;
  uploaderComment?: string;
  onUploaderCommentChange?: (value: string) => void;
  remixSource?: RemixSource | null;
  isHumanVerifiedCapture?: boolean;
  defaultMirrored?: boolean;
}

type RemixSource = {
  videoId: string;
  title: string;
  author: string;
  platform: string;
  url?: string;
};

type EditorTab = 'vibe' | 'text' | 'adjust' | 'motion' | 'effects' | 'music' | 'details';
type TextPreset = 'bold' | 'neon' | 'caption' | 'stamp';
type TextPosition = 'top' | 'center' | 'bottom';
type EffectPreset = 'clean' | 'cinema' | 'spotlight' | 'scanline' | 'hype';
type MusicPreset = 'none' | 'pulse' | 'neon' | 'runway' | 'cinematic' | 'lofi';

type TextOverlay = {
  id: string;
  text: string;
  preset: TextPreset;
  position: TextPosition;
  size: number;
};

const MAX_CLIP_SECONDS = 180;
const CLIP_CUT_SECONDS = 30;
const HUMAN_VERIFICATION_CREDIT_SECONDS = 5;
const ENDING_CREDIT_SECONDS = 3.4;

const FILTERS = [
  { name: 'Clean', filter: 'none', tint: 'rgba(255,255,255,0)' },
  { name: 'World Pop', filter: 'contrast(1.16) saturate(1.45) brightness(1.04)', tint: 'rgba(0, 204, 255, 0.06)' },
  { name: 'K-Stage', filter: 'contrast(1.22) saturate(1.35) brightness(0.96)', tint: 'rgba(255, 41, 117, 0.08)' },
  { name: 'Arcade', filter: 'contrast(1.3) saturate(1.8) hue-rotate(18deg)', tint: 'rgba(255, 238, 0, 0.05)' },
  { name: 'Beauty', filter: 'brightness(1.08) contrast(1.04) saturate(1.16)', tint: 'rgba(255, 210, 225, 0.08)' },
  { name: 'Creator', filter: 'contrast(1.12) saturate(1.22) brightness(1.02)', tint: 'rgba(255,255,255,0.03)' },
  { name: 'Hyper', filter: 'contrast(1.36) saturate(2.05) hue-rotate(-10deg)', tint: 'rgba(255, 0, 120, 0.09)' },
  { name: 'Golden', filter: 'contrast(1.12) saturate(1.26) sepia(0.24) brightness(1.04)', tint: 'rgba(255, 176, 70, 0.12)' },
  { name: 'Aqua', filter: 'contrast(1.18) saturate(1.5) hue-rotate(145deg)', tint: 'rgba(0, 229, 255, 0.08)' },
  { name: 'Film', filter: 'contrast(1.1) saturate(0.88) sepia(0.18) brightness(0.96)', tint: 'rgba(255, 190, 120, 0.08)' },
  { name: 'VHS', filter: 'contrast(1.18) saturate(1.15) sepia(0.12) hue-rotate(320deg)', tint: 'rgba(80, 255, 190, 0.05)' },
  { name: 'Noir', filter: 'grayscale(1) contrast(1.32) brightness(0.92)', tint: 'rgba(80, 120, 255, 0.06)' },
  { name: 'Dream', filter: 'brightness(1.1) saturate(0.9) contrast(1.05)', tint: 'rgba(170, 120, 255, 0.08)' },
  { name: 'Heat', filter: 'contrast(1.18) saturate(1.55) sepia(0.16)', tint: 'rgba(255, 80, 0, 0.08)' },
];

const TEXT_PRESETS: Record<TextPreset, { label: string; font: string; fill: string; stroke: string; shadow: string }> = {
  bold: {
    label: 'Bold',
    font: '900',
    fill: '#ffffff',
    stroke: 'rgba(0,0,0,0.55)',
    shadow: 'rgba(0,0,0,0.75)',
  },
  neon: {
    label: 'Neon',
    font: '950',
    fill: '#5dfcff',
    stroke: 'rgba(6,8,25,0.9)',
    shadow: 'rgba(93,252,255,0.95)',
  },
  caption: {
    label: 'Caption',
    font: '800',
    fill: '#111111',
    stroke: 'rgba(255,255,255,0.95)',
    shadow: 'rgba(255,255,255,0.4)',
  },
  stamp: {
    label: 'Stamp',
    font: '950',
    fill: '#ffea00',
    stroke: 'rgba(15,15,15,0.9)',
    shadow: 'rgba(255, 234, 0, 0.45)',
  },
};

const MUSIC_PRESETS: Array<{ id: MusicPreset; label: string; bpm: number; mood: string }> = [
  { id: 'none', label: 'None', bpm: 0, mood: 'Original audio only' },
  { id: 'pulse', label: 'Pulse Pop', bpm: 126, mood: 'Bright beat' },
  { id: 'neon', label: 'Neon Run', bpm: 142, mood: 'Fast synth' },
  { id: 'runway', label: 'Runway', bpm: 118, mood: 'Clean groove' },
  { id: 'cinematic', label: 'Cinematic', bpm: 92, mood: 'Wide rise' },
  { id: 'lofi', label: 'Lo-fi', bpm: 84, mood: 'Soft bounce' },
];

const pickMimeType = () => {
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=h264,aac',
    'video/mp4',
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || '';
};

const formatClipTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '0:00';
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export default function VideoEditor({
  blob,
  onCancel,
  onSave,
  isProcessing,
  videoTitle = '',
  onVideoTitleChange,
  uploaderComment = '',
  onUploaderCommentChange,
  remixSource = null,
  isHumanVerifiedCapture = false,
  defaultMirrored = true,
}: VideoEditorProps) {
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState(FILTERS[1]);
  const [activeTab, setActiveTab] = useState<EditorTab>('vibe');
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');
  const [textPreset, setTextPreset] = useState<TextPreset>('bold');
  const [textPosition, setTextPosition] = useState<TextPosition>('bottom');
  const [textSize, setTextSize] = useState(100);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(108);
  const [saturation, setSaturation] = useState(118);
  const [warmth, setWarmth] = useState(8);
  const [vignette, setVignette] = useState(28);
  const [grain, setGrain] = useState(5);
  const [speed, setSpeed] = useState(1);
  const [sourceDuration, setSourceDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(MAX_CLIP_SECONDS);
  const [effectPreset, setEffectPreset] = useState<EffectPreset>('hype');
  const [showTextInput, setShowTextInput] = useState(false);
  const [showBeatGlow, setShowBeatGlow] = useState(true);
  const [showWatermark, setShowWatermark] = useState(true);
  const [isMirrored, setIsMirrored] = useState(defaultMirrored);
  const [musicPreset, setMusicPreset] = useState<MusicPreset>('none');
  const [musicVolume, setMusicVolume] = useState(32);
  const [originalVolume, setOriginalVolume] = useState(100);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeStatus, setFinalizeStatus] = useState('');
  const [finalizeError, setFinalizeError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const humanBadgeImageRef = useRef<HTMLImageElement | null>(null);
  const challengeIconImageRef = useRef<HTMLImageElement | null>(null);
  const endingOneImageRef = useRef<HTMLImageElement | null>(null);
  const endingTwoImageRef = useRef<HTMLImageElement | null>(null);
  const selectedEndingImageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(blob);
    setVideoUrl(url);
    setSourceDuration(0);
    setTrimStart(0);
    setTrimEnd(MAX_CLIP_SECONDS);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed, videoUrl]);

  const loadCanvasImage = (url: string, ref: MutableRefObject<HTMLImageElement | null>) => {
    const image = new Image();
    image.onload = () => {
      ref.current = image;
    };
    image.onerror = () => {
      ref.current = null;
    };
    image.src = url;
  };

  useEffect(() => {
    loadCanvasImage(humanVerifiedBadgeUrl, humanBadgeImageRef);
    loadCanvasImage(challengeOnIconUrl, challengeIconImageRef);
    loadCanvasImage(endingOneUrl, endingOneImageRef);
    loadCanvasImage(endingTwoUrl, endingTwoImageRef);
  }, []);

  const composedFilter = `${activeFilter.filter} brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
  const isBusy = isProcessing || isFinalizing;
  const activeText = textOverlays.find((item) => item.id === activeTextId) || null;
  const effectiveDuration = sourceDuration || MAX_CLIP_SECONDS;
  const clipDuration = Math.max(0.1, Math.min(trimEnd, effectiveDuration) - Math.min(trimStart, effectiveDuration));
  const cutWindowSeconds = Math.min(CLIP_CUT_SECONDS, effectiveDuration);
  const maxTrimStart = Math.max(0, effectiveDuration - cutWindowSeconds);
  const trimProgress = maxTrimStart > 0 ? Math.min(trimStart / maxTrimStart, 1) : 0;

  const resetEdits = () => {
    setActiveFilter(FILTERS[1]);
    setTextOverlays([]);
    setActiveTextId(null);
    setDraftText('');
    setTextPreset('bold');
    setTextPosition('bottom');
    setTextSize(100);
    setBrightness(100);
    setContrast(108);
    setSaturation(118);
    setWarmth(8);
    setVignette(28);
    setGrain(5);
    setSpeed(1);
    setTrimStart(0);
    setTrimEnd(Math.min(sourceDuration || CLIP_CUT_SECONDS, CLIP_CUT_SECONDS));
    setEffectPreset('hype');
    setShowBeatGlow(true);
    setShowWatermark(true);
    setIsMirrored(defaultMirrored);
    setMusicPreset('none');
    setMusicVolume(32);
    setOriginalVolume(100);
  };

  const selectTextOverlay = (overlay: TextOverlay) => {
    setActiveTextId(overlay.id);
    setTextPreset(overlay.preset);
    setTextPosition(overlay.position);
    setTextSize(overlay.size);
  };

  const updateActiveTextStyle = (changes: Partial<Pick<TextOverlay, 'preset' | 'position' | 'size'>>) => {
    if (!activeTextId) return;
    setTextOverlays((items) => items.map((item) => (item.id === activeTextId ? { ...item, ...changes } : item)));
  };

  const chooseTextPreset = (preset: TextPreset) => {
    setTextPreset(preset);
    updateActiveTextStyle({ preset });
  };

  const chooseTextPosition = (position: TextPosition) => {
    setTextPosition(position);
    updateActiveTextStyle({ position });
  };

  const chooseTextSize = (size: number) => {
    setTextSize(size);
    updateActiveTextStyle({ size });
  };

  const openTextComposer = (overlay?: TextOverlay) => {
    if (overlay) {
      selectTextOverlay(overlay);
      setDraftText(overlay.text);
    } else {
      setActiveTextId(null);
      setDraftText('');
    }
    setShowTextInput(true);
  };

  const saveTextOverlay = () => {
    const cleanText = draftText.trim().slice(0, 42);
    if (!cleanText) {
      setShowTextInput(false);
      return;
    }

    if (activeTextId) {
      setTextOverlays((items) => items.map((item) => (item.id === activeTextId ? { ...item, text: cleanText } : item)));
    } else {
      const next: TextOverlay = {
        id: crypto.randomUUID?.() || `text-${Date.now()}`,
        text: cleanText,
        preset: textPreset,
        position: textPosition,
        size: textSize,
      };
      setTextOverlays((items) => [...items, next]);
      setActiveTextId(next.id);
    }

    setShowTextInput(false);
  };

  const removeTextOverlay = (id: string) => {
    setTextOverlays((items) => items.filter((item) => item.id !== id));
    if (activeTextId === id) {
      setActiveTextId(null);
    }
  };

  const handleMetadataLoaded = () => {
    const duration = videoRef.current?.duration || 0;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const nextWindow = Math.min(duration, CLIP_CUT_SECONDS);
    setSourceDuration(duration);
    setTrimStart(0);
    setTrimEnd(nextWindow);
  };

  const previewClipWindow = (value: number) => {
    const nextStart = Math.max(0, Math.min(value, maxTrimStart));
    const nextEnd = Math.min(effectiveDuration, nextStart + cutWindowSeconds);
    setTrimStart(nextStart);
    setTrimEnd(nextEnd);
    if (videoRef.current) videoRef.current.currentTime = nextStart;
  };

  const drawRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  };

  const getTextY = (height: number, position: TextPosition) => {
    if (position === 'top') return height * 0.18;
    if (position === 'center') return height * 0.5;
    return height * 0.79;
  };

  const drawImageCover = (ctx: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) => {
    const imageRatio = image.naturalWidth / image.naturalHeight;
    const canvasRatio = width / height;
    let drawWidth = width;
    let drawHeight = height;
    let x = 0;
    let y = 0;

    if (imageRatio > canvasRatio) {
      drawHeight = height;
      drawWidth = height * imageRatio;
      x = (width - drawWidth) / 2;
    } else {
      drawWidth = width;
      drawHeight = width / imageRatio;
      y = (height - drawHeight) / 2;
    }

    ctx.drawImage(image, x, y, drawWidth, drawHeight);
  };

  const drawHumanBadgeIcon = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha = 0.94) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(0, 75, 255, 0.36)';
    ctx.shadowBlur = Math.max(10, size * 0.24);
    ctx.shadowOffsetY = Math.max(4, size * 0.08);

    const badgeImage = humanBadgeImageRef.current;
    if (badgeImage) {
      ctx.drawImage(badgeImage, x, y, size, size);
    } else {
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = '#005CFF';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x + size * 0.502, y + size * 0.336, size * 0.105, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + size * 0.724, y + size * 0.455);
      ctx.lineTo(x + size * 0.542, y + size * 0.528);
      ctx.lineTo(x + size * 0.542, y + size * 0.75);
      ctx.lineTo(x + size * 0.458, y + size * 0.75);
      ctx.lineTo(x + size * 0.458, y + size * 0.528);
      ctx.lineTo(x + size * 0.276, y + size * 0.455);
      ctx.lineTo(x + size * 0.307, y + size * 0.378);
      ctx.lineTo(x + size * 0.5, y + size * 0.455);
      ctx.lineTo(x + size * 0.693, y + size * 0.378);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };

  const drawWorldHumanBadge = (ctx: CanvasRenderingContext2D, width: number, height: number, alpha = 0.94) => {
    const size = Math.max(42, Math.min(width, height) * 0.092);
    const x = width - size - width * 0.045;
    const y = height * 0.055;
    drawHumanBadgeIcon(ctx, x, y, size, alpha);
  };

  const drawChallengeOnWatermark = (ctx: CanvasRenderingContext2D, width: number, height: number, alpha = 0.82) => {
    const size = Math.max(42, Math.min(width, height) * 0.09);
    const x = width - size - width * 0.045;
    const y = height * 0.055;
    const iconImage = challengeIconImageRef.current;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(0,0,0,0.34)';
    ctx.shadowBlur = Math.max(10, size * 0.2);
    ctx.shadowOffsetY = Math.max(4, size * 0.07);

    if (iconImage) {
      ctx.drawImage(iconImage, x, y, size, size);
    } else {
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = '#05070d';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#ffffff';
      ctx.font = `950 ${size * 0.22}px Outfit, Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('U&On', x + size / 2, y + size / 2);
    }

    ctx.restore();
  };

  const drawActiveWatermark = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (isHumanVerifiedCapture) drawWorldHumanBadge(ctx, width, height);
    else drawChallengeOnWatermark(ctx, width, height);
  };

  const drawSingleTextOverlay = (ctx: CanvasRenderingContext2D, width: number, height: number, overlay: TextOverlay) => {
    if (!overlay.text.trim()) return;

    const preset = TEXT_PRESETS[overlay.preset];
    const maxWidth = width * 0.86;
    let fontSize = Math.max(28, width * 0.082) * (overlay.size / 100);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    do {
      ctx.font = `${preset.font} ${fontSize}px Outfit, Arial, sans-serif`;
      if (ctx.measureText(overlay.text).width <= maxWidth) break;
      fontSize -= 2;
    } while (fontSize > 22);

    const x = width / 2;
    const y = getTextY(height, overlay.position);
    const metrics = ctx.measureText(overlay.text);
    const boxPaddingX = fontSize * 0.45;
    const boxPaddingY = fontSize * 0.28;

    if (overlay.preset === 'caption') {
      drawRoundedRect(
        ctx,
        x - metrics.width / 2 - boxPaddingX,
        y - fontSize / 2 - boxPaddingY,
        metrics.width + boxPaddingX * 2,
        fontSize + boxPaddingY * 2,
        fontSize * 0.28
      );
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
    }

    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(5, fontSize * 0.14);
    ctx.strokeStyle = preset.stroke;
    ctx.shadowColor = preset.shadow;
    ctx.shadowBlur = overlay.preset === 'neon' ? fontSize * 0.42 : fontSize * 0.18;
    ctx.strokeText(overlay.text, x, y);
    ctx.fillStyle = preset.fill;
    ctx.fillText(overlay.text, x, y);
    ctx.restore();
  };

  const drawTextOverlay = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    textOverlays.forEach((overlay) => drawSingleTextOverlay(ctx, width, height, overlay));
  };

  const drawBeatGlow = (ctx: CanvasRenderingContext2D, width: number, height: number, elapsed: number) => {
    if (!showBeatGlow) return;
    const pulse = (Math.sin(elapsed * 7) + 1) / 2;
    ctx.save();
    ctx.globalAlpha = 0.12 + pulse * 0.08;
    ctx.lineWidth = Math.max(8, width * 0.018);
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#00e5ff');
    gradient.addColorStop(0.5, '#ff2f7d');
    gradient.addColorStop(1, '#ffea00');
    ctx.strokeStyle = gradient;
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, width - ctx.lineWidth, height - ctx.lineWidth);
    ctx.restore();
  };

  const drawWarmth = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (warmth === 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(Math.abs(warmth) / 100, 0.28);
    ctx.fillStyle = warmth > 0 ? 'rgb(255, 142, 56)' : 'rgb(50, 160, 255)';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  };

  const drawVignette = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (vignette <= 0) return;
    ctx.save();
    const radius = Math.max(width, height) * 0.72;
    const gradient = ctx.createRadialGradient(width / 2, height / 2, radius * 0.15, width / 2, height / 2, radius);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.58, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${Math.min(vignette / 100, 0.75)})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  };

  const drawGrain = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (grain <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(grain / 100, 0.18);
    ctx.fillStyle = '#ffffff';
    const count = Math.round((width * height / 28000) * grain);
    for (let i = 0; i < count; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const size = Math.random() > 0.7 ? 2 : 1;
      ctx.fillRect(x, y, size, size);
    }
    ctx.restore();
  };

  const drawEffectPreset = (ctx: CanvasRenderingContext2D, width: number, height: number, elapsed: number) => {
    ctx.save();

    if (effectPreset === 'cinema') {
      const barHeight = height * 0.085;
      ctx.fillStyle = 'rgba(0,0,0,0.92)';
      ctx.fillRect(0, 0, width, barHeight);
      ctx.fillRect(0, height - barHeight, width, barHeight);
    }

    if (effectPreset === 'spotlight') {
      const gradient = ctx.createRadialGradient(width / 2, height * 0.42, width * 0.08, width / 2, height * 0.42, width * 0.62);
      gradient.addColorStop(0, 'rgba(255,255,255,0.08)');
      gradient.addColorStop(0.48, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.48)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }

    if (effectPreset === 'scanline') {
      ctx.globalAlpha = 0.17;
      ctx.fillStyle = '#ffffff';
      for (let y = 0; y < height; y += 8) {
        ctx.fillRect(0, y, width, 1);
      }
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#00e5ff';
      ctx.fillRect(Math.sin(elapsed * 2) * width * 0.05, 0, width * 0.18, height);
    }

    if (effectPreset === 'hype') {
      const pulse = (Math.sin(elapsed * 5.2) + 1) / 2;
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, `rgba(0,229,255,${0.04 + pulse * 0.04})`);
      gradient.addColorStop(0.45, 'rgba(255,47,125,0)');
      gradient.addColorStop(1, `rgba(255,234,0,${0.03 + pulse * 0.035})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.restore();
  };

  const drawHumanVerificationCredit = (ctx: CanvasRenderingContext2D, width: number, height: number, elapsed: number) => {
    ctx.save();
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#005cff');
    gradient.addColorStop(1, '#0b63ff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const progress = Math.min(elapsed / HUMAN_VERIFICATION_CREDIT_SECONDS, 1);
    const pulse = 1 + Math.sin(progress * Math.PI) * 0.06;
    const badgeSize = Math.min(width * 0.32, height * 0.22, 180) * pulse;
    const x = width / 2 - badgeSize / 2;
    const y = height / 2 - badgeSize / 2 - height * 0.05;
    drawHumanBadgeIcon(ctx, x, y, badgeSize, 1);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255,255,255,0.36)';
    ctx.shadowBlur = 16;
    ctx.font = `900 ${Math.max(20, width * 0.044)}px Outfit, Arial, sans-serif`;
    ctx.fillText('Posted by a World ID verified human', width / 2, y + badgeSize + height * 0.08);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.64)';
    ctx.font = `800 ${Math.max(12, width * 0.024)}px Outfit, Arial, sans-serif`;
    ctx.fillText('U&On creators are authenticated with World ID', width / 2, y + badgeSize + height * 0.13);
    ctx.restore();
  };

  const drawEndingCredit = (ctx: CanvasRenderingContext2D, width: number, height: number, elapsed: number) => {
    ctx.save();
    const image = selectedEndingImageRef.current || endingOneImageRef.current || endingTwoImageRef.current;
    const progress = Math.min(Math.max(elapsed / ENDING_CREDIT_SECONDS, 0), 1);

    if (image) {
      drawImageCover(ctx, image, width, height);
    } else {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#05070d');
      gradient.addColorStop(1, '#141923');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }

    const fadeIn = Math.min(progress / 0.22, 1);
    const fadeOut = progress > 0.8 ? Math.max(0, (1 - progress) / 0.2) : 1;
    ctx.globalAlpha = 1 - Math.min(fadeIn, fadeOut);
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;

    const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.2, width / 2, height / 2, Math.max(width, height) * 0.74);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  };

  const drawOutro = (ctx: CanvasRenderingContext2D, width: number, height: number, elapsed: number) => {
    if (isHumanVerifiedCapture && elapsed < HUMAN_VERIFICATION_CREDIT_SECONDS) {
      drawHumanVerificationCredit(ctx, width, height, elapsed);
      return;
    }

    const endingElapsed = isHumanVerifiedCapture ? elapsed - HUMAN_VERIFICATION_CREDIT_SECONDS : elapsed;
    drawEndingCredit(ctx, width, height, endingElapsed);
  };

  const scheduleTone = (
    audioContext: AudioContext,
    destination: AudioNode,
    frequency: number,
    startAt: number,
    duration: number,
    volume: number,
    type: OscillatorType
  ) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const peak = Math.max(0.0001, volume);
    const endAt = startAt + duration;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(startAt);
    oscillator.stop(endAt + 0.04);
  };

  const scheduleMusicPreset = (
    audioContext: AudioContext,
    destination: AudioNode,
    preset: MusicPreset,
    volume: number,
    durationSeconds: number
  ) => {
    if (preset === 'none' || volume <= 0) return;

    const specs: Record<Exclude<MusicPreset, 'none'>, {
      bpm: number;
      notes: number[];
      bass: number[];
      leadType: OscillatorType;
      bassType: OscillatorType;
      leadEvery: number;
      padEvery: number;
    }> = {
      pulse: {
        bpm: 126,
        notes: [523.25, 659.25, 783.99, 659.25, 587.33, 739.99, 880, 739.99],
        bass: [130.81, 164.81, 196, 164.81],
        leadType: 'sawtooth',
        bassType: 'triangle',
        leadEvery: 1,
        padEvery: 4,
      },
      neon: {
        bpm: 142,
        notes: [392, 523.25, 659.25, 783.99, 932.33, 783.99, 659.25, 523.25],
        bass: [98, 130.81, 164.81, 130.81],
        leadType: 'square',
        bassType: 'sawtooth',
        leadEvery: 1,
        padEvery: 6,
      },
      runway: {
        bpm: 118,
        notes: [440, 554.37, 659.25, 554.37, 493.88, 622.25, 739.99, 622.25],
        bass: [110, 138.59, 164.81, 138.59],
        leadType: 'triangle',
        bassType: 'triangle',
        leadEvery: 2,
        padEvery: 4,
      },
      cinematic: {
        bpm: 92,
        notes: [261.63, 329.63, 392, 523.25, 392, 329.63],
        bass: [65.41, 82.41, 98, 82.41],
        leadType: 'sine',
        bassType: 'sine',
        leadEvery: 2,
        padEvery: 3,
      },
      lofi: {
        bpm: 84,
        notes: [329.63, 392, 440, 392, 293.66, 349.23, 392, 349.23],
        bass: [82.41, 98, 110, 98],
        leadType: 'triangle',
        bassType: 'sine',
        leadEvery: 2,
        padEvery: 4,
      },
    };

    const spec = specs[preset];
    const beat = 60 / spec.bpm;
    const startAt = audioContext.currentTime + 0.08;
    const totalBeats = Math.ceil(Math.min(durationSeconds + 1.2, 182) / beat);
    const masterVolume = Math.min(volume / 100, 0.9);

    for (let beatIndex = 0; beatIndex < totalBeats; beatIndex += 1) {
      const t = startAt + beatIndex * beat;
      const note = spec.notes[beatIndex % spec.notes.length];
      const bass = spec.bass[Math.floor(beatIndex / 2) % spec.bass.length];

      if (beatIndex % spec.leadEvery === 0) {
        scheduleTone(audioContext, destination, note, t, beat * 0.58, masterVolume * 0.08, spec.leadType);
      }

      if (beatIndex % 2 === 0) {
        scheduleTone(audioContext, destination, bass, t, beat * 0.78, masterVolume * 0.1, spec.bassType);
      }

      if (beatIndex % spec.padEvery === 0) {
        scheduleTone(audioContext, destination, note * 0.5, t, beat * 2.5, masterVolume * 0.04, 'sine');
        scheduleTone(audioContext, destination, note * 0.75, t, beat * 2.5, masterVolume * 0.03, 'sine');
      }
    }
  };

  const addMixedAudioTracks = (video: HTMLVideoElement, stream: MediaStream, durationSeconds: number) => {
    const captureVideo = video as HTMLVideoElement & {
      captureStream?: () => MediaStream;
      mozCaptureStream?: () => MediaStream;
    };
    const capture = captureVideo.captureStream?.() || captureVideo.mozCaptureStream?.();
    const audioTracks = capture?.getAudioTracks() || [];
    const shouldMix = musicPreset !== 'none' || originalVolume !== 100;
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!shouldMix || !AudioContextCtor) {
      audioTracks.forEach((track: MediaStreamTrack) => stream.addTrack(track));
      return () => undefined;
    }

    try {
      const audioContext = new AudioContextCtor();
      if (audioContext.state === 'suspended') void audioContext.resume();
      const destination = audioContext.createMediaStreamDestination();
      const outputTracks: MediaStreamTrack[] = [];

      if (audioTracks.length > 0 && originalVolume > 0) {
        const source = audioContext.createMediaStreamSource(new MediaStream(audioTracks));
        const gain = audioContext.createGain();
        gain.gain.value = Math.min(originalVolume / 100, 1.4);
        source.connect(gain);
        gain.connect(destination);
      }

      scheduleMusicPreset(audioContext, destination, musicPreset, musicVolume, durationSeconds);
      destination.stream.getAudioTracks().forEach((track) => {
        outputTracks.push(track);
        stream.addTrack(track);
      });

      return () => {
        outputTracks.forEach((track) => track.stop());
        void audioContext.close();
      };
    } catch (error) {
      console.warn('Audio mix failed, falling back to original audio:', error);
      audioTracks.forEach((track: MediaStreamTrack) => stream.addTrack(track));
      return () => undefined;
    }
  };

  const handleFinalize = async () => {
    if (isBusy || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!canvas.captureStream || typeof MediaRecorder === 'undefined') {
      setFinalizeError('This browser cannot render edited video. Please update World App or use your phone browser.');
      return;
    }

    const sourceWidth = video.videoWidth || 1080;
    const sourceHeight = video.videoHeight || 1920;
    const maxRenderSide = 1280;
    const scale = Math.min(1, maxRenderSide / Math.max(sourceWidth, sourceHeight));
    canvas.width = Math.max(2, Math.round(sourceWidth * scale));
    canvas.height = Math.max(2, Math.round(sourceHeight * scale));

    const selectedType = pickMimeType();
    const outputStream = canvas.captureStream(30);
    const renderClipDuration = Math.min(clipDuration, MAX_CLIP_SECONDS);
    const outroDurationSeconds = (isHumanVerifiedCapture ? HUMAN_VERIFICATION_CREDIT_SECONDS : 0) + ENDING_CREDIT_SECONDS;
    const outputDurationSeconds = Math.min(renderClipDuration / speed + outroDurationSeconds + 0.4, 190);
    let cleanupAudio: () => void = () => undefined;
    cleanupAudio = addMixedAudioTracks(video, outputStream, outputDurationSeconds);
    let recorder: MediaRecorder;
    try {
      recorder = selectedType ? new MediaRecorder(outputStream, { mimeType: selectedType }) : new MediaRecorder(outputStream);
    } catch (error) {
      console.warn('Preferred recorder type failed, retrying default MediaRecorder:', error);
      recorder = new MediaRecorder(outputStream);
    }
    const chunks: Blob[] = [];
    let animationFrame = 0;
    let stopTimer = 0;
    let outroStartedAt = 0;
    let hasStartedOutro = false;

    const stopRecorder = () => {
      if (recorder.state !== 'inactive') recorder.stop();
    };

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    recorder.onerror = () => {
      setFinalizeError('Video rendering stopped unexpectedly. Please retry with a shorter clip or fewer effects.');
      stopRecorder();
    };

    recorder.onstop = () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(stopTimer);
      cleanupAudio();
      if (chunks.length === 0) {
        setFinalizeStatus('');
        setFinalizeError('The edited video could not be created. Please retry with a shorter clip.');
        setIsFinalizing(false);
        return;
      }
      const finalBlob = new Blob(chunks, { type: recorder.mimeType || selectedType || 'video/webm' });
      setFinalizeStatus('Prepared. Uploading...');
      setIsFinalizing(false);
      onSave(finalBlob);
    };

    try {
      setIsFinalizing(true);
      setFinalizeError('');
      setFinalizeStatus('Rendering edit...');
      const endingCandidates = [endingOneImageRef.current, endingTwoImageRef.current].filter(Boolean) as HTMLImageElement[];
      selectedEndingImageRef.current = endingCandidates.length > 0
        ? endingCandidates[Math.floor(Math.random() * endingCandidates.length)]
        : null;
      video.loop = false;
      video.playbackRate = speed;
      video.pause();
      video.currentTime = trimStart;

      recorder.start(250);
      try {
        video.muted = false;
        await video.play();
      } catch (playError) {
        console.warn('Unmuted render playback failed, retrying muted:', playError);
        video.muted = true;
        await video.play();
      }

      const maxDurationMs = Math.min(Math.max((renderClipDuration / speed + outroDurationSeconds + 0.8) * 1000, 2500), 191_000);
      stopTimer = window.setTimeout(stopRecorder, maxDurationMs);

      const render = (now: number) => {
        const elapsed = video.currentTime || 0;

        if (!video.ended && !video.paused && video.currentTime < trimStart + renderClipDuration) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.filter = composedFilter;
          if (isMirrored) {
            ctx.save();
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();
          } else {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          }
          ctx.filter = 'none';
          ctx.fillStyle = activeFilter.tint;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          drawWarmth(ctx, canvas.width, canvas.height);
          drawEffectPreset(ctx, canvas.width, canvas.height, elapsed);
          drawBeatGlow(ctx, canvas.width, canvas.height, elapsed);
          drawVignette(ctx, canvas.width, canvas.height);
          drawGrain(ctx, canvas.width, canvas.height);
          drawTextOverlay(ctx, canvas.width, canvas.height);
          if (showWatermark) drawActiveWatermark(ctx, canvas.width, canvas.height);
          animationFrame = window.requestAnimationFrame(render);
          return;
        }

        if (!hasStartedOutro) {
          hasStartedOutro = true;
          outroStartedAt = now;
          setFinalizeStatus(isHumanVerifiedCapture ? 'Adding verification and ending credit...' : 'Adding ending credit...');
        }

        const outroElapsed = Math.max(0, (now - outroStartedAt) / 1000);
        drawOutro(ctx, canvas.width, canvas.height, outroElapsed);

        if (outroElapsed >= outroDurationSeconds) {
          stopRecorder();
        } else {
          animationFrame = window.requestAnimationFrame(render);
        }
      };

      animationFrame = window.requestAnimationFrame(render);
    } catch (error) {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(stopTimer);
      cleanupAudio();
      setIsFinalizing(false);
      setFinalizeStatus('');
      setFinalizeError('Video rendering failed. Please retry with a shorter clip or fewer effects.');
      console.error('Video finalize failed:', error);
    }
  };

  return (
    <div className="video-editor-overlay">
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div className="editor-topbar">
        <button className="editor-icon-btn" onClick={onCancel} disabled={isBusy} aria-label="Close editor">
          <X size={24} />
        </button>
        <div className="editor-title">
          <Sparkles size={18} />
          <span>U&On Studio</span>
        </div>
        <button className="editor-next-btn" onClick={handleFinalize} disabled={isBusy}>
          {isBusy ? 'Rendering' : <><Check size={18} /> Done</>}
        </button>
      </div>

      {finalizeError ? (
        <div className="editor-render-error" role="alert">
          {finalizeError}
        </div>
      ) : null}

      <div className="editor-preview">
        {videoUrl && (
          <video
            ref={videoRef}
            src={videoUrl}
            loop
            autoPlay
            muted
            playsInline
            onLoadedMetadata={handleMetadataLoaded}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: composedFilter,
              transform: isMirrored ? 'scaleX(-1)' : 'none',
            }}
          />
        )}
        <div className="editor-tint" style={{ background: activeFilter.tint }} />
        <div
          className={`editor-fx-preview ${effectPreset}`}
          style={{
            boxShadow: `inset 0 0 ${Math.round(vignette * 1.5)}px rgba(0,0,0,${Math.min(vignette / 100, 0.72)})`,
            background: warmth > 0
              ? `rgba(255,142,56,${Math.min(warmth / 100, 0.2)})`
              : `rgba(50,160,255,${Math.min(Math.abs(warmth) / 100, 0.2)})`,
          }}
        />
        {showBeatGlow && <div className="editor-beat-frame" />}
        {showWatermark && (
          <div className="editor-watermark">
            <img
              src={isHumanVerifiedCapture ? humanVerifiedBadgeUrl : challengeOnIconUrl}
              alt={isHumanVerifiedCapture ? 'World ID verified human' : 'U&On watermark'}
            />
          </div>
        )}
        {!showTextInput && textOverlays.map((overlay) => (
          <motion.div
            key={overlay.id}
            className={`editor-text-preview ${overlay.preset} ${overlay.position} ${activeTextId === overlay.id ? 'active' : ''}`}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{ fontSize: `clamp(24px, ${Math.max(5, overlay.size * 0.08)}vw, ${Math.max(38, overlay.size * 0.62)}px)` }}
          >
            {overlay.text}
          </motion.div>
        ))}
        {finalizeStatus && <div className="editor-render-status">{finalizeStatus}</div>}
      </div>

      <div className="editor-tabs">
        {([
          ['vibe', Palette, 'Vibe'],
          ['text', Type, 'Text'],
          ['adjust', Layers, 'Tune'],
          ['motion', Gauge, 'Motion'],
          ['effects', Wand2, 'FX'],
          ['music', Music, 'Music'],
          ['details', MessageSquare, 'Details'],
        ] as Array<[EditorTab, LucideIcon, string]>).map(([id, Icon, label]) => (
          <button
            key={String(id)}
            className={activeTab === id ? 'active' : ''}
            onClick={() => setActiveTab(id as EditorTab)}
            type="button"
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </div>

      <div className="editor-panel">
        {activeTab === 'vibe' && (
          <div className="editor-strip">
            {FILTERS.map((filter) => (
              <button
                key={filter.name}
                className={`editor-filter ${activeFilter.name === filter.name ? 'active' : ''}`}
                onClick={() => setActiveFilter(filter)}
                type="button"
              >
                <span style={{ filter: filter.filter, background: `linear-gradient(135deg, #00e5ff, #ff2f7d, #ffea00)` }} />
                {filter.name}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'text' && (
          <div className="editor-grid-panel text-tools">
            <button className="editor-action" onClick={() => openTextComposer()} type="button">
              <Plus size={18} />
              Add text
            </button>

            {textOverlays.length > 0 && (
              <div className="editor-text-stack">
                {textOverlays.map((overlay) => (
                  <div key={overlay.id} className={`editor-text-row ${activeTextId === overlay.id ? 'active' : ''}`}>
                    <button type="button" onClick={() => selectTextOverlay(overlay)}>
                      <span>{overlay.text}</span>
                      <small>{TEXT_PRESETS[overlay.preset].label} - {overlay.position}</small>
                    </button>
                    <button type="button" onClick={() => openTextComposer(overlay)} aria-label="Edit text">
                      <Type size={16} />
                    </button>
                    <button type="button" onClick={() => removeTextOverlay(overlay.id)} aria-label="Remove text">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {activeText ? (
              <>
                <div className="editor-segment">
                  {(Object.keys(TEXT_PRESETS) as TextPreset[]).map((preset) => (
                    <button key={preset} className={activeText.preset === preset ? 'active' : ''} onClick={() => chooseTextPreset(preset)} type="button">
                      {TEXT_PRESETS[preset].label}
                    </button>
                  ))}
                </div>
                <div className="editor-segment">
                  {(['top', 'center', 'bottom'] as TextPosition[]).map((position) => (
                    <button key={position} className={activeText.position === position ? 'active' : ''} onClick={() => chooseTextPosition(position)} type="button">
                      {position}
                    </button>
                  ))}
                </div>
                <div className="editor-sliders compact">
                  <label>
                    Text size
                    <input type="range" min="72" max="132" value={activeText.size} onChange={(e) => chooseTextSize(Number(e.target.value))} />
                  </label>
                </div>
              </>
            ) : (
              <div className="editor-empty-state">Add or select a text layer.</div>
            )}
          </div>
        )}

        {activeTab === 'music' && (
          <div className="editor-grid-panel">
            {remixSource && (
              <div className="editor-remix-source">
                <div>
                  <strong>Remix source</strong>
                  <span>{remixSource.title}</span>
                  <small>{remixSource.platform} by @{remixSource.author}</small>
                </div>
                {remixSource.url && (
                  <a href={remixSource.url} target="_blank" rel="noreferrer">
                    Open original
                  </a>
                )}
              </div>
            )}
            <div className="editor-music-grid">
              {MUSIC_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className={musicPreset === preset.id ? 'active' : ''}
                  onClick={() => setMusicPreset(preset.id)}
                  type="button"
                >
                  <Music size={16} />
                  <span>{preset.label}</span>
                  <small>{preset.bpm ? `${preset.bpm} BPM` : preset.mood}</small>
                </button>
              ))}
            </div>
            <div className="editor-sliders compact">
              {remixSource && (
                <div className="editor-empty-state">
                  Original platform audio is referenced for attribution. Direct audio extraction from YouTube, TikTok, or Instagram embeds is restricted by platform policy, so use the source as your timing guide and mix with presets or your recorded audio.
                </div>
              )}
              <label>
                <span><Volume2 size={14} /> Music volume</span>
                <input type="range" min="0" max="100" value={musicVolume} onChange={(e) => setMusicVolume(Number(e.target.value))} />
              </label>
              <label>
                <span><Volume2 size={14} /> Original audio</span>
                <input type="range" min="0" max="140" value={originalVolume} onChange={(e) => setOriginalVolume(Number(e.target.value))} />
              </label>
            </div>
          </div>
        )}

        {activeTab === 'details' && (
          <div className="editor-grid-panel">
            <label className="editor-comment-box">
              <span>Video title</span>
              <input
                type="text"
                value={videoTitle}
                onChange={(event) => onVideoTitleChange?.(event.target.value.slice(0, 90))}
                placeholder="Give your entry a clear title"
                maxLength={90}
              />
              <small>{videoTitle.length}/90 - Used as the video title</small>
            </label>
            <label className="editor-comment-box">
              <span>Uploader comment</span>
              <textarea
                value={uploaderComment}
                onChange={(event) => onUploaderCommentChange?.(event.target.value.slice(0, 500))}
                placeholder="Say something about your entry..."
                rows={4}
              />
              <small>{uploaderComment.length}/500 - Added to YouTube description</small>
            </label>
            <div className="editor-empty-state">
              Challenge name, hashtags, creator identity, and remix source are added automatically to the description.
            </div>
          </div>
        )}

        {activeTab === 'adjust' && (
          <div className="editor-sliders">
            <label>Brightness <input type="range" min="75" max="130" value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} /></label>
            <label>Contrast <input type="range" min="80" max="150" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} /></label>
            <label>Saturation <input type="range" min="70" max="180" value={saturation} onChange={(e) => setSaturation(Number(e.target.value))} /></label>
            <label>Warmth <input type="range" min="-40" max="45" value={warmth} onChange={(e) => setWarmth(Number(e.target.value))} /></label>
            <label>Vignette <input type="range" min="0" max="72" value={vignette} onChange={(e) => setVignette(Number(e.target.value))} /></label>
            <label>Grain <input type="range" min="0" max="14" value={grain} onChange={(e) => setGrain(Number(e.target.value))} /></label>
          </div>
        )}

        {activeTab === 'motion' && (
          <div className="editor-grid-panel">
            <div className="editor-trim-box">
              <div className="editor-trim-header">
                <span>Clip cut</span>
                <strong>{formatClipTime(trimStart)} - {formatClipTime(trimEnd)}</strong>
              </div>
              <div className="editor-trim-stage" style={{ '--trim-progress': trimProgress } as CSSProperties & Record<string, number>}>
                <div className="editor-trim-film" />
                <div className="editor-trim-window">
                  <span>{Math.round(cutWindowSeconds)}s CUT</span>
                </div>
              </div>
              <label className="editor-trim-slider">
                <span>Move video bar left or right inside the 30s frame</span>
                <input
                  type="range"
                  min="0"
                  max={maxTrimStart}
                  step="0.1"
                  value={Math.min(trimStart, maxTrimStart)}
                  onChange={(e) => previewClipWindow(Number(e.target.value))}
                  disabled={maxTrimStart <= 0}
                />
              </label>
            </div>
            <div className="editor-segment">
              {[0.75, 1, 1.25, 1.5].map((value) => (
                <button key={value} className={speed === value ? 'active' : ''} onClick={() => setSpeed(value)} type="button">
                  {value}x
                </button>
              ))}
            </div>
            <button className={`editor-action ${showBeatGlow ? 'active' : ''}`} onClick={() => setShowBeatGlow((value) => !value)} type="button">
              <Wand2 size={18} />
              Beat glow
            </button>
            <button className={`editor-action ${showWatermark ? 'active' : ''}`} onClick={() => setShowWatermark((value) => !value)} type="button">
              <ImageIcon size={18} />
              Watermark
            </button>
            <button className={`editor-action ${isMirrored ? 'active' : ''}`} onClick={() => setIsMirrored((value) => !value)} type="button">
              <RotateCcw size={18} />
              Mirror
            </button>
          </div>
        )}

        {activeTab === 'effects' && (
          <div className="editor-grid-panel">
            <div className="editor-segment">
              {([
                ['clean', 'Clean'],
                ['cinema', 'Cinema'],
                ['spotlight', 'Spot'],
                ['scanline', 'VHS'],
                ['hype', 'Hype'],
              ] as Array<[EffectPreset, string]>).map(([id, label]) => (
                <button key={id} className={effectPreset === id ? 'active' : ''} onClick={() => setEffectPreset(id)} type="button">
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="editor-footer-actions">
          <button onClick={resetEdits} type="button">
            <RotateCcw size={16} />
            Reset
          </button>
          <button onClick={handleFinalize} disabled={isBusy} type="button">
            <Download size={16} />
            Render + upload
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showTextInput && (
          <motion.div
            className="editor-text-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <input
              autoFocus
              type="text"
              maxLength={42}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder="Make it iconic"
            />
            <div className="editor-text-modal-actions">
              <button onClick={() => setShowTextInput(false)} type="button">Cancel</button>
              <button onClick={saveTextOverlay} type="button">Done</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .video-editor-overlay {
          position: fixed;
          inset: 0;
          background: #05050a;
          color: #fff;
          z-index: 2000;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .editor-topbar {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: max(14px, env(safe-area-inset-top)) 16px 12px;
          background: linear-gradient(to bottom, rgba(0,0,0,0.72), rgba(0,0,0,0));
        }
        .editor-icon-btn,
        .editor-next-btn,
        .editor-tabs button,
        .editor-action,
        .editor-footer-actions button,
        .editor-segment button {
          border: 0;
          color: #fff;
          font-weight: 850;
        }
        .editor-icon-btn {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: rgba(0,0,0,0.42);
        }
        .editor-title {
          display: flex;
          align-items: center;
          gap: 7px;
          font-weight: 950;
          letter-spacing: 0;
        }
        .editor-next-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-height: 40px;
          padding: 0 14px;
          border-radius: 999px;
          background: linear-gradient(135deg, #00e5ff, #7c3cff 55%, #ffea00);
          color: #05050a;
        }
        .editor-preview {
          position: relative;
          flex: 1;
          min-height: 0;
          background: #000;
          overflow: hidden;
        }
        .editor-tint {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .editor-fx-preview {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .editor-fx-preview.cinema::before,
        .editor-fx-preview.cinema::after {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          height: 8.5%;
          background: rgba(0,0,0,0.92);
        }
        .editor-fx-preview.cinema::before { top: 0; }
        .editor-fx-preview.cinema::after { bottom: 0; }
        .editor-fx-preview.spotlight {
          background-image: radial-gradient(circle at 50% 42%, rgba(255,255,255,0.08), rgba(0,0,0,0) 42%, rgba(0,0,0,0.46) 100%);
        }
        .editor-fx-preview.scanline {
          background-image: repeating-linear-gradient(to bottom, rgba(255,255,255,0.12) 0, rgba(255,255,255,0.12) 1px, transparent 1px, transparent 8px);
          mix-blend-mode: screen;
        }
        .editor-fx-preview.hype {
          background-image: linear-gradient(135deg, rgba(0,229,255,0.08), rgba(255,47,125,0), rgba(255,234,0,0.07));
        }
        .editor-beat-frame {
          position: absolute;
          inset: 10px;
          border: 3px solid rgba(0,229,255,0.65);
          box-shadow: inset 0 0 30px rgba(255,47,125,0.34), 0 0 26px rgba(0,229,255,0.24);
          animation: challengeOnPulse 0.72s ease-in-out infinite alternate;
          pointer-events: none;
        }
        .editor-watermark {
          position: absolute;
          right: 18px;
          top: 72px;
          width: 54px;
          height: 54px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: transparent;
          box-shadow: 0 8px 26px rgba(0,75,255,0.32), 0 8px 22px rgba(0,0,0,0.22);
          overflow: hidden;
        }
        .editor-watermark img {
          width: 100%;
          height: 100%;
          display: block;
        }
        .editor-text-preview {
          position: absolute;
          left: 7%;
          right: 7%;
          text-align: center;
          font-size: clamp(28px, 8vw, 58px);
          font-weight: 950;
          line-height: 1;
          overflow-wrap: anywhere;
          pointer-events: none;
        }
        .editor-text-preview.top { top: 15%; }
        .editor-text-preview.center { top: 48%; transform: translateY(-50%); }
        .editor-text-preview.bottom { bottom: 17%; }
        .editor-text-preview.bold { color: #fff; text-shadow: 0 4px 18px rgba(0,0,0,0.85); }
        .editor-text-preview.neon { color: #5dfcff; text-shadow: 0 0 18px rgba(93,252,255,0.95), 0 3px 12px #000; }
        .editor-text-preview.caption { color: #111; background: rgba(255,255,255,0.88); border-radius: 8px; padding: 10px 12px; }
        .editor-text-preview.stamp { color: #ffea00; text-shadow: 0 3px 0 #111, 0 0 18px rgba(255,234,0,0.42); }
        .editor-text-preview.active { filter: drop-shadow(0 0 12px rgba(0,229,255,0.65)); }
        .editor-render-status {
          position: absolute;
          left: 50%;
          bottom: 28px;
          transform: translateX(-50%);
          padding: 12px 16px;
          border-radius: 999px;
          background: rgba(0,0,0,0.72);
          font-size: 13px;
          font-weight: 850;
        }
        .editor-render-error {
          margin: 10px 12px 0;
          padding: 10px 12px;
          border: 1px solid rgba(255, 87, 87, 0.38);
          border-radius: 10px;
          background: rgba(255, 87, 87, 0.12);
          color: #ffd6d6;
          font-size: 13px;
          font-weight: 750;
          line-height: 1.35;
        }
        .editor-tabs {
          display: flex;
          overflow-x: auto;
          background: #0d0d14;
          border-top: 1px solid rgba(255,255,255,0.08);
          scrollbar-width: none;
        }
        .editor-tabs::-webkit-scrollbar {
          display: none;
        }
        .editor-tabs button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          flex: 0 0 auto;
          min-width: 74px;
          padding: 12px 4px;
          background: transparent;
          color: rgba(255,255,255,0.58);
          font-size: 12px;
        }
        .editor-tabs button.active {
          color: #fff;
          background: rgba(255,255,255,0.08);
        }
        .editor-panel {
          min-height: 188px;
          max-height: 42vh;
          overflow-y: auto;
          padding: 14px 14px calc(14px + env(safe-area-inset-bottom));
          background: #0d0d14;
        }
        .editor-strip {
          display: flex;
          gap: 12px;
          overflow-x: auto;
          padding-bottom: 8px;
        }
        .editor-filter {
          min-width: 76px;
          border: 0;
          background: transparent;
          color: rgba(255,255,255,0.72);
          font-size: 11px;
          font-weight: 800;
        }
        .editor-filter span {
          display: block;
          height: 68px;
          border-radius: 8px;
          margin-bottom: 7px;
          border: 2px solid transparent;
        }
        .editor-filter.active {
          color: #fff;
        }
        .editor-filter.active span {
          border-color: #00e5ff;
        }
        .editor-grid-panel {
          display: grid;
          gap: 12px;
        }
        .editor-text-stack {
          display: grid;
          gap: 8px;
        }
        .editor-text-row {
          display: grid;
          grid-template-columns: 1fr 42px 42px;
          gap: 8px;
          align-items: stretch;
        }
        .editor-text-row button {
          border: 0;
          border-radius: 8px;
          background: rgba(255,255,255,0.08);
          color: #fff;
          min-height: 42px;
          font-weight: 850;
        }
        .editor-text-row > button:first-child {
          display: grid;
          justify-items: start;
          align-content: center;
          padding: 8px 10px;
          text-align: left;
          overflow: hidden;
        }
        .editor-text-row span {
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .editor-text-row small,
        .editor-music-grid small,
        .editor-comment-box small {
          color: rgba(255,255,255,0.5);
          font-size: 10px;
          font-weight: 800;
        }
        .editor-text-row.active button {
          background: rgba(0,229,255,0.18);
        }
        .editor-empty-state {
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          padding: 12px;
          color: rgba(255,255,255,0.58);
          font-size: 12px;
          font-weight: 800;
          line-height: 1.35;
        }
        .editor-trim-box {
          display: grid;
          gap: 10px;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          padding: 12px;
          background: rgba(255,255,255,0.05);
        }
        .editor-trim-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          font-size: 12px;
          color: rgba(255,255,255,0.68);
          font-weight: 900;
        }
        .editor-trim-header strong {
          color: #fff;
        }
        .editor-trim-stage {
          position: relative;
          height: 82px;
          overflow: hidden;
          border-radius: 10px;
          background: rgba(0,0,0,0.32);
          border: 1px solid rgba(255,255,255,0.1);
        }
        .editor-trim-film {
          position: absolute;
          top: 20px;
          left: 50%;
          width: 142%;
          height: 42px;
          transform: translateX(calc(-50% - (var(--trim-progress, 0) * 30%)));
          border-radius: 8px;
          background:
            repeating-linear-gradient(90deg, rgba(255,255,255,0.18) 0 2px, transparent 2px 18px),
            linear-gradient(135deg, rgba(103,232,249,0.24), rgba(255,234,0,0.18), rgba(255,47,125,0.18));
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1);
          transition: transform 0.08s linear;
        }
        .editor-trim-window {
          position: absolute;
          inset: 10px 24%;
          border: 2px solid #67e8f9;
          border-radius: 10px;
          box-shadow: 0 0 0 999px rgba(0,0,0,0.42), 0 0 18px rgba(103,232,249,0.28);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          pointer-events: none;
        }
        .editor-trim-window span {
          transform: translateY(50%);
          padding: 3px 8px;
          border-radius: 999px;
          background: #67e8f9;
          color: #061015;
          font-size: 10px;
          font-weight: 950;
        }
        .editor-trim-slider {
          display: grid;
          gap: 6px;
          font-size: 12px;
          font-weight: 850;
          color: rgba(255,255,255,0.72);
        }
        .editor-trim-slider span {
          color: rgba(255,255,255,0.58);
          font-size: 11px;
          line-height: 1.35;
        }
        .editor-trim-slider input {
          width: 100%;
          accent-color: #00e5ff;
        }
        .editor-music-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .editor-remix-source {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          border: 1px solid rgba(0,229,255,0.22);
          border-radius: 8px;
          padding: 12px;
          background: rgba(0,229,255,0.08);
        }
        .editor-remix-source strong,
        .editor-remix-source span,
        .editor-remix-source small {
          display: block;
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .editor-remix-source strong {
          color: #67e8f9;
          font-size: 12px;
          font-weight: 950;
        }
        .editor-remix-source span {
          margin-top: 4px;
          color: #fff;
          font-size: 13px;
          font-weight: 850;
        }
        .editor-remix-source a {
          color: #67e8f9;
          font-size: 11px;
          font-weight: 900;
          text-decoration: none;
        }
        .editor-music-grid button {
          min-height: 58px;
          border: 0;
          border-radius: 8px;
          background: rgba(255,255,255,0.08);
          color: #fff;
          display: grid;
          grid-template-columns: 18px 1fr;
          align-items: center;
          column-gap: 8px;
          padding: 9px 10px;
          text-align: left;
          font-weight: 900;
        }
        .editor-music-grid button small {
          grid-column: 2;
        }
        .editor-music-grid button.active {
          background: rgba(0,229,255,0.2);
          outline: 1px solid rgba(0,229,255,0.55);
        }
        .editor-comment-box {
          display: grid;
          gap: 8px;
        }
        .editor-comment-box > span {
          font-size: 12px;
          font-weight: 900;
          color: rgba(255,255,255,0.72);
        }
        .editor-comment-box input,
        .editor-comment-box textarea {
          width: 100%;
          border: 1px solid rgba(255,255,255,0.12);
          outline: 0;
          border-radius: 8px;
          background: rgba(255,255,255,0.08);
          color: #fff;
          padding: 11px 12px;
          font-size: 13px;
          line-height: 1.45;
        }
        .editor-comment-box input {
          min-height: 44px;
        }
        .editor-comment-box textarea {
          resize: vertical;
          min-height: 98px;
          max-height: 170px;
        }
        .editor-action {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 42px;
          border-radius: 8px;
          background: rgba(255,255,255,0.1);
        }
        .editor-action.active {
          background: rgba(0,229,255,0.22);
        }
        .editor-segment {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: 1fr;
          gap: 6px;
        }
        .editor-segment button {
          min-height: 38px;
          border-radius: 8px;
          background: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.62);
          text-transform: capitalize;
        }
        .editor-segment button.active {
          background: #fff;
          color: #05050a;
        }
        .editor-sliders {
          display: grid;
          gap: 13px;
        }
        .editor-sliders.compact {
          gap: 10px;
        }
        .editor-sliders label {
          display: grid;
          gap: 6px;
          font-size: 12px;
          font-weight: 850;
          color: rgba(255,255,255,0.74);
        }
        .editor-sliders label span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .editor-sliders input {
          width: 100%;
          accent-color: #00e5ff;
        }
        .editor-footer-actions {
          display: grid;
          grid-template-columns: 0.8fr 1.2fr;
          gap: 10px;
          margin-top: 12px;
        }
        .editor-footer-actions button {
          min-height: 42px;
          border-radius: 8px;
          background: rgba(255,255,255,0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
        }
        .editor-footer-actions button:last-child {
          background: #fff;
          color: #05050a;
        }
        .editor-text-modal {
          position: fixed;
          inset: 0;
          z-index: 50;
          background: rgba(0,0,0,0.92);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          padding: 22px;
        }
        .editor-text-modal input {
          width: 100%;
          border: 0;
          outline: 0;
          background: transparent;
          color: #fff;
          text-align: center;
          font-size: clamp(30px, 9vw, 62px);
          font-weight: 950;
        }
        .editor-text-modal-actions {
          margin-top: 30px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          width: min(360px, 100%);
        }
        .editor-text-modal-actions button {
          border: 0;
          border-radius: 8px;
          background: #fff;
          color: #05050a;
          padding: 13px 28px;
          font-weight: 900;
        }
        .editor-text-modal-actions button:first-child {
          background: rgba(255,255,255,0.14);
          color: #fff;
        }
        @media (max-width: 520px) {
          .editor-topbar {
            padding: calc(12px + env(safe-area-inset-top, 0px)) 10px 10px;
            gap: 8px;
          }
          .editor-icon-btn {
            width: 40px;
            height: 40px;
            flex: 0 0 40px;
          }
          .editor-title {
            min-width: 0;
            flex: 1 1 auto;
            justify-content: center;
          }
          .editor-title span {
            max-width: 42vw;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .editor-next-btn {
            min-width: 0;
            padding: 0 10px;
            flex: 0 0 auto;
          }
          .editor-watermark {
            right: 12px;
            top: 64px;
            width: 48px;
            height: 48px;
          }
          .editor-tabs button {
            min-width: 68px;
            font-size: 11px;
          }
          .editor-panel {
            min-height: 172px;
            max-height: 45vh;
            padding: 12px 10px calc(12px + env(safe-area-inset-bottom, 0px));
          }
          .editor-music-grid {
            grid-template-columns: 1fr;
          }
          .editor-segment {
            grid-auto-flow: row;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .editor-text-row {
            grid-template-columns: 1fr 38px 38px;
            gap: 7px;
          }
          .editor-text-row button {
            min-height: 40px;
          }
          .editor-trim-header {
            align-items: flex-start;
            flex-direction: column;
          }
          .editor-footer-actions {
            grid-template-columns: 1fr;
          }
          .editor-text-modal {
            padding: 18px;
          }
          .editor-text-modal-actions {
            grid-template-columns: 1fr;
          }
        }
        @keyframes challengeOnPulse {
          from { opacity: 0.42; transform: scale(0.992); }
          to { opacity: 0.9; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
