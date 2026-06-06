import { useRef, useState, useEffect } from 'react';
import { X, Circle, Square, CheckCircle2, Share2, Camera, Video, Send, Download, RefreshCw, UploadCloud } from 'lucide-react';
import VideoEditor from './VideoEditor';
import { apiUrl } from '../config/api';
import { MiniKit } from '@worldcoin/minikit-js';
import { auth } from '../firebase';

// Native Capacitor imports removed to support pure web Mini-App environment

interface CameraCaptureProps {
  onClose: () => void;
  onRecordingComplete: (uploadResult?: VideoUploadResult) => void | Promise<void>;
  challengeTitle: string;
  challengeId: string;
  authorName: string;
  authorUid?: string | null;
  authorWorldUsername?: string | null;
  initialMode?: 'camera' | 'upload';
  initialBlob?: Blob | null;
  remixSource?: RemixSource | null;
}

type RemixSource = {
  videoId: string;
  title: string;
  author: string;
  platform: string;
  url?: string;
};

type VideoUploadResult = {
  success?: boolean;
  data?: {
    id?: string;
    [key: string]: unknown;
  };
  entryRegistration?: {
    chainId: number;
    prizeManagerAddress: `0x${string}`;
    challengeId: `0x${string}`;
    videoId: `0x${string}`;
    creator: `0x${string}`;
    deadline: number;
    signature: `0x${string}`;
  } | null;
};

const MAX_RECORDING_SECONDS = 180;

const formatRecordTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export default function CameraCapture({ onClose, onRecordingComplete, challengeTitle, challengeId, authorName, authorUid, authorWorldUsername, initialMode = 'camera', initialBlob = null, remixSource = null }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isUploaded, setIsUploaded] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(MAX_RECORDING_SECONDS);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(initialBlob);
  const [isLiveCapturedRecording, setIsLiveCapturedRecording] = useState(false);
  const [editedBlob, setEditedBlob] = useState<Blob | null>(null);
  const [editedDownloadUrl, setEditedDownloadUrl] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [uploaderComment, setUploaderComment] = useState('');
  const [cameraRetryNonce, setCameraRetryNonce] = useState(0);
  const timerRef = useRef<number | null>(null);

  const getCameraErrorMessage = (err: unknown) => {
    if (err instanceof DOMException) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        return 'Camera and microphone permission was denied. Please allow access in World App settings and try again.';
      }

      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        return 'No available camera or microphone was found on this device.';
      }

      if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        return 'The camera is busy in another app. Close the other app and try again.';
      }

      if (err.name === 'OverconstrainedError') {
        return 'This device could not satisfy the requested camera settings. Please try again.';
      }
    }

    if (err instanceof Error && err.message) {
      return err.message;
    }

    return 'Failed to access the camera.';
  };

  useEffect(() => {
    async function initCamera() {
      try {
        setError('');
        if (initialMode === 'upload') return;
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access is not supported in this environment.');
        }

        // Standard Web API for camera access - handles permissions automatically

        // 2. Determine Supported MIME Type
        const types = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/ogg'];
        let selectedType = '';
        for (const type of types) {
          if (MediaRecorder.isTypeSupported(type)) {
            selectedType = type;
            break;
          }
        }

        // 3. Initialize Stream
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, 
          audio: true 
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        // 4. Initialize MediaRecorder
        const recorder = selectedType
          ? new MediaRecorder(stream, { mimeType: selectedType })
          : new MediaRecorder(stream);
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: selectedType || 'video/webm' });
          setRecordedBlob(blob);
          setIsLiveCapturedRecording(true);
          chunksRef.current = [];
        };
        mediaRecorderRef.current = recorder;

      } catch (err: unknown) {
        console.error('Camera init error:', err);
        setError(getCameraErrorMessage(err));
      }
    }
    
    initCamera();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [cameraRetryNonce, initialMode]);

  useEffect(() => {
    if (initialBlob) {
      setRecordedBlob(initialBlob);
      setIsLiveCapturedRecording(false);
    }
  }, [initialBlob]);

  useEffect(() => {
    return () => {
      if (editedDownloadUrl) URL.revokeObjectURL(editedDownloadUrl);
    };
  }, [editedDownloadUrl]);

  const getVideoFileExtension = (blob: Blob) => (blob.type.includes('mp4') ? 'mp4' : 'webm');
  const getEditedFileName = (blob: Blob) => `GoodON_Edit_${Date.now()}.${getVideoFileExtension(blob)}`;

  const openSaveSheet = async (blob: Blob) => {
    const fileName = getEditedFileName(blob);
    const file = new File([blob], fileName, { type: blob.type || 'video/webm' });

    try {
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({
          files: [file],
          title: 'Good ON',
          text: 'Save your edited Good ON kindness video.',
        });
        return true;
      }
    } catch (err) {
      console.warn('Native share/save sheet failed:', err);
    }

    try {
      if (MiniKit.isInstalled()) {
        await MiniKit.share({
          files: [file],
          title: 'Good ON',
          text: 'Save your edited Good ON kindness video.',
        });
        return true;
      }
    } catch (err) {
      console.warn('MiniKit file share failed:', err);
    }

    return false;
  };

  const saveEditedVideoLocally = (blob: Blob) => {
    if (editedDownloadUrl) URL.revokeObjectURL(editedDownloadUrl);

    const url = URL.createObjectURL(blob);
    setEditedBlob(blob);
    setEditedDownloadUrl(url);

    const link = document.createElement('a');
    link.href = url;
    link.download = getEditedFileName(blob);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const prepareEditedVideoForFallback = (blob: Blob) => {
    if (editedDownloadUrl) URL.revokeObjectURL(editedDownloadUrl);

    const url = URL.createObjectURL(blob);
    setEditedBlob(blob);
    setEditedDownloadUrl(url);
  };

  const saveEditedVideoToPhone = async (blob: Blob) => {
    saveEditedVideoLocally(blob);
    await openSaveSheet(blob);
  };

  const saveToGallery = async (blob: Blob) => {
    setIsSaving(true);
    setUploadError('');
    prepareEditedVideoForFallback(blob);
    try {
      // 1. Prepare FormData for direct YouTube upload via Backend
      const formData = new FormData();
      formData.append('video', blob, `UNON_${Date.now()}.${getVideoFileExtension(blob)}`);
      formData.append('challengeId', challengeId);
      formData.append('challengeTitle', challengeTitle);
      formData.append('author', authorName);
      const cleanVideoTitle = videoTitle.trim().slice(0, 90);
      if (cleanVideoTitle) formData.append('videoTitle', cleanVideoTitle);
      const cleanUploaderComment = uploaderComment.trim().slice(0, 500);
      if (cleanUploaderComment) formData.append('uploaderComment', cleanUploaderComment);
      if (authorUid) formData.append('authorUid', authorUid);
      if (authorWorldUsername) formData.append('authorWorldUsername', authorWorldUsername);
      if (remixSource) {
        formData.append('remixSourceVideoId', remixSource.videoId);
        formData.append('remixSourceTitle', remixSource.title);
        formData.append('remixSourceAuthor', remixSource.author);
        formData.append('remixSourcePlatform', remixSource.platform);
        if (remixSource.url) formData.append('remixSourceUrl', remixSource.url);
      }

      // 2. Upload to U&On Backend -> YouTube
      console.log('[UPLOAD] Uploading to Good ON Server (YouTube)...');
      const idToken = await auth.currentUser?.getIdToken();
      const response = await fetch(apiUrl('/api/videos/upload'), {
        method: 'POST',
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Upload failed');
      }
      const result = await response.json() as VideoUploadResult;

      // Video is now being uploaded directly to the backend/YouTube

      setIsUploaded(true);
      setIsSaved(true);
      await onRecordingComplete(result);
    } catch (err: any) {
      console.error('Upload Error:', err);
      setUploadError(err.message || 'Unknown Error');
    } finally {
      setIsSaving(false);
    }
  };

  const retryUploadEditedVideo = async () => {
    if (!editedBlob) return;
    await saveToGallery(editedBlob);
  };


  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const startRecording = () => {
    if (!mediaRecorderRef.current) {
      setError('Live video recording is not available in this World App session. Use your phone camera to capture a video instead.');
      openNativeCameraCapture();
      return;
    }
    
    chunksRef.current = [];
    try {
      mediaRecorderRef.current.start(1000);
      setIsRecording(true);
      setTimeLeft(MAX_RECORDING_SECONDS);
      
      timerRef.current = window.setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            stopRecording();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
      setError('Live video recording could not start in World App. Use your phone camera to capture a video instead.');
      openNativeCameraCapture();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) window.clearInterval(timerRef.current);
    }
  };

  const openNativeCameraCapture = () => {
    fileInputRef.current?.click();
  };

  const openRemixSource = () => {
    if (!remixSource?.url) return;
    window.open(remixSource.url, '_blank', 'noopener,noreferrer');
  };

  const handleNativeCaptureChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      event.target.value = '';
      return;
    }

    setError('');
    setRecordedBlob(file);
    setIsLiveCapturedRecording(false);
    event.target.value = '';
  };

  return (
    <div className="camera-overlay">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        {...(initialMode === 'camera' ? { capture: 'user' as const } : {})}
        onChange={handleNativeCaptureChange}
        style={{ display: 'none' }}
      />
      {uploadError ? (
        <div className="camera-error">
          <UploadCloud size={48} color="#ffcc00" style={{ marginBottom: '14px' }} />
          <h2 style={{ color: '#fff', marginBottom: '10px' }}>Upload failed</h2>
          <p>{uploadError}</p>
          <p style={{ marginTop: '12px', color: 'rgba(255,255,255,0.75)', fontSize: '13px', lineHeight: 1.5 }}>
            Your edited video was prepared for local saving before upload. Use Download Again if the browser did not show the save prompt.
          </p>
          {editedDownloadUrl && (
            <button
              type="button"
              onClick={() => {
                if (editedBlob) void saveEditedVideoToPhone(editedBlob);
              }}
              className="btn-primary"
              style={{ marginTop: '20px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Download size={18} />
              Save to Phone
            </button>
          )}
          <button
            onClick={retryUploadEditedVideo}
            className="btn-primary"
            disabled={isSaving || !editedBlob}
            style={{ marginTop: '12px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <RefreshCw size={18} />
            Retry YouTube Upload
          </button>
          <button
            onClick={() => {
              setUploadError('');
              setIsUploaded(false);
              setIsSaved(true);
            }}
            className="btn-secondary"
            style={{ marginTop: '12px', width: '100%' }}
          >
            Continue with local copy
          </button>
        </div>
      ) : error ? (
        <div className="camera-error">
          <p>{error}</p>
          <p style={{ marginTop: '12px', color: 'rgba(255,255,255,0.75)', fontSize: '13px', lineHeight: 1.5 }}>
            If live camera preview is blocked in World App, use your phone camera directly and we will import the recorded video here.
          </p>
          <button
            onClick={openNativeCameraCapture}
            className="btn-primary"
            style={{ marginTop: '20px', width: '100%' }}
          >
            Open Phone Camera
          </button>
          <button
            onClick={() => setCameraRetryNonce(prev => prev + 1)}
            className="btn-primary"
            style={{ marginTop: '12px', width: '100%' }}
          >
            Try Again
          </button>
          <button onClick={onClose} className="btn-secondary" style={{ marginTop: '12px', width: '100%' }}>Go Back</button>
        </div>
      ) : recordedBlob && !isSaved ? (
        <>
          <VideoEditor 
            blob={recordedBlob} 
            isProcessing={isSaving}
            onCancel={() => {
              if (initialMode === 'upload') {
                onClose();
                return;
              }
              setRecordedBlob(null);
              setIsLiveCapturedRecording(false);
            }}
            onSave={saveToGallery}
            videoTitle={videoTitle}
            onVideoTitleChange={setVideoTitle}
            uploaderComment={uploaderComment}
            onUploaderCommentChange={setUploaderComment}
            remixSource={remixSource}
            isHumanVerifiedCapture={isLiveCapturedRecording}
            defaultMirrored={isLiveCapturedRecording}
          />
          {remixSource?.url && (
            <button
              type="button"
              className="camera-remix-floating-btn"
              onClick={openRemixSource}
            >
              Open remix source sound
            </button>
          )}
        </>
      ) : isSaved ? (
        <div className="camera-success-modal" style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--surface)', borderRadius: '24px', width: '90%', border: '1px solid var(--primary)' }}>
          <CheckCircle2 size={64} color="#00ff00" style={{ marginBottom: '20px' }} />
          <h2 style={{ color: '#fff', marginBottom: '12px' }}>{isUploaded ? 'Upload Successful!' : 'Saved Locally'}</h2>
          <p style={{ color: '#bbb', marginBottom: '32px' }}>
            {isUploaded
              ? 'Video has been posted directly to the U&On Global feed and YouTube Shorts! Start earning UNON from fans!'
              : 'Your edited video is saved locally. You can retry YouTube upload after reconnecting the U&On YouTube authorization.'}
          </p>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
            <button className="social-shortcut-btn" style={{ background: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)', border: 'none', padding: '12px', borderRadius: '12px', color: '#fff', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Camera size={18} /> Instagram
            </button>
            <button className="social-shortcut-btn" style={{ background: '#000', border: 'none', padding: '12px', borderRadius: '12px', color: '#fff', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Share2 size={18} /> TikTok
            </button>
            <button className="social-shortcut-btn" style={{ background: '#ff0000', border: 'none', padding: '12px', borderRadius: '12px', color: '#fff', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Video size={18} /> Shorts
            </button>
            <button className="social-shortcut-btn" onClick={() => { void onRecordingComplete(); }} style={{ background: 'var(--primary)', border: 'none', padding: '12px', borderRadius: '12px', color: '#fff', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Send size={18} /> Finalize
            </button>
          </div>
          <p style={{ fontSize: '12px', color: '#666' }}>Don't forget to submit your post link later to verify!</p>
        </div>
      ) : (
        <>
          <video ref={videoRef} autoPlay playsInline muted className="camera-video mirrored" />
          
          {isSaving && (
            <div className="saving-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
               <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
               <p style={{ marginTop: '16px', color: '#fff' }}>Uploading to Good ON Relay Network...</p>
            </div>
          )}

          <div className="camera-header">
            <button className="camera-close" onClick={onClose} disabled={isRecording}>
              <X size={28} color="#fff" />
            </button>
            <div className="camera-title">
              <span className="camera-badge">REC</span> {challengeTitle}
              {remixSource && <small>Remix: {remixSource.title}</small>}
            </div>
          </div>

          {remixSource && (
            <div className="camera-remix-source">
              <div>
                <strong>Praise relay source</strong>
                <span>{remixSource.title}</span>
                <small>{remixSource.platform} by @{remixSource.author}</small>
              </div>
              {remixSource.url && (
                <button type="button" onClick={openRemixSource}>
                  Open sound
                </button>
              )}
            </div>
          )}

          <div className="camera-footer">
            {isRecording && <div className="camera-timer">{formatRecordTime(timeLeft)}</div>}
            
            <button className={`record-btn ${isRecording ? 'recording' : ''}`} onClick={toggleRecording}>
              <div className="record-btn-inner">
                {isRecording ? <Square size={24} color="#ff0000" fill="#ff0000" /> : <Circle size={48} color="#ff0000" fill="#ff0000" />}
              </div>
            </button>
            <button
              type="button"
              onClick={openNativeCameraCapture}
              style={{
                marginTop: '4px',
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff',
                borderRadius: '999px',
                padding: '10px 16px',
                fontSize: '12px',
                fontWeight: 700
              }}
            >
              Use Phone Camera Instead
            </button>
            <p className="camera-hint">{isRecording ? 'Tap to finish' : 'Tap to record (Max 3 min)'}</p>
          </div>
        </>
      )}
    </div>
  );
}
