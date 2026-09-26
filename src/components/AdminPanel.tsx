import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  Activity,
  Award,
  ArrowRightLeft,
  BarChart3,
  Coins,
  Database,
  EyeOff,
  ExternalLink,
  Link,
  PieChart,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  Shield,
  Trash2,
  Video,
  Wallet,
  X,
} from 'lucide-react';
import { apiUrl } from '../config/api';

type AdminPanelProps = {
  currentUser: User;
  onClose: () => void;
};

type AdminTab = 'dashboard' | 'videos' | 'challenges' | 'unon' | 'settings' | 'audit';

type ChallengeEditDraft = {
  id: string;
  title: string;
  hashtags: string;
  region: string;
  isActive: boolean;
};

type AddVideoDraft = {
  challengeId: string;
  url: string;
  title: string;
  author: string;
};

type EditableSetting = {
  key: string;
  label: string;
  description: string;
  multiline?: boolean;
};

const editorChoiceSettings: EditableSetting[] = [
  {
    key: 'EDITORS_CHOICE_TITLE',
    label: "Editor's Choice title",
    description: 'Main heading shown on the home feed.'
  },
  {
    key: 'EDITORS_CHOICE_SUBTITLE',
    label: "Editor's Choice subtitle",
    description: 'Small supporting copy under the heading.'
  },
  {
    key: 'EDITORS_CHOICE_AI_BADGE',
    label: 'AI card badge',
    description: 'Badge text for AI-related editor picks.'
  },
  {
    key: 'EDITORS_CHOICE_DEFAULT_BADGE',
    label: 'Default card badge',
    description: 'Badge text for non-AI editor picks.'
  },
  {
    key: 'EDITORS_CHOICE_PICK_BADGE',
    label: 'Expanded section badge',
    description: 'Badge shown above the expanded video section.'
  },
  {
    key: 'EDITORS_CHOICE_RANKING_PREFIX',
    label: 'Ranking prefix',
    description: 'Text before the rank number, e.g. TOP.'
  },
  {
    key: 'EDITORS_CHOICE_RANKING_SUFFIX',
    label: 'Ranking suffix',
    description: 'Text after the rank number, e.g. INSIGHT.'
  },
  {
    key: 'EDITORS_CHOICE_QUICK_NAV_LABEL',
    label: 'Quick nav label',
    description: 'Short label in the floating quick navigation menu.'
  }
];

const operationsNoteSettings: EditableSetting[] = [
  {
    key: 'MATCH_THRESHOLD_NOTE',
    label: 'Match threshold note',
    description: 'Internal note about challenge matching quality.',
    multiline: true
  },
  {
    key: 'REGION_POLICY_NOTE',
    label: 'Region policy note',
    description: 'Internal note about region classification policy.',
    multiline: true
  },
  {
    key: 'VIDEO_MAINTENANCE_NOTE',
    label: 'Video maintenance note',
    description: 'Internal note about video maintenance rules.',
    multiline: true
  }
];

const editableSettings = [...editorChoiceSettings, ...operationsNoteSettings];

const unonChartColors = ['#67e8f9', '#a78bfa', '#fbbf24', '#34d399', '#f472b6', '#fb7185', '#60a5fa', '#c084fc'];

const formatCompactNumber = (value: number) => {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value >= 1000 ? 0 : 2,
    notation: value >= 1_000_000 ? 'compact' : 'standard'
  }).format(value);
};

const formatTokenAmount = (value: number) => {
  if (!Number.isFinite(value)) return '0 UNON';
  return `${formatCompactNumber(value)} UNON`;
};

const formatWalletBalance = (row: any) => (
  row?.balanceReadOk === false ? 'Read failed' : formatTokenAmount(Number(row?.balanceNumber || 0))
);

const formatPercent = (value: number) => `${Number(value || 0).toFixed(value >= 10 ? 1 : 2)}%`;

const shortAddress = (address?: string | null) => (
  address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not configured'
);

const buildConicGradient = (rows: any[]) => {
  const total = rows.reduce((sum, row) => sum + Number(row.balanceNumber || 0), 0);
  if (total <= 0) return 'rgba(255,255,255,0.06)';

  let cursor = 0;
  const stops = rows.map((row, index) => {
    const size = (Number(row.balanceNumber || 0) / total) * 360;
    const start = cursor;
    cursor += size;
    const color = unonChartColors[index % unonChartColors.length];
    return `${color} ${start}deg ${cursor}deg`;
  });

  return `conic-gradient(${stops.join(', ')})`;
};

const buildCountConicGradient = (rows: any[]) => {
  const total = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  if (total <= 0) return 'rgba(255,255,255,0.06)';

  let cursor = 0;
  return `conic-gradient(${rows.map((row, index) => {
    const size = (Number(row.value || 0) / total) * 360;
    const start = cursor;
    cursor += size;
    return `${unonChartColors[index % unonChartColors.length]} ${start}deg ${cursor}deg`;
  }).join(', ')})`;
};

const compactDateLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '').slice(5, 10);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

export default function AdminPanel({ currentUser, onClose }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [summary, setSummary] = useState<any>(null);
  const [videos, setVideos] = useState<any[]>([]);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [settingsRows, setSettingsRows] = useState<any[]>([]);
  const [settingsEnv, setSettingsEnv] = useState<any>(null);
  const [unonReport, setUnonReport] = useState<any>(null);
  const [isUnonLoading, setIsUnonLoading] = useState(false);
  const [isUnonSyncing, setIsUnonSyncing] = useState(false);
  const [videoStatus, setVideoStatus] = useState<'active' | 'hidden' | 'all'>('active');
  const [videoQuery, setVideoQuery] = useState('');
  const [targetChallengeByVideo, setTargetChallengeByVideo] = useState<Record<string, string>>({});
  const [settingDrafts, setSettingDrafts] = useState<Record<string, string>>({});
  const [challengeEditDraft, setChallengeEditDraft] = useState<ChallengeEditDraft | null>(null);
  const [addVideoDraft, setAddVideoDraft] = useState<AddVideoDraft | null>(null);
  const [jobResult, setJobResult] = useState<any>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  const challengeOptions = useMemo(
    () => challenges.map((challenge) => ({ id: challenge.id, label: `${challenge.title} (${challenge.region || 'Global'})` })),
    [challenges]
  );

  const adminFetch = async (path: string, options: RequestInit = {}, timeoutMs = 0) => {
    const token = await currentUser.getIdToken();
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const controller = timeoutMs > 0 ? new AbortController() : null;
    const timeoutId = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : 0;
    try {
      const response = await fetch(apiUrl(`/api/admin${path}`), { ...options, headers, signal: controller?.signal || options.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `Admin request failed: ${response.status}`);
      }
      return data;
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error(`Admin request timed out after ${Math.round(timeoutMs / 1000)}s`);
      }
      throw err;
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  };

  const loadSummary = async () => {
    const data = await adminFetch('/summary');
    setSummary(data.data);
  };

  const loadVideos = async () => {
    const params = new URLSearchParams({ status: videoStatus, limit: '80' });
    if (videoQuery.trim()) params.set('q', videoQuery.trim());
    const data = await adminFetch(`/videos?${params.toString()}`);
    setVideos(data.data || []);
  };

  const loadChallenges = async () => {
    const data = await adminFetch('/challenges');
    setChallenges(data.data || []);
  };

  const loadAuditLogs = async () => {
    const data = await adminFetch('/audit-logs?limit=80');
    setAuditLogs(data.data || []);
  };

  const loadSettings = async () => {
    const data = await adminFetch('/settings');
    setSettingsRows(data.data || []);
    setSettingsEnv(data.env || null);
    const drafts: Record<string, string> = {};
    editableSettings.forEach((setting) => {
      drafts[setting.key] = data.data?.find((row: any) => row.key === setting.key)?.value || '';
    });
    setSettingDrafts(drafts);
  };

  const loadUnonReport = async () => {
    if (isUnonLoading) return;
    setIsUnonLoading(true);
    setError('');
    try {
      const data = await adminFetch('/unon-report', {}, 10000);
      setUnonReport(data.data || null);
    } catch (err: any) {
      setError(err.message || 'Failed to load UNON report');
    } finally {
      setIsUnonLoading(false);
    }
  };

  const runUnonSync = async () => {
    if (isUnonSyncing) return;
    setIsUnonSyncing(true);
    setError('');
    try {
      const data = await adminFetch('/jobs/unon-sync', { method: 'POST', body: JSON.stringify({}) }, 10000);
      setJobResult(data);
      await loadUnonReport();
    } catch (err: any) {
      setError(err.message || 'Failed to start UNON sync');
    } finally {
      setIsUnonSyncing(false);
    }
  };

  const runUnonResetSync = async () => {
    if (isUnonSyncing) return;
    const ok = window.confirm('Reset the UNON index for the active token address and rebuild it from the configured start block?');
    if (!ok) return;
    setIsUnonSyncing(true);
    setError('');
    try {
      const data = await adminFetch('/jobs/unon-sync', { method: 'POST', body: JSON.stringify({ reset: true }) }, 10000);
      setJobResult(data);
      await loadUnonReport();
    } catch (err: any) {
      setError(err.message || 'Failed to reset UNON index');
    } finally {
      setIsUnonSyncing(false);
    }
  };

  const loadAll = async () => {
    setIsBusy(true);
    setError('');
    try {
      await Promise.all([loadSummary(), loadVideos(), loadChallenges(), loadAuditLogs(), loadSettings()]);
    } catch (err: any) {
      setError(err.message || 'Failed to load admin data');
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    void loadVideos().catch((err) => setError(err.message || 'Failed to load videos'));
  }, [videoStatus]);

  useEffect(() => {
    if (activeTab === 'unon' && !unonReport) {
      void loadUnonReport();
    }
  }, [activeTab]);

  const runJob = async (path: string, body: Record<string, unknown>) => {
    setIsBusy(true);
    setError('');
    try {
      const data = await adminFetch(path, { method: 'POST', body: JSON.stringify(body) });
      setJobResult(data);
      await Promise.all([loadSummary(), loadVideos(), loadAuditLogs()]);
    } catch (err: any) {
      setError(err.message || 'Job failed');
    } finally {
      setIsBusy(false);
    }
  };

  const hideVideo = async (videoId: string) => {
    const reason = window.prompt('Reason for hiding this video:', 'admin_moderation');
    if (reason === null) return;
    await runJob(`/videos/${videoId}/hide`, { reason });
  };

  const restoreVideo = async (videoId: string) => {
    await runJob(`/videos/${videoId}/restore`, {});
  };

  const deleteHiddenVideo = async (videoId: string) => {
    if (!window.confirm('Permanently delete this hidden video? This cannot be undone.')) return;
    setIsBusy(true);
    setError('');
    try {
      await adminFetch(`/videos/${videoId}`, { method: 'DELETE' });
      await Promise.all([loadVideos(), loadChallenges(), loadSummary(), loadAuditLogs()]);
    } catch (err: any) {
      setError(err.message || 'Failed to delete video');
    } finally {
      setIsBusy(false);
    }
  };

  const moveVideo = async (videoId: string) => {
    const challengeId = targetChallengeByVideo[videoId];
    if (!challengeId) {
      setError('Select a target challenge first.');
      return;
    }
    await runJob(`/videos/${videoId}/move`, { challengeId });
  };

  const editChallenge = (challenge: any) => {
    setError('');
    setChallengeEditDraft({
      id: challenge.id,
      title: challenge.title || '',
      hashtags: challenge.hashtags || '',
      region: challenge.region || 'Global',
      isActive: !!challenge.is_active
    });
  };

  const openAddVideo = (challenge: any) => {
    setError('');
    setAddVideoDraft({
      challengeId: challenge.id,
      url: '',
      title: `${challenge.title || 'Challenge'} Shorts`,
      author: 'Admin curated'
    });
  };

  const saveShortsVideo = async (event: FormEvent) => {
    event.preventDefault();
    if (!addVideoDraft) return;
    if (!addVideoDraft.url.trim()) {
      setError('Shorts URL is required.');
      return;
    }

    setIsBusy(true);
    setError('');
    try {
      await adminFetch('/videos/add-url', {
        method: 'POST',
        body: JSON.stringify({
          challengeId: addVideoDraft.challengeId,
          url: addVideoDraft.url.trim(),
          title: addVideoDraft.title.trim(),
          author: addVideoDraft.author.trim()
        })
      });
      setAddVideoDraft(null);
      await Promise.all([loadVideos(), loadChallenges(), loadSummary(), loadAuditLogs()]);
    } catch (err: any) {
      setError(err.message || 'Failed to add Shorts video');
    } finally {
      setIsBusy(false);
    }
  };

  const saveChallengeEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!challengeEditDraft) return;

    const title = challengeEditDraft.title.trim();
    if (!title) {
      setError('Challenge title is required.');
      return;
    }

    setIsBusy(true);
    setError('');
    try {
      await adminFetch(`/challenges/${challengeEditDraft.id}/update`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          hashtags: challengeEditDraft.hashtags.trim(),
          region: challengeEditDraft.region.trim() || 'Global',
          isActive: challengeEditDraft.isActive
        })
      });
      setChallengeEditDraft(null);
      await Promise.all([loadSummary(), loadChallenges(), loadAuditLogs()]);
    } catch (err: any) {
      setError(err.message || 'Failed to update challenge');
    } finally {
      setIsBusy(false);
    }
  };

  const saveSetting = async (key: string) => {
    const setting = editableSettings.find((item) => item.key === key);
    setIsBusy(true);
    setError('');
    try {
      await adminFetch(`/settings/${key}`, {
        method: 'PUT',
        body: JSON.stringify({
          value: settingDrafts[key] || '',
          description: setting?.description || 'Admin setting'
        })
      });
      await Promise.all([loadSettings(), loadAuditLogs()]);
    } catch (err: any) {
      setError(err.message || 'Failed to save setting');
    } finally {
      setIsBusy(false);
    }
  };

  const renderCountBars = (rows: any[] = [], valueLabel = 'items') => {
    const max = Math.max(1, ...rows.map((row) => Number(row.value || row.video_count || 0)));
    if (!rows.length) return <div className="admin-empty-panel">No data yet</div>;

    return (
      <div className="admin-viz-bars">
        {rows.map((row, index) => {
          const value = Number(row.value || row.video_count || 0);
          const label = row.label || row.title || row.region || 'Unknown';
          return (
            <div key={`${label}-${index}`} className="admin-viz-bar-row">
              <div>
                <strong>{label}</strong>
                <span>{formatCompactNumber(value)} {valueLabel}</span>
              </div>
              <div className="admin-viz-track">
                <i
                  style={{
                    width: `${Math.max(4, (value / max) * 100)}%`,
                    background: unonChartColors[index % unonChartColors.length]
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderTimeline = (rows: any[] = [], color = '#67e8f9') => {
    const max = Math.max(1, ...rows.map((row) => Number(row.value || 0)));
    if (!rows.length) return <div className="admin-empty-panel">No timeline data</div>;

    return (
      <div className="admin-viz-timeline">
        {rows.map((row) => {
          const value = Number(row.value || 0);
          return (
            <div key={row.day} className="admin-viz-day">
              <div className="admin-viz-day-bar">
                <i style={{ height: `${Math.max(4, (value / max) * 100)}%`, background: color }} />
              </div>
              <strong>{value}</strong>
              <span>{compactDateLabel(row.day)}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderDonutPanel = (title: string, rows: any[] = []) => {
    const total = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);
    return (
      <div className="admin-viz-card admin-viz-donut-card">
        <div className="admin-viz-card-title">
          <PieChart size={16} />
          <strong>{title}</strong>
        </div>
        <div className="admin-viz-donut-layout">
          <div className="admin-viz-donut" style={{ background: buildCountConicGradient(rows) }}>
            <span>{formatCompactNumber(total)}</span>
          </div>
          <div className="admin-viz-legend">
            {rows.length ? rows.map((row, index) => (
              <div key={`${row.label}-${index}`}>
                <i style={{ background: unonChartColors[index % unonChartColors.length] }} />
                <span>{row.label}</span>
                <strong>{formatCompactNumber(Number(row.value || 0))}</strong>
              </div>
            )) : <span>No data yet</span>}
          </div>
        </div>
      </div>
    );
  };

  const renderDashboard = () => (
    <div className="admin-section">
      <div className="admin-stat-grid">
        <div className="admin-stat">
          <span>Challenges</span>
          <strong>{summary?.challenges?.active ?? '--'}</strong>
          <small>{summary?.emptyChallenges ?? 0} empty</small>
        </div>
        <div className="admin-stat">
          <span>Videos</span>
          <strong>{summary?.videos?.active ?? '--'}</strong>
          <small>{summary?.videos?.hidden ?? 0} hidden</small>
        </div>
        <div className="admin-stat">
          <span>Maintenance</span>
          <strong>{summary?.jobs?.videoMaintenanceEnabled ? 'ON' : 'OFF'}</strong>
          <small>Every {summary?.jobs?.videoMaintenanceIntervalHours ?? 6}h</small>
        </div>
        <div className="admin-stat">
          <span>Integrations</span>
          <strong>{summary?.integrations?.youtubeConfigured ? 'YouTube OK' : 'YouTube OFF'}</strong>
          <small>{summary?.integrations?.apifyConfigured ? 'Apify OK' : 'Apify OFF'}</small>
        </div>
      </div>

      <div className="admin-actions">
        <button onClick={() => runJob('/jobs/video-maintenance', { dryRun: true, limit: 300 })} disabled={isBusy}>
          <Play size={16} /> Dry-run video management
        </button>
        <button onClick={() => runJob('/jobs/video-maintenance', { dryRun: false, limit: 300 })} disabled={isBusy}>
          <Shield size={16} /> Apply video management
        </button>
        <button onClick={() => runJob('/jobs/sync-empty', { limit: 30 })} disabled={isBusy}>
          <RefreshCw size={16} /> Fill empty challenges
        </button>
      </div>

      {jobResult && (
        <pre className="admin-result">{JSON.stringify(jobResult, null, 2)}</pre>
      )}

      <div className="admin-viz-grid">
        <div className="admin-viz-card admin-viz-wide">
          <div className="admin-viz-card-title">
            <BarChart3 size={16} />
            <strong>14-Day Project Activity</strong>
          </div>
          <div className="admin-viz-dual-timeline">
            <div>
              <span>Challenges Created</span>
              {renderTimeline(summary?.visualization?.dailyChallenges || [], '#67e8f9')}
            </div>
            <div>
              <span>Videos Added</span>
              {renderTimeline(summary?.visualization?.dailyVideos || [], '#fbbf24')}
            </div>
          </div>
        </div>

        {renderDonutPanel('Video Platforms', summary?.visualization?.platforms || [])}
        {renderDonutPanel('Challenge Types', summary?.visualization?.challengeTypes || [])}

        <div className="admin-viz-card">
          <div className="admin-viz-card-title">
            <Database size={16} />
            <strong>Regions</strong>
          </div>
          {renderCountBars(summary?.visualization?.regions || [], 'challenges')}
        </div>

        <div className="admin-viz-card">
          <div className="admin-viz-card-title">
            <Activity size={16} />
            <strong>Top Challenges by Videos</strong>
          </div>
          {renderCountBars(summary?.visualization?.topChallenges || [], 'videos')}
        </div>

        <div className="admin-viz-card">
          <div className="admin-viz-card-title">
            <Coins size={16} />
            <strong>Prize Battle Status</strong>
          </div>
          {renderCountBars(summary?.visualization?.prizeStatuses || [], 'battles')}
        </div>
      </div>
    </div>
  );

  const renderVideos = () => (
    <div className="admin-section">
      <div className="admin-toolbar">
        <div className="admin-segment">
          {(['active', 'hidden', 'all'] as const).map((status) => (
            <button key={status} className={videoStatus === status ? 'active' : ''} onClick={() => setVideoStatus(status)}>
              {status}
            </button>
          ))}
        </div>
        <input value={videoQuery} onChange={(event) => setVideoQuery(event.target.value)} placeholder="Search video, author, challenge" />
        <button onClick={loadVideos}><RefreshCw size={15} /></button>
      </div>

      <div className="admin-list">
        {videos.map((video) => (
          <div key={video.id} className="admin-video-row">
            <div>
              <strong>{video.video_title || 'Untitled video'}</strong>
              <span>{video.challenge_title || video.challenge_id} - {video.challenge_region || 'Global'} - {video.platform}</span>
              <a href={video.external_url || video.video_url} target="_blank" rel="noreferrer">{video.video_url}</a>
            </div>
            <select
              value={targetChallengeByVideo[video.id] || ''}
              onChange={(event) => setTargetChallengeByVideo((prev) => ({ ...prev, [video.id]: event.target.value }))}
            >
              <option value="">Move to...</option>
              {challengeOptions.map((challenge) => (
                <option key={challenge.id} value={challenge.id}>{challenge.label}</option>
              ))}
            </select>
            <div className="admin-row-actions">
              <button onClick={() => moveVideo(video.id)}><ArrowRightLeft size={15} /></button>
              {video.is_hidden ? (
                <>
                  <button onClick={() => restoreVideo(video.id)} title="Restore video"><RotateCcw size={15} /></button>
                  {videoStatus === 'hidden' && (
                    <button onClick={() => deleteHiddenVideo(video.id)} title="Delete permanently"><Trash2 size={15} /></button>
                  )}
                </>
              ) : (
                <button onClick={() => hideVideo(video.id)}><EyeOff size={15} /></button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderChallenges = () => (
    <div className="admin-section">
      <div className="admin-list">
        {challenges.map((challenge) => (
          <div key={challenge.id} className="admin-challenge-row">
            <div>
              <strong>{challenge.title}</strong>
              <span>{challenge.region} - {challenge.video_count} videos</span>
              <small>{challenge.hashtags}</small>
            </div>
            <div className="admin-row-actions">
              <button onClick={() => openAddVideo(challenge)}><Plus size={15} /> Shorts</button>
              <button onClick={() => editChallenge(challenge)}><Settings size={15} /> Edit</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSettingControl = (setting: EditableSetting) => (
    <label key={setting.key} className="admin-setting">
      <span>{setting.label}</span>
      <small>{setting.description}</small>
      {setting.multiline ? (
        <textarea
          value={settingDrafts[setting.key] || ''}
          onChange={(event) => setSettingDrafts((prev) => ({ ...prev, [setting.key]: event.target.value }))}
        />
      ) : (
        <input
          value={settingDrafts[setting.key] || ''}
          onChange={(event) => setSettingDrafts((prev) => ({ ...prev, [setting.key]: event.target.value }))}
        />
      )}
      <button onClick={() => saveSetting(setting.key)} disabled={isBusy}>Save</button>
    </label>
  );

  const renderUnon = () => {
    const distribution = unonReport?.distribution || [];
    const categorySummary = unonReport?.categorySummary || [];
    const topHolders = unonReport?.holders?.top || [];
    const movementRows = unonReport?.movement?.byWallet || [];
    const recentTransfers = unonReport?.movement?.recentTransfers || [];
    const tokenomicsPlan = unonReport?.overview?.tokenomicsPlan || [];
    const contractRoles = unonReport?.overview?.contractRoles || [];
    const operatingPolicy = unonReport?.overview?.operatingPolicy || [];
    const onboardingRewards = unonReport?.overview?.onboardingRewards || null;
    const syncStatus = unonReport?.sync || null;
    const maxBalance = Math.max(...distribution.map((row: any) => Number(row.balanceNumber || 0)), 1);
    const maxMovement = Math.max(...movementRows.map((row: any) => Math.max(Number(row.inboundNumber || 0), Number(row.outboundNumber || 0))), 1);
    const maxPlannedAmount = Math.max(...tokenomicsPlan.map((row: any) => Number(row.amount || 0)), 1);
    const donutRows = categorySummary.length > 0 ? categorySummary : distribution.filter((row: any) => Number(row.balanceNumber || 0) > 0);
    const distributionByKey = new Map(distribution.map((row: any) => [row.key, row]));

    return (
      <div className="admin-section">
        <div className="admin-toolbar">
          <div className="admin-unon-token">
            <Coins size={18} />
            <div>
              <strong>{unonReport?.token?.symbol || 'UNON'} Treasury Monitor</strong>
              <span>{unonReport?.token?.address ? shortAddress(unonReport.token.address) : 'World Chain token dashboard'}</span>
            </div>
          </div>
          <button onClick={runUnonSync} disabled={isUnonSyncing}>
            <Database size={15} className={isUnonSyncing ? 'spin' : ''} /> {isUnonSyncing ? 'Starting...' : 'Sync UNON Index'}
          </button>
          <button onClick={runUnonResetSync} disabled={isUnonSyncing}>
            <Database size={15} className={isUnonSyncing ? 'spin' : ''} /> Reset & Sync
          </button>
          <button onClick={loadUnonReport} disabled={isUnonLoading}>
            <RefreshCw size={15} className={isUnonLoading ? 'spin' : ''} /> {isUnonLoading ? 'Refreshing...' : 'Refresh UNON'}
          </button>
        </div>

        {!unonReport ? (
          <div className="admin-empty-panel">
            <Activity size={24} />
            <span>{isUnonLoading ? 'Loading UNON on-chain balances and transfer movement...' : 'Click Refresh UNON to load on-chain data.'}</span>
          </div>
        ) : (
          <>
            <div className="admin-unon-hero">
              <div className="admin-unon-hero-copy">
                <span>{unonReport.network?.label || 'World Chain'} #{unonReport.network?.latestBlock || '-'}</span>
                <h3>{formatTokenAmount(Number(unonReport.token?.totalSupplyNumber || 0))} total supply</h3>
                <p>
                  Indexed blocks {unonReport.network?.scanFromBlock?.toLocaleString?.() || unonReport.network?.scanFromBlock} - {unonReport.network?.scanToBlock?.toLocaleString?.() || unonReport.network?.scanToBlock}
                  {syncStatus?.lagBlocks !== null && syncStatus?.lagBlocks !== undefined ? ` / lag ${formatCompactNumber(Number(syncStatus.lagBlocks))} blocks` : ''}
                </p>
              </div>
                <div className="admin-unon-mini-stats">
                <div>
                  <span>Configured Ops</span>
                  <strong>{formatTokenAmount(Number(unonReport.totals?.trackedNumber || 0))}</strong>
                  <small>{formatPercent(unonReport.totals?.trackedShareOfSupply || 0)} supply</small>
                </div>
                <div>
                  <span>Welcome Claimed</span>
                  <strong>{formatTokenAmount(Number(onboardingRewards?.usedNumber || 0))}</strong>
                  <small>{onboardingRewards?.uniqueRecipientCount || 0} wallets</small>
                </div>
                <div>
                  <span>Claimers Current Balance</span>
                  <strong>{formatTokenAmount(Number(onboardingRewards?.currentHeldByRecipientsNumber || 0))}</strong>
                  <small>All UNON in those wallets / Out {formatTokenAmount(Number(onboardingRewards?.totalOutboundFromRecipientsNumber || 0))}</small>
                </div>
              </div>
            </div>

            <div className="admin-unon-card">
              <div className="admin-unon-card-title">
                <Database size={16} />
                <strong>UNON Index Status</strong>
              </div>
              <div className="admin-unon-facts compact">
                <div><span>Status</span><strong>{syncStatus?.status || 'unknown'}</strong></div>
                <div><span>From Block</span><strong>{syncStatus?.fromBlock?.toLocaleString?.() || syncStatus?.fromBlock || '-'}</strong></div>
                <div><span>Synced Block</span><strong>{syncStatus?.lastSyncedBlock?.toLocaleString?.() || syncStatus?.lastSyncedBlock || '-'}</strong></div>
                <div><span>Latest Block</span><strong>{syncStatus?.latestBlock?.toLocaleString?.() || syncStatus?.latestBlock || '-'}</strong></div>
                <div><span>Lag</span><strong>{syncStatus?.lagBlocks === null || syncStatus?.lagBlocks === undefined ? '-' : formatCompactNumber(Number(syncStatus.lagBlocks))}</strong></div>
                <div><span>Chunk Size</span><strong>{formatCompactNumber(Number(syncStatus?.chunkBlocks || 0))}</strong></div>
              </div>
              {syncStatus?.lastError && <p className="admin-muted-note">Last sync error: {syncStatus.lastError}</p>}
              {unonReport.holders?.scan?.holderCount === 0 && (
                <p className="admin-muted-note">No indexed holders yet. Start UNON index sync and refresh after blocks are processed.</p>
              )}
            </div>

            <div className="admin-unon-grid">
              <div className="admin-unon-card">
                <div className="admin-unon-card-title">
                  <Wallet size={16} />
                  <strong>Top 100 Holders</strong>
                </div>
                <div className="admin-unon-table">
                  {topHolders.length === 0 ? (
                    <div className="admin-empty-panel">No indexed holder data yet. Run Sync UNON Index, then refresh this report.</div>
                  ) : topHolders.map((holder: any, index: number) => (
                    <div key={holder.address} className="admin-unon-transfer">
                      <div>
                        <strong>#{index + 1} {holder.label || holder.worldId || shortAddress(holder.address)}</strong>
                        <span>
                          {holder.category || (holder.worldId ? 'World ID Holder' : 'Holder')} - {holder.address}
                        </span>
                        {holder.worldId && (
                          <small>{holder.isKnownWallet ? 'Linked operator wallet' : 'World ID'}: {holder.worldId}</small>
                        )}
                      </div>
                      <div>
                        <strong>{formatTokenAmount(Number(holder.balanceNumber || 0))}</strong>
                        <small>{formatPercent(holder.shareOfSupply || 0)} supply</small>
                        <small>In {formatTokenAmount(Number(holder.inboundNumber || 0))} / Out {formatTokenAmount(Number(holder.outboundNumber || 0))}</small>
                        <small>Net {formatTokenAmount(Number(holder.netNumber || 0))} / {holder.transferCount || 0} tx</small>
                        {holder.explorerUrl && (
                          <a href={holder.explorerUrl} target="_blank" rel="noreferrer">
                            <ExternalLink size={13} /> Worldscan
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <small className="admin-muted-note">
                  Indexed: block {unonReport.holders?.scan?.fromBlock ?? 0} - {unonReport.holders?.scan?.toBlock ?? '-'} / {unonReport.holders?.scan?.holderCount ?? 0} holders / {unonReport.holders?.scan?.transferEvents ?? 0} Transfer events
                </small>
              </div>

              <div className="admin-unon-card">
                <div className="admin-unon-card-title">
                  <Award size={16} />
                  <strong>Welcome Bonus Flow</strong>
                </div>
                <div className="admin-unon-facts compact">
                  <div><span>Claimed</span><strong>{formatTokenAmount(Number(onboardingRewards?.usedNumber || 0))}</strong></div>
                  <div><span>Recipients</span><strong>{onboardingRewards?.uniqueRecipientCount || 0}</strong></div>
                  <div><span>Migrated Claims</span><strong>{onboardingRewards?.migratedClaimCount || 0}</strong></div>
                  <div><span>Claimers Current Balance</span><strong>{formatTokenAmount(Number(onboardingRewards?.currentHeldByRecipientsNumber || 0))}</strong></div>
                  <div><span>Moved Out</span><strong>{formatTokenAmount(Number(onboardingRewards?.totalOutboundFromRecipientsNumber || 0))}</strong></div>
                </div>
                <div className="admin-unon-table">
                  {onboardingRewards?.recentRecipients?.length ? onboardingRewards.recentRecipients.map((claim: any) => (
                    <div key={`${claim.transactionHash}-${claim.logIndex}`} className="admin-unon-transfer">
                      <div>
                        <strong>Claimed {formatTokenAmount(Number(claim.amountNumber || 0))}</strong>
                        <span>{claim.recipient}</span>
                        {claim.source && <small>{claim.source}</small>}
                        <small>Block {claim.blockNumber}{claim.timestamp ? ` - ${new Date(claim.timestamp).toLocaleString()}` : ''}</small>
                      </div>
                      <div>
                        <strong>Now {formatTokenAmount(Number(claim.currentBalanceNumber || 0))}</strong>
                        <small>In {formatTokenAmount(Number(claim.inboundNumber || 0))} / Out {formatTokenAmount(Number(claim.outboundNumber || 0))}</small>
                        {claim.explorerUrl && (
                          <a href={claim.explorerUrl} target="_blank" rel="noreferrer">
                            <ExternalLink size={13} /> Tx
                          </a>
                        )}
                        {claim.recipientExplorerUrl && (
                          <a href={claim.recipientExplorerUrl} target="_blank" rel="noreferrer">
                            <ExternalLink size={13} /> Wallet
                          </a>
                        )}
                      </div>
                    </div>
                  )) : (
                    <div className="admin-empty-panel">No indexed welcome bonus claims yet.</div>
                  )}
                </div>
                <small className="admin-muted-note">
                  Shows where claimed UNON is now: current balances are read from on-chain balanceOf, movement is from indexed Transfer events.
                </small>
              </div>
            </div>

            <div className="admin-unon-grid">
              <div className="admin-unon-card">
                <div className="admin-unon-card-title">
                  <Coins size={16} />
                  <strong>Token Profile</strong>
                </div>
                <div className="admin-unon-facts">
                  <div><span>Name</span><strong>{unonReport.token?.name || 'U&On'}</strong></div>
                  <div><span>Symbol</span><strong>{unonReport.token?.symbol || 'UNON'}</strong></div>
                  <div><span>Decimals</span><strong>{unonReport.token?.decimals ?? 18}</strong></div>
                  <div><span>Chain ID</span><strong>{unonReport.network?.chainId || 480}</strong></div>
                  <div><span>Indexed Blocks</span><strong>{formatCompactNumber(Number(unonReport.network?.scannedBlocks || 0))} blocks</strong></div>
                  <div><span>Known Ops Wallets</span><strong>{unonReport.config?.trackedWalletsConfigured || 0}</strong></div>
                  <div><span>Welcome Claims</span><strong>{onboardingRewards?.claimedCount ?? '-'}</strong></div>
                  <div><span>Event Claims</span><strong>{onboardingRewards?.eventClaimCount ?? '-'}</strong></div>
                  <div><span>Migrated Claims</span><strong>{onboardingRewards?.migratedClaimCount ?? 0}</strong></div>
                  <div><span>Reward Each</span><strong>{formatTokenAmount(Number(onboardingRewards?.rewardAmountNumber || 100))}</strong></div>
                  <div><span>Reward Used</span><strong>{formatTokenAmount(Number(onboardingRewards?.usedNumber || 0))}</strong></div>
                </div>
                {unonReport.token?.explorerUrl && (
                  <a className="admin-unon-link" href={unonReport.token.explorerUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={13} /> Open token on Worldscan
                  </a>
                )}
              </div>

              <div className="admin-unon-card">
                <div className="admin-unon-card-title">
                  <Settings size={16} />
                  <strong>Operating Policy</strong>
                </div>
                <div className="admin-unon-policy">
                  {operatingPolicy.map((note: string) => (
                    <p key={note}>{note}</p>
                  ))}
                </div>
                <div className="admin-unon-facts compact">
                  <div><span>Creator</span><strong>{unonReport.overview?.settlement?.creatorSharePercent || 95}%</strong></div>
                  <div><span>Treasury</span><strong>{unonReport.overview?.settlement?.treasurySharePercent || 3}%</strong></div>
                  <div><span>Burn</span><strong>{unonReport.overview?.settlement?.burnPercent || 2}%</strong></div>
                </div>
              </div>
            </div>

            <div className="admin-unon-grid">
              <div className="admin-unon-card">
                <div className="admin-unon-card-title">
                  <PieChart size={16} />
                  <strong>Tokenomics Plan</strong>
                </div>
                <div className="admin-unon-bars">
                  {tokenomicsPlan.map((row: any, index: number) => (
                    (() => {
                      const current = distributionByKey.get(row.key) as any;
                      const currentBalance = Number(current?.balanceNumber || 0);
                      const plannedAmount = Number(row.amount || 0);
                      const usedAmount = current ? Math.max(0, plannedAmount - currentBalance) : null;
                      return (
                        <div key={row.key} className="admin-unon-bar-row">
                          <div>
                            <strong>{row.label}</strong>
                            <span>{row.category} - {row.percent}% planned allocation</span>
                          </div>
                          <div className="admin-unon-bar-track">
                            <div
                              style={{
                                width: `${Math.max(2, (plannedAmount / maxPlannedAmount) * 100)}%`,
                                background: unonChartColors[index % unonChartColors.length]
                              }}
                            />
                          </div>
                          <small>
                            Plan {formatTokenAmount(plannedAmount)}
                            {current ? ` / Current ${formatWalletBalance(current)}${current.balanceReadOk === false ? '' : ` / Used ${formatTokenAmount(Number(usedAmount || 0))}`}` : ' / Current not tracked'}
                          </small>
                        </div>
                      );
                    })()
                  ))}
                </div>
              </div>

              <div className="admin-unon-card">
                <div className="admin-unon-card-title">
                  <Database size={16} />
                  <strong>Contract Roles</strong>
                </div>
                <div className="admin-unon-table">
                  {contractRoles.map((contract: any) => (
                    <div key={contract.key} className={`admin-unon-contract ${contract.configured ? '' : 'missing'}`}>
                      <div>
                        <strong>{contract.label}</strong>
                        <span>{contract.role}</span>
                        <small>{contract.configured ? shortAddress(contract.address) : `${contract.envKey} missing`}</small>
                      </div>
                      {contract.explorerUrl && (
                        <a href={contract.explorerUrl} target="_blank" rel="noreferrer">
                          <ExternalLink size={13} /> Worldscan
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="admin-unon-grid">
              <div className="admin-unon-card">
                <div className="admin-unon-card-title">
                  <PieChart size={16} />
                  <strong>Operations Wallet Balances</strong>
                </div>
                <div className="admin-unon-donut-wrap">
                  <div className="admin-unon-donut" style={{ background: buildConicGradient(donutRows) }}>
                    <div>
                      <strong>{formatPercent(unonReport.totals?.trackedShareOfSupply || 0)}</strong>
                      <span>ops wallets</span>
                    </div>
                  </div>
                  <div className="admin-unon-legend">
                    {categorySummary.map((row: any, index: number) => (
                      <div key={row.category}>
                        <i style={{ background: unonChartColors[index % unonChartColors.length] }} />
                        <span>{row.category}</span>
                        <strong>{formatTokenAmount(Number(row.balanceNumber || 0))}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="admin-unon-card">
                <div className="admin-unon-card-title">
                  <BarChart3 size={16} />
                  <strong>Configured Operations Wallets</strong>
                </div>
                <div className="admin-unon-bars">
                  {distribution.map((row: any, index: number) => (
                    <div key={row.key} className={`admin-unon-bar-row ${row.configured ? '' : 'missing'}`}>
                      <div>
                        <strong>{row.label}</strong>
                        <span>{row.category} - {row.configured ? shortAddress(row.address) : `${row.envKey} missing`}</span>
                      </div>
                      <div className="admin-unon-bar-track">
                        <div
                          style={{
                            width: `${Math.max(2, (Number(row.balanceNumber || 0) / maxBalance) * 100)}%`,
                            background: unonChartColors[index % unonChartColors.length]
                          }}
                        />
                      </div>
                      <small>
                        Current {formatWalletBalance(row)}{row.balanceReadOk === false ? '' : ` / ${formatPercent(row.shareOfSupply || 0)}`}
                        {Number(row.plannedAmountNumber || 0) > 0
                          ? ` / Plan ${formatTokenAmount(Number(row.plannedAmountNumber || 0))}${row.balanceReadOk === false ? '' : ` / Released ${formatTokenAmount(Number(row.releasedNumber || 0))}`}`
                          : ''}
                      </small>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="admin-unon-card">
              <div className="admin-unon-card-title">
                <Activity size={16} />
                <strong>Operations Wallet Movement</strong>
              </div>
              <div className="admin-unon-movement">
                {movementRows.map((row: any) => (
                  <div key={row.key} className="admin-unon-movement-row">
                    <div>
                      <strong>{row.label}</strong>
                      <span>{row.transferCount} transfer events - net {formatTokenAmount(Number(row.netNumber || 0))}</span>
                    </div>
                    <div className="admin-unon-flow">
                      <span>In {formatCompactNumber(Number(row.inboundNumber || 0))}</span>
                      <div>
                        <i style={{ width: `${Math.max(2, (Number(row.inboundNumber || 0) / maxMovement) * 100)}%` }} />
                        <b style={{ width: `${Math.max(2, (Number(row.outboundNumber || 0) / maxMovement) * 100)}%` }} />
                      </div>
                      <span>Out {formatCompactNumber(Number(row.outboundNumber || 0))}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="admin-unon-card">
              <div className="admin-unon-card-title">
                <Wallet size={16} />
                <strong>Recent UNON Transfers</strong>
              </div>
              <div className="admin-unon-table">
                {recentTransfers.length === 0 ? (
                  <div className="admin-empty-panel">No indexed configured-wallet transfer events yet.</div>
                ) : recentTransfers.map((transfer: any) => (
                  <div key={`${transfer.transactionHash}-${transfer.logIndex}`} className="admin-unon-transfer">
                    <div>
                      <strong>{formatTokenAmount(Number(transfer.amountNumber || 0))}</strong>
                      <span>
                        {transfer.fromLabel || shortAddress(transfer.from)} {' -> '} {transfer.toLabel || shortAddress(transfer.to)}
                      </span>
                    </div>
                    <div>
                      <small>Block {transfer.blockNumber}{transfer.timestamp ? ` - ${new Date(transfer.timestamp).toLocaleString()}` : ''}</small>
                      {transfer.explorerUrl && (
                        <a href={transfer.explorerUrl} target="_blank" rel="noreferrer">
                          <ExternalLink size={13} /> Worldscan
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {(unonReport.config?.indexedFallbackWallets?.length > 0 || unonReport.config?.readFailedWallets?.length > 0 || unonReport.config?.missingWallets?.length > 0 || unonReport.warnings?.length > 0) && (
              <div className="admin-unon-card warning">
                <div className="admin-unon-card-title">
                  <Shield size={16} />
                  <strong>Configuration Notes</strong>
                </div>
                {unonReport.config?.indexedFallbackWallets?.map((wallet: any) => (
                  <p key={`${wallet.key}-${wallet.address}`}>{wallet.label}: displayed from indexed UNON holder balance because direct RPC balance read was unavailable.</p>
                ))}
                {unonReport.config?.readFailedWallets?.map((wallet: any) => (
                  <p key={`${wallet.key}-${wallet.address}`}>{wallet.label}: UNON balance read failed for {shortAddress(wallet.address)}. {wallet.error}</p>
                ))}
                {unonReport.config?.missingWallets?.map((wallet: any) => (
                  <p key={wallet.key}>{wallet.label}: set <code>{wallet.envKey}</code> in backend .env to track this function.</p>
                ))}
                {unonReport.warnings?.map((warning: string) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderSettings = () => (
    <div className="admin-section">
      <div className="admin-env">
        <div><span>Admin allowlist</span><strong>{settingsEnv?.adminAllowlistConfigured ? 'Configured' : 'Missing'}</strong></div>
        <div><span>YouTube</span><strong>{settingsEnv?.youtubeConfigured ? 'Configured' : 'Missing'}</strong></div>
        <div><span>Apify</span><strong>{settingsEnv?.apifyConfigured ? 'Configured' : 'Missing'}</strong></div>
        <div><span>Maintenance</span><strong>{settingsEnv?.videoMaintenanceEnabled ? 'Enabled' : 'Disabled'}</strong></div>
      </div>

      <div className="admin-setting-group">
        <div className="admin-setting-group-title">
          <strong>Editor's Choice Display</strong>
          <span>Controls the home feed section title, badges, and quick navigation label.</span>
        </div>
        <div className="admin-setting-grid">
          {editorChoiceSettings.map(renderSettingControl)}
        </div>
      </div>

      <div className="admin-setting-group">
        <div className="admin-setting-group-title">
          <strong>Operations Notes</strong>
          <span>Internal notes for moderation and maintenance policy.</span>
        </div>
        <div className="admin-setting-grid">
          {operationsNoteSettings.map(renderSettingControl)}
        </div>
      </div>

      {settingsRows.length > 0 && (
        <pre className="admin-result">{JSON.stringify(settingsRows, null, 2)}</pre>
      )}
    </div>
  );

  const renderAudit = () => (
    <div className="admin-section">
      <div className="admin-list">
        {auditLogs.map((log) => (
          <div key={log.id} className="admin-audit-row">
            <strong>{log.action}</strong>
            <span>{log.entity_type} - {log.entity_id || '-'}</span>
            <small>{log.actor_uid} - {new Date(log.created_at).toLocaleString()}</small>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="admin-overlay">
      <div className="admin-shell">
        <div className="admin-header">
          <div>
            <span><Shield size={16} /> Admin</span>
            <h2>U&On Operations</h2>
          </div>
          <button onClick={onClose}><X size={22} /></button>
        </div>

        {error && <div className="admin-error">{error}</div>}

        <div className="admin-tabs">
          {([
            ['dashboard', Database, 'Status'],
            ['videos', Video, 'Videos'],
            ['challenges', Shield, 'Challenges'],
            ['unon', Coins, 'UNON'],
            ['settings', Settings, 'Settings'],
            ['audit', Trash2, 'Audit'],
          ] as const).map(([tab, Icon, label]) => (
            <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        <div className="admin-body">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'videos' && renderVideos()}
          {activeTab === 'challenges' && renderChallenges()}
          {activeTab === 'unon' && renderUnon()}
          {activeTab === 'settings' && renderSettings()}
          {activeTab === 'audit' && renderAudit()}
        </div>
      </div>

      {challengeEditDraft && (
        <div className="admin-modal-backdrop" onMouseDown={() => setChallengeEditDraft(null)}>
          <form className="admin-edit-modal" onSubmit={saveChallengeEdit} onMouseDown={(event) => event.stopPropagation()}>
            <div className="admin-edit-header">
              <div>
                <span>Challenge</span>
                <h3>Edit challenge</h3>
              </div>
              <button type="button" onClick={() => setChallengeEditDraft(null)} aria-label="Close challenge editor">
                <X size={20} />
              </button>
            </div>

            <label className="admin-edit-field">
              <span>Title</span>
              <input
                value={challengeEditDraft.title}
                onChange={(event) => setChallengeEditDraft((draft) => draft ? { ...draft, title: event.target.value } : draft)}
                autoFocus
              />
            </label>

            <label className="admin-edit-field">
              <span>Hashtags</span>
              <textarea
                value={challengeEditDraft.hashtags}
                onChange={(event) => setChallengeEditDraft((draft) => draft ? { ...draft, hashtags: event.target.value } : draft)}
              />
            </label>

            <label className="admin-edit-field">
              <span>Region</span>
              <input
                value={challengeEditDraft.region}
                onChange={(event) => setChallengeEditDraft((draft) => draft ? { ...draft, region: event.target.value } : draft)}
              />
            </label>

            <label className="admin-edit-toggle">
              <input
                type="checkbox"
                checked={challengeEditDraft.isActive}
                onChange={(event) => setChallengeEditDraft((draft) => draft ? { ...draft, isActive: event.target.checked } : draft)}
              />
              <span>Active challenge</span>
            </label>

            <div className="admin-edit-actions">
              <button type="button" onClick={() => setChallengeEditDraft(null)} disabled={isBusy}>Cancel</button>
              <button type="submit" disabled={isBusy}>Save</button>
            </div>
          </form>
        </div>
      )}

      {addVideoDraft && (
        <div className="admin-modal-backdrop" onMouseDown={() => setAddVideoDraft(null)}>
          <form className="admin-edit-modal" onSubmit={saveShortsVideo} onMouseDown={(event) => event.stopPropagation()}>
            <div className="admin-edit-header">
              <div>
                <span>Video</span>
                <h3>Add Shorts URL</h3>
              </div>
              <button type="button" onClick={() => setAddVideoDraft(null)} aria-label="Close Shorts form">
                <X size={20} />
              </button>
            </div>

            <label className="admin-edit-field">
              <span>YouTube Shorts URL</span>
              <input
                value={addVideoDraft.url}
                onChange={(event) => setAddVideoDraft((draft) => draft ? { ...draft, url: event.target.value } : draft)}
                placeholder="https://www.youtube.com/shorts/..."
                autoFocus
              />
            </label>

            <label className="admin-edit-field">
              <span>Video title</span>
              <input
                value={addVideoDraft.title}
                onChange={(event) => setAddVideoDraft((draft) => draft ? { ...draft, title: event.target.value } : draft)}
              />
            </label>

            <label className="admin-edit-field">
              <span>Author</span>
              <input
                value={addVideoDraft.author}
                onChange={(event) => setAddVideoDraft((draft) => draft ? { ...draft, author: event.target.value } : draft)}
              />
            </label>

            <div className="admin-edit-actions">
              <button type="button" onClick={() => setAddVideoDraft(null)} disabled={isBusy}>Cancel</button>
              <button type="submit" disabled={isBusy}>
                <Link size={15} /> Add video
              </button>
            </div>
          </form>
        </div>
      )}

      <style>{`
        .admin-overlay {
          position: fixed;
          inset: 0;
          z-index: 5000;
          background: rgba(0,0,0,0.78);
          color: #fff;
          display: grid;
          place-items: center;
          padding: 14px;
          overflow: hidden;
        }
        .admin-shell {
          width: min(1120px, calc(100vw - 28px));
          max-width: 100%;
          height: min(860px, 92dvh);
          background: #0b0d12;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          display: grid;
          grid-template-rows: auto auto 1fr;
          position: relative;
          overflow: hidden;
          box-shadow: 0 30px 80px rgba(0,0,0,0.45);
        }
        .admin-header,
        .admin-body,
        .admin-tabs,
        .admin-section {
          min-width: 0;
        }
        .admin-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 18px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .admin-header span {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: #67e8f9;
          font-size: 12px;
          font-weight: 900;
        }
        .admin-header h2 {
          margin: 5px 0 0;
          font-size: 22px;
        }
        .admin-header button,
        .admin-tabs button,
        .admin-actions button,
        .admin-toolbar button,
        .admin-row-actions button,
        .admin-challenge-row button,
        .admin-setting button {
          border: 0;
          border-radius: 8px;
          background: rgba(255,255,255,0.08);
          color: #fff;
          font-weight: 850;
        }
        .admin-header button {
          width: 40px;
          height: 40px;
        }
        .admin-error {
          position: absolute;
          left: 18px;
          right: 18px;
          bottom: 18px;
          z-index: 45;
          margin: 0;
          padding: 10px 12px;
          border-radius: 8px;
          background: rgba(127,29,29,0.94);
          color: #fecaca;
          font-size: 13px;
          border: 1px solid rgba(248,113,113,0.35);
          box-shadow: 0 14px 34px rgba(0,0,0,0.42);
        }
        .admin-tabs {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 12px 18px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .admin-tabs button {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-height: 36px;
          padding: 0 12px;
          flex: 0 0 auto;
          color: rgba(255,255,255,0.62);
        }
        .admin-tabs button.active {
          color: #05050a;
          background: #67e8f9;
        }
        .admin-body {
          overflow: auto;
          padding: 18px;
        }
        .admin-section {
          display: grid;
          gap: 14px;
        }
        .admin-stat-grid,
        .admin-env {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }
        .admin-stat,
        .admin-env div {
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 14px;
          background: rgba(255,255,255,0.04);
        }
        .admin-stat span,
        .admin-env span {
          display: block;
          color: rgba(255,255,255,0.55);
          font-size: 12px;
          font-weight: 900;
        }
        .admin-stat strong,
        .admin-env strong {
          display: block;
          margin-top: 8px;
          font-size: 24px;
        }
        .admin-stat small {
          display: block;
          margin-top: 5px;
          color: rgba(255,255,255,0.42);
        }
        .admin-actions,
        .admin-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }
        .admin-actions button,
        .admin-toolbar button,
        .admin-challenge-row button,
        .admin-setting button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          min-height: 40px;
          padding: 0 12px;
        }
        .admin-actions button {
          flex: 1 1 220px;
        }
        .admin-toolbar button:disabled {
          opacity: 0.62;
          cursor: wait;
        }
        .spin {
          animation: admin-spin 0.8s linear infinite;
        }
        @keyframes admin-spin {
          to {
            transform: rotate(360deg);
          }
        }
        .admin-segment {
          display: flex;
          gap: 6px;
          padding: 4px;
          border-radius: 8px;
          background: rgba(255,255,255,0.05);
        }
        .admin-segment button.active {
          background: #fff;
          color: #05050a;
        }
        .admin-toolbar input,
        .admin-video-row select,
        .admin-setting input,
        .admin-setting textarea {
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          background: rgba(255,255,255,0.06);
          color: #fff;
        }
        .admin-toolbar input {
          min-height: 40px;
          padding: 0 12px;
          flex: 1;
          min-width: 0;
        }
        .admin-list {
          display: grid;
          gap: 10px;
        }
        .admin-video-row,
        .admin-challenge-row,
        .admin-audit-row {
          display: grid;
          gap: 10px;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 12px;
          background: rgba(255,255,255,0.035);
        }
        .admin-video-row {
          grid-template-columns: minmax(0, 1fr) minmax(180px, 280px) auto;
          align-items: center;
        }
        .admin-video-row > div,
        .admin-challenge-row > div,
        .admin-audit-row {
          min-width: 0;
        }
        .admin-challenge-row {
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
        }
        .admin-video-row strong,
        .admin-challenge-row strong,
        .admin-audit-row strong {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .admin-video-row span,
        .admin-challenge-row span,
        .admin-audit-row span {
          display: block;
          margin-top: 4px;
          color: rgba(255,255,255,0.52);
          font-size: 12px;
        }
        .admin-video-row a,
        .admin-challenge-row small,
        .admin-audit-row small {
          display: block;
          margin-top: 4px;
          color: rgba(103,232,249,0.72);
          font-size: 11px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .admin-video-row select {
          min-height: 38px;
          padding: 0 10px;
          width: 100%;
          min-width: 0;
        }
        .admin-row-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }
        .admin-row-actions button {
          width: 38px;
          height: 38px;
        }
        .admin-challenge-row .admin-row-actions button {
          width: auto;
          min-width: 92px;
          padding: 0 12px;
        }
        .admin-result {
          max-height: 320px;
          overflow: auto;
          background: rgba(0,0,0,0.34);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 12px;
          color: #d8f3ff;
          font-size: 11px;
        }
        .admin-viz-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        .admin-viz-card {
          min-width: 0;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 14px;
          background: linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.018));
        }
        .admin-viz-wide {
          grid-column: span 3;
        }
        .admin-viz-card-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 14px;
          color: #67e8f9;
        }
        .admin-viz-card-title strong {
          font-size: 13px;
          font-weight: 950;
        }
        .admin-viz-dual-timeline {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .admin-viz-dual-timeline > div > span {
          display: block;
          margin-bottom: 8px;
          color: rgba(255,255,255,0.58);
          font-size: 11px;
          font-weight: 900;
        }
        .admin-viz-timeline {
          display: grid;
          grid-template-columns: repeat(14, minmax(16px, 1fr));
          align-items: end;
          gap: 5px;
          min-height: 150px;
          padding: 10px 8px 8px;
          border-radius: 8px;
          background: rgba(0,0,0,0.22);
          border: 1px solid rgba(255,255,255,0.055);
        }
        .admin-viz-day {
          display: grid;
          grid-template-rows: 96px auto auto;
          gap: 5px;
          min-width: 0;
          text-align: center;
        }
        .admin-viz-day-bar {
          position: relative;
          align-self: stretch;
          border-radius: 999px;
          background: rgba(255,255,255,0.06);
          overflow: hidden;
        }
        .admin-viz-day-bar i {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          border-radius: inherit;
          box-shadow: 0 0 18px rgba(103,232,249,0.22);
        }
        .admin-viz-day strong {
          color: rgba(255,255,255,0.86);
          font-size: 10px;
          font-weight: 950;
        }
        .admin-viz-day span {
          color: rgba(255,255,255,0.38);
          font-size: 9px;
          font-weight: 800;
          white-space: nowrap;
        }
        .admin-viz-donut-layout {
          display: grid;
          grid-template-columns: 126px minmax(0, 1fr);
          gap: 14px;
          align-items: center;
        }
        .admin-viz-donut {
          width: 126px;
          aspect-ratio: 1;
          border-radius: 50%;
          display: grid;
          place-items: center;
          position: relative;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08), 0 18px 30px rgba(0,0,0,0.2);
        }
        .admin-viz-donut::after {
          content: '';
          position: absolute;
          inset: 25px;
          border-radius: 50%;
          background: #0b0d12;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
        }
        .admin-viz-donut span {
          position: relative;
          z-index: 1;
          color: #fff;
          font-size: 18px;
          font-weight: 950;
        }
        .admin-viz-legend {
          display: grid;
          gap: 8px;
          min-width: 0;
        }
        .admin-viz-legend > div {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 8px;
          color: rgba(255,255,255,0.72);
          font-size: 12px;
          font-weight: 800;
        }
        .admin-viz-legend i {
          width: 9px;
          height: 9px;
          border-radius: 50%;
        }
        .admin-viz-legend span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .admin-viz-legend strong {
          color: #fff;
          font-size: 12px;
        }
        .admin-viz-bars {
          display: grid;
          gap: 10px;
        }
        .admin-viz-bar-row {
          display: grid;
          gap: 7px;
        }
        .admin-viz-bar-row > div:first-child {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          min-width: 0;
        }
        .admin-viz-bar-row strong {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #fff;
          font-size: 12px;
        }
        .admin-viz-bar-row span {
          flex: 0 0 auto;
          color: rgba(255,255,255,0.5);
          font-size: 11px;
          font-weight: 850;
        }
        .admin-viz-track {
          height: 9px;
          border-radius: 999px;
          overflow: hidden;
          background: rgba(255,255,255,0.07);
        }
        .admin-viz-track i {
          display: block;
          height: 100%;
          border-radius: inherit;
          min-width: 4px;
        }
        .admin-setting {
          display: grid;
          gap: 8px;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 12px;
          background: rgba(255,255,255,0.025);
        }
        .admin-setting-group {
          display: grid;
          gap: 12px;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 12px;
          background: rgba(255,255,255,0.025);
        }
        .admin-setting-group-title {
          display: grid;
          gap: 4px;
        }
        .admin-setting-group-title strong {
          font-size: 15px;
        }
        .admin-setting-group-title span {
          color: rgba(255,255,255,0.52);
          font-size: 12px;
          font-weight: 750;
        }
        .admin-setting-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .admin-setting span {
          font-size: 12px;
          font-weight: 900;
          color: #67e8f9;
        }
        .admin-setting small {
          color: rgba(255,255,255,0.44);
          font-size: 11px;
          line-height: 1.35;
        }
        .admin-setting input {
          min-height: 40px;
          padding: 0 10px;
        }
        .admin-setting textarea {
          min-height: 84px;
          resize: vertical;
          padding: 10px;
        }
        .admin-empty-panel {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-height: 110px;
          border: 1px dashed rgba(255,255,255,0.12);
          border-radius: 8px;
          color: rgba(255,255,255,0.58);
          font-size: 13px;
          font-weight: 800;
          text-align: center;
          padding: 16px;
        }
        .admin-unon-token {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          color: #67e8f9;
        }
        .admin-unon-token > div {
          display: grid;
          gap: 2px;
          min-width: 0;
        }
        .admin-unon-token strong {
          color: #fff;
          font-size: 14px;
        }
        .admin-unon-token span {
          color: rgba(255,255,255,0.52);
          font-size: 11px;
          font-weight: 800;
        }
        .admin-unon-hero {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.4fr);
          gap: 12px;
          border: 1px solid rgba(103,232,249,0.16);
          border-radius: 8px;
          padding: 16px;
          background: linear-gradient(135deg, rgba(103,232,249,0.12), rgba(167,139,250,0.08));
        }
        .admin-unon-hero-copy span {
          color: #67e8f9;
          font-size: 12px;
          font-weight: 900;
        }
        .admin-unon-hero-copy h3 {
          margin: 8px 0;
          font-size: 28px;
          line-height: 1.05;
        }
        .admin-unon-hero-copy p {
          margin: 0;
          color: rgba(255,255,255,0.58);
          font-size: 12px;
          font-weight: 750;
        }
        .admin-unon-mini-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }
        .admin-unon-mini-stats div,
        .admin-unon-card {
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          background: rgba(255,255,255,0.035);
        }
        .admin-unon-mini-stats div {
          padding: 12px;
        }
        .admin-unon-mini-stats span,
        .admin-unon-mini-stats small {
          display: block;
          color: rgba(255,255,255,0.52);
          font-size: 11px;
          font-weight: 850;
        }
        .admin-unon-mini-stats strong {
          display: block;
          margin: 7px 0 4px;
          font-size: 18px;
        }
        .admin-unon-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
          gap: 12px;
        }
        .admin-unon-card {
          display: grid;
          gap: 12px;
          padding: 14px;
        }
        .admin-unon-card.warning {
          border-color: rgba(251,191,36,0.22);
          background: rgba(251,191,36,0.06);
        }
        .admin-unon-card.warning p {
          margin: 0;
          color: rgba(255,255,255,0.7);
          font-size: 12px;
          line-height: 1.4;
        }
        .admin-unon-card.warning code {
          color: #fbbf24;
        }
        .admin-unon-card-title {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #67e8f9;
        }
        .admin-unon-card-title strong {
          color: #fff;
          font-size: 14px;
        }
        .admin-unon-facts {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .admin-unon-facts.compact {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .admin-unon-facts div {
          min-width: 0;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 10px;
          background: rgba(255,255,255,0.035);
        }
        .admin-unon-facts span,
        .admin-unon-policy p {
          color: rgba(255,255,255,0.56);
          font-size: 12px;
          line-height: 1.35;
        }
        .admin-unon-facts strong {
          display: block;
          margin-top: 5px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #fff;
          font-size: 14px;
        }
        .admin-unon-policy {
          display: grid;
          gap: 8px;
        }
        .admin-unon-policy p {
          margin: 0;
          padding-left: 10px;
          border-left: 2px solid rgba(103,232,249,0.42);
        }
        .admin-unon-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #67e8f9;
          font-size: 12px;
          font-weight: 850;
          text-decoration: none;
        }
        .admin-unon-donut-wrap {
          display: grid;
          grid-template-columns: 180px minmax(0, 1fr);
          gap: 14px;
          align-items: center;
        }
        .admin-unon-donut {
          width: 180px;
          aspect-ratio: 1;
          border-radius: 50%;
          display: grid;
          place-items: center;
          box-shadow: inset 0 0 28px rgba(0,0,0,0.34);
        }
        .admin-unon-donut > div {
          width: 108px;
          aspect-ratio: 1;
          border-radius: 50%;
          background: #0b0d12;
          display: grid;
          place-items: center;
          align-content: center;
          border: 1px solid rgba(255,255,255,0.08);
        }
        .admin-unon-donut strong {
          font-size: 20px;
        }
        .admin-unon-donut span {
          color: rgba(255,255,255,0.52);
          font-size: 11px;
          font-weight: 850;
        }
        .admin-unon-legend,
        .admin-unon-bars,
        .admin-unon-movement,
        .admin-unon-table {
          display: grid;
          gap: 9px;
          min-width: 0;
        }
        .admin-unon-legend div,
        .admin-unon-bar-row,
        .admin-unon-movement-row,
        .admin-unon-transfer {
          display: grid;
          gap: 7px;
          min-width: 0;
        }
        .admin-unon-legend div {
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          font-size: 12px;
        }
        .admin-unon-legend i {
          width: 9px;
          height: 9px;
          border-radius: 50%;
        }
        .admin-unon-legend span,
        .admin-unon-bar-row span,
        .admin-unon-movement-row span,
        .admin-unon-transfer span,
        .admin-unon-transfer small {
          color: rgba(255,255,255,0.52);
          font-size: 11px;
          font-weight: 750;
        }
        .admin-unon-bar-row {
          padding: 10px;
          border-radius: 8px;
          background: rgba(255,255,255,0.04);
        }
        .admin-unon-bar-row.missing {
          opacity: 0.62;
        }
        .admin-unon-bar-row strong,
        .admin-unon-movement-row strong,
        .admin-unon-transfer strong {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .admin-unon-bar-track,
        .admin-unon-flow div {
          height: 8px;
          border-radius: 999px;
          background: rgba(255,255,255,0.08);
          overflow: hidden;
        }
        .admin-unon-bar-track div {
          height: 100%;
          border-radius: inherit;
        }
        .admin-unon-movement-row {
          grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
          align-items: center;
          padding: 10px;
          border-radius: 8px;
          background: rgba(255,255,255,0.04);
        }
        .admin-unon-flow {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          gap: 8px;
          align-items: center;
        }
        .admin-unon-flow div {
          position: relative;
          display: flex;
        }
        .admin-unon-flow i,
        .admin-unon-flow b {
          height: 100%;
          display: block;
          border-radius: 999px;
        }
        .admin-unon-flow i {
          background: #34d399;
        }
        .admin-unon-flow b {
          background: #fb7185;
          margin-left: 2px;
        }
        .admin-unon-transfer {
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          padding: 10px;
          border-radius: 8px;
          background: rgba(255,255,255,0.04);
        }
        .admin-muted-note {
          display: block;
          margin-top: 10px;
          color: rgba(255,255,255,0.5);
          font-size: 11px;
          font-weight: 750;
          line-height: 1.45;
        }
        .admin-unon-contract {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 10px;
          align-items: start;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 11px;
          background: rgba(255,255,255,0.035);
          min-width: 0;
          max-width: 100%;
          overflow: hidden;
        }
        .admin-unon-contract.missing {
          border-color: rgba(251,191,36,0.22);
          background: rgba(251,191,36,0.055);
        }
        .admin-unon-contract strong,
        .admin-unon-contract span,
        .admin-unon-contract small {
          display: block;
          min-width: 0;
          max-width: 100%;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .admin-unon-contract strong {
          color: #fff;
          line-height: 1.25;
        }
        .admin-unon-contract span {
          margin-top: 4px;
          color: rgba(255,255,255,0.56);
          font-size: 12px;
          line-height: 1.35;
        }
        .admin-unon-contract small {
          margin-top: 4px;
          color: rgba(103,232,249,0.72);
          font-size: 11px;
          line-height: 1.35;
        }
        .admin-unon-contract a,
        .admin-unon-transfer a {
          display: inline-flex;
          align-items: center;
          justify-content: flex-start;
          gap: 5px;
          margin-top: 5px;
          color: #67e8f9;
          font-size: 11px;
          font-weight: 850;
          text-decoration: none;
          min-width: 0;
          max-width: 100%;
          width: fit-content;
        }
        .admin-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 5100;
          display: grid;
          place-items: center;
          padding: 16px;
          background: rgba(0,0,0,0.66);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .admin-edit-modal {
          width: min(460px, 100%);
          max-height: min(720px, calc(100dvh - 32px));
          overflow: auto;
          display: grid;
          gap: 14px;
          padding: 18px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.12);
          background: #10131a;
          color: #fff;
          box-shadow: 0 30px 80px rgba(0,0,0,0.55);
        }
        .admin-edit-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .admin-edit-header span {
          color: #67e8f9;
          font-size: 12px;
          font-weight: 900;
        }
        .admin-edit-header h3 {
          margin: 4px 0 0;
          font-size: 20px;
        }
        .admin-edit-header button {
          width: 38px;
          height: 38px;
          border: 0;
          border-radius: 8px;
          background: rgba(255,255,255,0.08);
          color: #fff;
        }
        .admin-edit-field {
          display: grid;
          gap: 7px;
        }
        .admin-edit-field span,
        .admin-edit-toggle span {
          color: rgba(255,255,255,0.68);
          font-size: 12px;
          font-weight: 850;
        }
        .admin-edit-field input,
        .admin-edit-field textarea {
          width: 100%;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 8px;
          background: rgba(255,255,255,0.07);
          color: #fff;
          outline: 0;
          padding: 11px 12px;
        }
        .admin-edit-field textarea {
          min-height: 92px;
          resize: vertical;
        }
        .admin-edit-toggle {
          display: inline-flex;
          align-items: center;
          gap: 9px;
        }
        .admin-edit-toggle input {
          width: 18px;
          height: 18px;
          accent-color: #67e8f9;
        }
        .admin-edit-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .admin-edit-actions button {
          min-height: 42px;
          border: 0;
          border-radius: 8px;
          font-weight: 900;
        }
        .admin-edit-actions button:first-child {
          background: rgba(255,255,255,0.1);
          color: #fff;
        }
        .admin-edit-actions button:last-child {
          background: #67e8f9;
          color: #05050a;
        }
        @media (max-width: 760px) {
          .admin-overlay {
            padding: 0;
            place-items: stretch;
          }
          .admin-shell {
            width: 100%;
            height: 100dvh;
            border-radius: 0;
            border-left: 0;
            border-right: 0;
          }
          .admin-header {
            padding: calc(14px + env(safe-area-inset-top, 0px)) 14px 12px;
          }
          .admin-header h2 {
            font-size: 18px;
          }
          .admin-header button {
            width: 38px;
            height: 38px;
            flex: 0 0 38px;
          }
          .admin-error {
            left: 12px;
            right: 12px;
            bottom: calc(12px + env(safe-area-inset-bottom, 0px));
          }
          .admin-tabs {
            padding: 10px 12px;
          }
          .admin-tabs button {
            min-width: 92px;
            padding: 0 10px;
          }
          .admin-body {
            padding: 12px 12px calc(16px + env(safe-area-inset-bottom, 0px));
          }
          .admin-stat-grid,
          .admin-env,
          .admin-video-row,
          .admin-challenge-row,
          .admin-unon-hero,
          .admin-unon-grid,
          .admin-unon-facts,
          .admin-unon-facts.compact,
          .admin-unon-mini-stats,
          .admin-unon-donut-wrap,
          .admin-unon-movement-row,
          .admin-unon-transfer,
          .admin-unon-contract {
            grid-template-columns: 1fr;
          }
          .admin-viz-grid,
          .admin-viz-dual-timeline,
          .admin-viz-donut-layout {
            grid-template-columns: 1fr;
          }
          .admin-viz-wide {
            grid-column: auto;
          }
          .admin-viz-timeline {
            grid-template-columns: repeat(7, minmax(0, 1fr));
            overflow-x: auto;
          }
          .admin-viz-day {
            grid-template-rows: 80px auto auto;
          }
          .admin-viz-donut {
            justify-self: center;
          }
          .admin-actions,
          .admin-toolbar,
          .admin-setting-grid {
            display: grid;
            grid-template-columns: 1fr;
          }
          .admin-actions button,
          .admin-toolbar button,
          .admin-setting button {
            width: 100%;
          }
          .admin-segment {
            width: 100%;
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .admin-row-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
          }
          .admin-row-actions button {
            width: 100%;
          }
          .admin-result {
            max-height: 220px;
          }
          .admin-unon-hero-copy h3 {
            font-size: 22px;
          }
          .admin-unon-donut {
            width: min(180px, 70vw);
            justify-self: center;
          }
          .admin-unon-flow {
            grid-template-columns: 1fr;
          }
          .admin-unon-transfer a,
          .admin-unon-contract a {
            justify-content: flex-start;
          }
          .admin-modal-backdrop {
            align-items: end;
            padding: 0;
          }
          .admin-edit-modal {
            width: 100%;
            max-height: calc(100dvh - env(safe-area-inset-top, 0px) - 20px);
            border-radius: 12px 12px 0 0;
            padding: 16px 14px calc(18px + env(safe-area-inset-bottom, 0px));
            border-left: 0;
            border-right: 0;
            border-bottom: 0;
          }
        }
      `}</style>
    </div>
  );
}
