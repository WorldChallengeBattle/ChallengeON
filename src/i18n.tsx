import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ko', label: '한국어' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文（台灣）' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'pl', label: 'Polski' },
  { code: 'ca', label: 'Català' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'ms', label: 'Bahasa Melayu' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'th', label: 'ไทย' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'ru', label: 'Русский' },
] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code'];

const en = {
  browseChallenges: 'Browse challenges', allChallenges: 'Explore', saved: 'Saved', save: 'Save challenge', unsave: 'Remove saved challenge',
  platform: 'Platform', allPlatforms: 'All platforms', sortChallenges: 'Sort challenges', popular: 'Popular', recent: 'Recently updated', mostVideos: 'Most videos',
  refresh: 'Refresh', resultCount: '{count} challenges', noResults: 'No matching challenges', resetFilters: 'Reset filters',
  feedError: 'Challenges could not be refreshed. Please try again.', retry: 'Try again', videoError: 'Videos could not be loaded.', loadingVideos: 'Loading videos...', noVideos: 'No videos yet',
  joinChallenge: 'Join challenge', autoplay: 'Autoplay videos', startMuted: 'Start muted', playbackSettings: 'Playback', close: 'Close',
  rankingError: 'Ranking could not be loaded. Please try again.',
  search: 'Search challenges...',
  openProfile: 'Open profile',
  selectLanguage: 'Select language',
  navTrend: 'Trend ON',
  navBattle: 'Battle ON',
  navCreate: 'Create',
  navNow: 'Now ON',
  navRanking: 'Ranking',
  trendKicker: 'AI-curated daily trends',
  trendSummary: 'Fresh global trends selected for people who want to watch, learn, and join fast.',
  trendEmpty: 'No Trend ON challenges are ready yet.',
  battleKicker: 'Creator entries and Platinum challenges',
  battleSummary: 'A shared space for creator videos, praise, support, rankings, and Platinum+ prize challenges.',
  battleEmpty: 'No Battle ON challenges are open yet.',
  nowKicker: 'Official missions',
  nowSummary: 'Share positive-action videos and help good deeds spread around the world.',
  nowEmpty: 'No Now ON missions are open yet.',
  sayHello: 'Say Hello',
  welcomeBonus: 'Welcome Bonus',
  welcomeBonusBody: 'Claim 100 UNON until 2026-12-31',
  sayHelloBody: 'Upload a greeting video and claim 2 UNON',
  goldHeart: 'Gold Heart',
  goldHeartBody: 'Support creators with UNON or WLD',
  rankingBody: 'Check monthly donation standings',
  rankingKicker: 'Donation leaderboard',
  rankingSummary: 'UNON and WLD Gold Heart support, grouped by month, quarter, and year.',
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
  supports: 'supports',
  rankingEmpty: 'No donation ranking data for this period yet.',
  authTitle: 'Authenticating in World App',
  authBody: 'World ID verification starts automatically. Creation unlocks when authentication finishes.',
  authOutside: 'If you opened this outside World App, return to the mini app and launch it there.',
  createTitle: 'Create Your Challenge',
  createSummary: 'Add a title, hashtags, and region to start a positive global movement.',
  standard: 'Standard',
  prize: 'Prize UNON',
  arenaName: 'CHALLENGE NAME',
  arenaPlaceholder: 'e.g. Share a Kind Moment',
  mainHashtag: 'MAIN HASHTAG',
  territory: 'REGION',
  ignite: 'CREATE CHALLENGE',
  creating: 'CREATING...',
  uploadTitle: 'Select Saved Video',
  uploadWarning: 'Do not choose the camera on the next screen.',
  uploadHelp: 'Choose Gallery, Files, Photos, or a saved video file to upload an existing video.',
  continueFile: 'Continue to file selection',
  cancel: 'Cancel',
  closeUpload: 'Close upload guidance',
  settings: 'Settings',
  profileVisibility: 'Profile Visibility',
  profileVisibilityBody: 'Your stats are visible to everyone on the leaderboard.',
  territoryPreference: 'Region Preference',
  optimizedFor: 'Currently optimized for {region}.',
} as const;

type TranslationKey = keyof typeof en;
type TranslationSet = Partial<Record<TranslationKey, string>>;

const translations: Record<AppLanguage, TranslationSet> = {
  en,
  ko: {
    browseChallenges: '챌린지 탐색', allChallenges: '둘러보기', saved: '저장됨', save: '챌린지 저장', unsave: '저장 해제',
    platform: '플랫폼', allPlatforms: '모든 플랫폼', sortChallenges: '챌린지 정렬', popular: '인기순', recent: '최근 업데이트순', mostVideos: '영상 많은순',
    refresh: '새로고침', resultCount: '챌린지 {count}개', noResults: '조건에 맞는 챌린지가 없습니다', resetFilters: '필터 초기화',
    feedError: '챌린지를 불러오지 못했습니다. 다시 시도해 주세요.', retry: '다시 시도', videoError: '영상을 불러오지 못했습니다.', loadingVideos: '영상 불러오는 중...', noVideos: '아직 영상이 없습니다',
    joinChallenge: '챌린지 참여', autoplay: '영상 자동 재생', startMuted: '음소거로 시작', playbackSettings: '재생', close: '닫기',
    rankingError: '랭킹을 불러오지 못했습니다. 다시 시도해 주세요.',
    search: '챌린지 검색...', openProfile: '프로필 열기', selectLanguage: '언어 선택', navCreate: '만들기', navRanking: '랭킹',
    trendKicker: 'AI가 선별한 오늘의 트렌드', trendSummary: '보고 배우고 빠르게 참여할 수 있는 새로운 글로벌 트렌드를 만나보세요.', trendEmpty: '준비된 Trend ON 챌린지가 없습니다.',
    battleKicker: '크리에이터 영상과 플래티넘 챌린지', battleSummary: '선행 영상, 칭찬, 후원, 랭킹과 Platinum+ 상금 챌린지가 함께하는 공간입니다.', battleEmpty: '진행 중인 Battle ON 챌린지가 없습니다.',
    nowKicker: '공식 미션', nowSummary: '다양한 선행 영상을 공유하고 좋은 행동이 전 세계로 퍼지게 해주세요.', nowEmpty: '진행 중인 Now ON 미션이 없습니다.',
    sayHello: '인사하기', welcomeBonus: '환영 보너스', welcomeBonusBody: '2026-12-31까지 100 UNON 받기', sayHelloBody: '인사 영상을 올리고 2 UNON 받기', goldHeart: '골드 하트', goldHeartBody: 'UNON 또는 WLD로 크리에이터 응원하기', rankingBody: '월간 후원 순위 확인하기',
    rankingKicker: '후원 리더보드', rankingSummary: 'UNON과 WLD 골드 하트 후원을 월·분기·연도별로 확인합니다.', month: '월', quarter: '분기', year: '연도', supports: '회 응원', rankingEmpty: '이 기간의 후원 순위 데이터가 없습니다.',
    authTitle: 'World App에서 인증 중', authBody: 'World ID 인증이 자동으로 시작됩니다. 인증이 완료되면 만들기 기능이 열립니다.', authOutside: 'World App 밖에서 열었다면 Mini App으로 돌아가 다시 실행해주세요.',
    createTitle: '챌린지 만들기', createSummary: '제목, 해시태그, 지역을 정해 긍정적인 글로벌 움직임을 시작하세요.', standard: '일반', prize: 'UNON 상금', arenaName: '챌린지 이름', arenaPlaceholder: '예: 친절한 순간 나누기', mainHashtag: '대표 해시태그', territory: '지역', ignite: '챌린지 만들기', creating: '만드는 중...',
    uploadTitle: '저장된 영상 선택', uploadWarning: '다음 화면에서 카메라는 선택하지 마세요.', uploadHelp: '갤러리, 파일, 사진 앱 또는 저장된 동영상 파일을 선택해주세요.', continueFile: '파일 선택 계속', cancel: '취소', closeUpload: '업로드 안내 닫기',
    settings: '설정', profileVisibility: '프로필 공개', profileVisibilityBody: '내 활동 통계가 리더보드에 공개됩니다.', territoryPreference: '지역 설정', optimizedFor: '현재 {region}에 맞춰져 있습니다.',
  },
  es: {
    search: 'Buscar desafíos...', openProfile: 'Abrir perfil', selectLanguage: 'Seleccionar idioma', navCreate: 'Crear', navRanking: 'Clasificación',
    trendKicker: 'Tendencias diarias elegidas por IA', trendSummary: 'Nuevas tendencias globales para mirar, aprender y participar rápidamente.', trendEmpty: 'Aún no hay desafíos de Trend ON.',
    battleKicker: 'Videos de creadores y desafíos Platinum', battleSummary: 'Un espacio para videos solidarios, elogios, apoyo, clasificaciones y premios Platinum+.', battleEmpty: 'No hay desafíos de Battle ON abiertos.',
    nowKicker: 'Misiones oficiales', nowSummary: 'Comparte videos de buenas acciones y ayuda a difundirlas por el mundo.', nowEmpty: 'No hay misiones de Now ON abiertas.',
    sayHello: 'Saludar', welcomeBonus: 'Bono de bienvenida', welcomeBonusBody: 'Obtén 100 UNON hasta el 31-12-2026', sayHelloBody: 'Sube un saludo y obtén 2 UNON', goldHeart: 'Corazón dorado', goldHeartBody: 'Apoya con UNON o WLD', rankingBody: 'Consulta la clasificación mensual',
    rankingKicker: 'Clasificación de apoyo', rankingSummary: 'Apoyo con UNON y WLD por mes, trimestre y año.', month: 'Mes', quarter: 'Trimestre', year: 'Año', supports: 'apoyos', rankingEmpty: 'No hay datos para este periodo.',
    authTitle: 'Autenticando en World App', authBody: 'La verificación de World ID comienza automáticamente. Crear se habilitará al finalizar.', authOutside: 'Si abriste esto fuera de World App, vuelve a la Mini App.',
    createTitle: 'Crea tu desafío', createSummary: 'Añade título, etiquetas y región para iniciar un movimiento positivo.', standard: 'Estándar', prize: 'Premio UNON', arenaName: 'NOMBRE DEL DESAFÍO', arenaPlaceholder: 'Ej.: Comparte un acto amable', mainHashtag: 'ETIQUETA PRINCIPAL', territory: 'REGIÓN', ignite: 'CREAR DESAFÍO', creating: 'CREANDO...',
    uploadTitle: 'Seleccionar video guardado', uploadWarning: 'No elijas la cámara en la siguiente pantalla.', uploadHelp: 'Elige Galería, Archivos, Fotos o un video guardado.', continueFile: 'Continuar a archivos', cancel: 'Cancelar', closeUpload: 'Cerrar instrucciones',
    settings: 'Ajustes', profileVisibility: 'Visibilidad del perfil', profileVisibilityBody: 'Tus estadísticas son visibles en la clasificación.', territoryPreference: 'Región preferida', optimizedFor: 'Optimizado para {region}.',
  },
  pt: {
    search: 'Buscar desafios...', openProfile: 'Abrir perfil', selectLanguage: 'Selecionar idioma', navCreate: 'Criar', navRanking: 'Ranking',
    trendKicker: 'Tendências diárias escolhidas por IA', trendSummary: 'Novas tendências globais para assistir, aprender e participar rapidamente.', trendEmpty: 'Ainda não há desafios Trend ON.',
    battleKicker: 'Vídeos de criadores e desafios Platinum', battleSummary: 'Um espaço para vídeos de boas ações, elogios, apoio, ranking e prêmios Platinum+.', battleEmpty: 'Não há desafios Battle ON abertos.',
    nowKicker: 'Missões oficiais', nowSummary: 'Compartilhe vídeos de boas ações e ajude o bem a se espalhar pelo mundo.', nowEmpty: 'Não há missões Now ON abertas.',
    sayHello: 'Dizer olá', welcomeBonus: 'Bônus de boas-vindas', welcomeBonusBody: 'Receba 100 UNON até 31/12/2026', sayHelloBody: 'Envie uma saudação e receba 2 UNON', goldHeart: 'Coração dourado', goldHeartBody: 'Apoie com UNON ou WLD', rankingBody: 'Veja o ranking mensal',
    rankingKicker: 'Ranking de apoio', rankingSummary: 'Apoio com UNON e WLD por mês, trimestre e ano.', month: 'Mês', quarter: 'Trimestre', year: 'Ano', supports: 'apoios', rankingEmpty: 'Sem dados para este período.',
    authTitle: 'Autenticando no World App', authBody: 'A verificação World ID começa automaticamente. A criação será liberada ao terminar.', authOutside: 'Se abriu fora do World App, volte à Mini App.',
    createTitle: 'Crie seu desafio', createSummary: 'Adicione título, hashtags e região para iniciar um movimento positivo.', standard: 'Padrão', prize: 'Prêmio UNON', arenaName: 'NOME DO DESAFIO', arenaPlaceholder: 'Ex.: Compartilhe um gesto gentil', mainHashtag: 'HASHTAG PRINCIPAL', territory: 'REGIÃO', ignite: 'CRIAR DESAFIO', creating: 'CRIANDO...',
    uploadTitle: 'Selecionar vídeo salvo', uploadWarning: 'Não escolha a câmera na próxima tela.', uploadHelp: 'Escolha Galeria, Arquivos, Fotos ou um vídeo salvo.', continueFile: 'Continuar para arquivos', cancel: 'Cancelar', closeUpload: 'Fechar instruções',
    settings: 'Configurações', profileVisibility: 'Visibilidade do perfil', profileVisibilityBody: 'Suas estatísticas ficam visíveis no ranking.', territoryPreference: 'Região preferida', optimizedFor: 'Otimizado para {region}.',
  },
  ja: {
    search: 'チャレンジを検索...', openProfile: 'プロフィールを開く', selectLanguage: '言語を選択', navCreate: '作成', navRanking: 'ランキング',
    trendKicker: 'AIが選ぶデイリートレンド', trendSummary: '見て、学んで、すぐ参加できる世界の新しいトレンドです。', trendEmpty: 'Trend ONチャレンジはまだありません。',
    battleKicker: 'クリエイター動画とPlatinumチャレンジ', battleSummary: '善行動画、称賛、支援、ランキング、Platinum+賞金チャレンジの場です。', battleEmpty: '開催中のBattle ONはありません。',
    nowKicker: '公式ミッション', nowSummary: '善行の動画を共有し、良い行動を世界に広げましょう。', nowEmpty: '開催中のNow ONミッションはありません。',
    sayHello: 'あいさつする', welcomeBonus: 'ウェルカムボーナス', welcomeBonusBody: '2026年12月31日まで100 UNONを受け取る', sayHelloBody: 'あいさつ動画で2 UNONを受け取る', goldHeart: 'ゴールドハート', goldHeartBody: 'UNONまたはWLDで応援', rankingBody: '月間支援ランキングを見る',
    rankingKicker: '支援ランキング', rankingSummary: 'UNONとWLDの支援を月・四半期・年別に表示します。', month: '月', quarter: '四半期', year: '年', supports: '回の支援', rankingEmpty: 'この期間のデータはありません。',
    authTitle: 'World Appで認証中', authBody: 'World ID認証が自動で始まります。完了すると作成できます。', authOutside: 'World App外で開いた場合はMini Appに戻ってください。',
    createTitle: 'チャレンジを作成', createSummary: 'タイトル、ハッシュタグ、地域を設定して前向きな動きを始めましょう。', standard: '通常', prize: 'UNON賞金', arenaName: 'チャレンジ名', arenaPlaceholder: '例：親切な瞬間を共有', mainHashtag: 'メインハッシュタグ', territory: '地域', ignite: 'チャレンジを作成', creating: '作成中...',
    uploadTitle: '保存済み動画を選択', uploadWarning: '次の画面でカメラを選ばないでください。', uploadHelp: 'ギャラリー、ファイル、写真、または保存済み動画を選択してください。', continueFile: 'ファイル選択へ', cancel: 'キャンセル', closeUpload: '案内を閉じる',
    settings: '設定', profileVisibility: 'プロフィール公開', profileVisibilityBody: '統計はランキングで公開されます。', territoryPreference: '地域設定', optimizedFor: '現在{region}向けです。',
  },
  zh: {
    search: '搜索挑战...', openProfile: '打开个人资料', selectLanguage: '选择语言', navCreate: '创建', navRanking: '排名',
    trendKicker: 'AI精选每日趋势', trendSummary: '发现可快速观看、学习和参与的全球新趋势。', trendEmpty: '暂时没有Trend ON挑战。',
    battleKicker: '创作者视频与Platinum挑战', battleSummary: '善行视频、赞美、支持、排名和Platinum+奖励挑战的共享空间。', battleEmpty: '暂时没有开放的Battle ON挑战。',
    nowKicker: '官方任务', nowSummary: '分享善行视频，让美好行动传播到世界各地。', nowEmpty: '暂时没有开放的Now ON任务。',
    sayHello: '打个招呼', welcomeBonus: '欢迎奖励', welcomeBonusBody: '在2026-12-31前领取100 UNON', sayHelloBody: '上传问候视频并领取2 UNON', goldHeart: '金色爱心', goldHeartBody: '使用UNON或WLD支持创作者', rankingBody: '查看每月支持排名',
    rankingKicker: '支持排行榜', rankingSummary: '按月、季度和年度查看UNON与WLD支持。', month: '月', quarter: '季度', year: '年', supports: '次支持', rankingEmpty: '该时段暂无排名数据。',
    authTitle: '正在World App中认证', authBody: 'World ID认证会自动开始，完成后即可创建。', authOutside: '如果在World App外打开，请返回Mini App。',
    createTitle: '创建挑战', createSummary: '添加标题、标签和地区，发起积极的全球行动。', standard: '标准', prize: 'UNON奖励', arenaName: '挑战名称', arenaPlaceholder: '例如：分享善意时刻', mainHashtag: '主标签', territory: '地区', ignite: '创建挑战', creating: '创建中...',
    uploadTitle: '选择已保存的视频', uploadWarning: '请勿在下一屏选择相机。', uploadHelp: '请选择相册、文件、照片或已保存的视频。', continueFile: '继续选择文件', cancel: '取消', closeUpload: '关闭上传说明',
    settings: '设置', profileVisibility: '个人资料可见性', profileVisibilityBody: '你的统计数据会显示在排行榜上。', territoryPreference: '地区偏好', optimizedFor: '当前针对{region}优化。',
  },
  'zh-TW': {
    search: '搜尋挑戰...', openProfile: '開啟個人檔案', selectLanguage: '選擇語言', navCreate: '建立', navRanking: '排名',
    trendKicker: 'AI 精選每日趨勢', trendSummary: '探索能快速觀看、學習並參與的全球新趨勢。', trendEmpty: '目前還沒有 Trend ON 挑戰。',
    battleKicker: '創作者影片與 Platinum 挑戰', battleSummary: '匯集善行影片、讚美、支持、排名與 Platinum+ 獎勵挑戰的空間。', battleEmpty: '目前沒有開放的 Battle ON 挑戰。',
    nowKicker: '官方任務', nowSummary: '分享善行影片，讓美好的行動傳遍世界。', nowEmpty: '目前沒有開放的 Now ON 任務。',
    sayHello: '打聲招呼', welcomeBonus: '迎新獎勵', welcomeBonusBody: '於 2026-12-31 前領取 100 UNON', sayHelloBody: '上傳問候影片並領取 2 UNON', goldHeart: '金色愛心', goldHeartBody: '使用 UNON 或 WLD 支持創作者', rankingBody: '查看每月支持排名',
    rankingKicker: '支持排行榜', rankingSummary: '按月、季與年度查看 UNON 和 WLD 支持。', month: '月', quarter: '季', year: '年', supports: '次支持', rankingEmpty: '此期間尚無排名資料。',
    authTitle: '正在 World App 中驗證', authBody: 'World ID 驗證會自動開始，完成後即可建立挑戰。', authOutside: '若在 World App 外開啟，請返回 Mini App。',
    createTitle: '建立挑戰', createSummary: '加入標題、主題標籤與地區，發起正向的全球行動。', standard: '一般', prize: 'UNON 獎勵', arenaName: '挑戰名稱', arenaPlaceholder: '例如：分享一個善意時刻', mainHashtag: '主要主題標籤', territory: '地區', ignite: '建立挑戰', creating: '建立中...',
    uploadTitle: '選擇已儲存的影片', uploadWarning: '請勿在下一個畫面選擇相機。', uploadHelp: '請選擇圖庫、檔案、照片或已儲存的影片。', continueFile: '繼續選擇檔案', cancel: '取消', closeUpload: '關閉上傳說明',
    settings: '設定', profileVisibility: '個人檔案可見度', profileVisibilityBody: '你的統計資料會顯示在排行榜上。', territoryPreference: '偏好地區', optimizedFor: '目前已針對 {region} 最佳化。',
  },
  fr: {
    search: 'Rechercher des défis...', openProfile: 'Ouvrir le profil', selectLanguage: 'Choisir la langue', navCreate: 'Créer', navRanking: 'Classement',
    trendKicker: 'Tendances quotidiennes choisies par IA', trendSummary: 'De nouvelles tendances mondiales à regarder, apprendre et rejoindre rapidement.', trendEmpty: 'Aucun défi Trend ON pour le moment.',
    battleKicker: 'Vidéos de créateurs et défis Platinum', battleSummary: 'Un espace pour les bonnes actions, compliments, soutiens, classements et prix Platinum+.', battleEmpty: 'Aucun défi Battle ON ouvert.',
    nowKicker: 'Missions officielles', nowSummary: 'Partagez des vidéos de bonnes actions et diffusez le bien dans le monde.', nowEmpty: 'Aucune mission Now ON ouverte.',
    sayHello: 'Dire bonjour', welcomeBonus: 'Bonus de bienvenue', welcomeBonusBody: 'Recevez 100 UNON avant le 31/12/2026', sayHelloBody: 'Publiez un salut et recevez 2 UNON', goldHeart: 'Cœur doré', goldHeartBody: 'Soutenez avec UNON ou WLD', rankingBody: 'Voir le classement mensuel',
    rankingKicker: 'Classement des soutiens', rankingSummary: 'Soutiens UNON et WLD par mois, trimestre et année.', month: 'Mois', quarter: 'Trimestre', year: 'Année', supports: 'soutiens', rankingEmpty: 'Aucune donnée pour cette période.',
    authTitle: 'Authentification dans World App', authBody: 'La vérification World ID démarre automatiquement. La création sera disponible ensuite.', authOutside: 'Si vous êtes hors de World App, revenez à la Mini App.',
    createTitle: 'Créer votre défi', createSummary: 'Ajoutez un titre, des hashtags et une région pour lancer un mouvement positif.', standard: 'Standard', prize: 'Prix UNON', arenaName: 'NOM DU DÉFI', arenaPlaceholder: 'Ex. : Partagez un geste gentil', mainHashtag: 'HASHTAG PRINCIPAL', territory: 'RÉGION', ignite: 'CRÉER LE DÉFI', creating: 'CRÉATION...',
    uploadTitle: 'Choisir une vidéo enregistrée', uploadWarning: 'Ne choisissez pas la caméra à l’écran suivant.', uploadHelp: 'Choisissez Galerie, Fichiers, Photos ou une vidéo enregistrée.', continueFile: 'Continuer vers les fichiers', cancel: 'Annuler', closeUpload: 'Fermer les instructions',
    settings: 'Paramètres', profileVisibility: 'Visibilité du profil', profileVisibilityBody: 'Vos statistiques sont visibles dans le classement.', territoryPreference: 'Région préférée', optimizedFor: 'Optimisé pour {region}.',
  },
  de: {
    search: 'Challenges suchen...', openProfile: 'Profil öffnen', selectLanguage: 'Sprache wählen', navCreate: 'Erstellen', navRanking: 'Rangliste',
    trendKicker: 'Tägliche KI-Trends', trendSummary: 'Neue globale Trends zum Ansehen, Lernen und schnellen Mitmachen.', trendEmpty: 'Noch keine Trend ON Challenges.',
    battleKicker: 'Creator-Videos und Platinum-Challenges', battleSummary: 'Ein Ort für gute Taten, Lob, Unterstützung, Ranglisten und Platinum+-Preise.', battleEmpty: 'Keine offenen Battle ON Challenges.',
    nowKicker: 'Offizielle Missionen', nowSummary: 'Teile Videos guter Taten und verbreite sie weltweit.', nowEmpty: 'Keine offenen Now ON Missionen.',
    sayHello: 'Hallo sagen', welcomeBonus: 'Willkommensbonus', welcomeBonusBody: '100 UNON bis 31.12.2026 erhalten', sayHelloBody: 'Grußvideo hochladen und 2 UNON erhalten', goldHeart: 'Goldenes Herz', goldHeartBody: 'Mit UNON oder WLD unterstützen', rankingBody: 'Monatliche Rangliste ansehen',
    rankingKicker: 'Unterstützer-Rangliste', rankingSummary: 'UNON- und WLD-Unterstützung nach Monat, Quartal und Jahr.', month: 'Monat', quarter: 'Quartal', year: 'Jahr', supports: 'Unterstützungen', rankingEmpty: 'Keine Daten für diesen Zeitraum.',
    authTitle: 'Authentifizierung in World App', authBody: 'Die World ID-Prüfung startet automatisch. Danach wird Erstellen freigeschaltet.', authOutside: 'Außerhalb von World App bitte zur Mini App zurückkehren.',
    createTitle: 'Challenge erstellen', createSummary: 'Titel, Hashtags und Region hinzufügen und eine positive Bewegung starten.', standard: 'Standard', prize: 'UNON-Preis', arenaName: 'CHALLENGE-NAME', arenaPlaceholder: 'z. B. Einen freundlichen Moment teilen', mainHashtag: 'HAUPT-HASHTAG', territory: 'REGION', ignite: 'CHALLENGE ERSTELLEN', creating: 'WIRD ERSTELLT...',
    uploadTitle: 'Gespeichertes Video wählen', uploadWarning: 'Wähle im nächsten Bildschirm nicht die Kamera.', uploadHelp: 'Wähle Galerie, Dateien, Fotos oder ein gespeichertes Video.', continueFile: 'Zur Dateiauswahl', cancel: 'Abbrechen', closeUpload: 'Hinweise schließen',
    settings: 'Einstellungen', profileVisibility: 'Profilsichtbarkeit', profileVisibilityBody: 'Deine Statistiken sind in der Rangliste sichtbar.', territoryPreference: 'Bevorzugte Region', optimizedFor: 'Aktuell für {region} optimiert.',
  },
  it: {
    search: 'Cerca sfide...', openProfile: 'Apri profilo', selectLanguage: 'Seleziona lingua', navCreate: 'Crea', navRanking: 'Classifica',
    trendKicker: 'Tendenze quotidiane selezionate dall’IA', trendSummary: 'Nuove tendenze globali da guardare, conoscere e seguire rapidamente.', trendEmpty: 'Non ci sono ancora sfide Trend ON.',
    battleKicker: 'Video dei creator e sfide Platinum', battleSummary: 'Uno spazio per video di buone azioni, complimenti, sostegno, classifiche e premi Platinum+.', battleEmpty: 'Non ci sono sfide Battle ON aperte.',
    nowKicker: 'Missioni ufficiali', nowSummary: 'Condividi video di buone azioni e aiuta a diffondere il bene nel mondo.', nowEmpty: 'Non ci sono missioni Now ON aperte.',
    sayHello: 'Saluta', welcomeBonus: 'Bonus di benvenuto', welcomeBonusBody: 'Ottieni 100 UNON entro il 31/12/2026', sayHelloBody: 'Carica un saluto e ottieni 2 UNON', goldHeart: 'Cuore d’oro', goldHeartBody: 'Sostieni con UNON o WLD', rankingBody: 'Consulta la classifica mensile',
    rankingKicker: 'Classifica del sostegno', rankingSummary: 'Sostegno con UNON e WLD per mese, trimestre e anno.', month: 'Mese', quarter: 'Trimestre', year: 'Anno', supports: 'sostegni', rankingEmpty: 'Nessun dato per questo periodo.',
    authTitle: 'Autenticazione in World App', authBody: 'La verifica World ID inizia automaticamente. Al termine potrai creare.', authOutside: 'Se hai aperto fuori da World App, torna alla Mini App.',
    createTitle: 'Crea la tua sfida', createSummary: 'Aggiungi titolo, hashtag e regione per avviare un movimento positivo.', standard: 'Standard', prize: 'Premio UNON', arenaName: 'NOME DELLA SFIDA', arenaPlaceholder: 'Es.: Condividi un gesto gentile', mainHashtag: 'HASHTAG PRINCIPALE', territory: 'REGIONE', ignite: 'CREA SFIDA', creating: 'CREAZIONE...',
    uploadTitle: 'Seleziona un video salvato', uploadWarning: 'Non scegliere la fotocamera nella schermata successiva.', uploadHelp: 'Scegli Galleria, File, Foto o un video salvato.', continueFile: 'Continua alla selezione file', cancel: 'Annulla', closeUpload: 'Chiudi le istruzioni',
    settings: 'Impostazioni', profileVisibility: 'Visibilità del profilo', profileVisibilityBody: 'Le tue statistiche sono visibili nella classifica.', territoryPreference: 'Regione preferita', optimizedFor: 'Ottimizzato per {region}.',
  },
  pl: {
    search: 'Szukaj wyzwań...', openProfile: 'Otwórz profil', selectLanguage: 'Wybierz język', navCreate: 'Utwórz', navRanking: 'Ranking',
    trendKicker: 'Codzienne trendy wybrane przez AI', trendSummary: 'Nowe światowe trendy, które możesz oglądać, poznawać i szybko do nich dołączać.', trendEmpty: 'Nie ma jeszcze wyzwań Trend ON.',
    battleKicker: 'Filmy twórców i wyzwania Platinum', battleSummary: 'Miejsce na filmy z dobrymi uczynkami, pochwały, wsparcie, rankingi i nagrody Platinum+.', battleEmpty: 'Brak otwartych wyzwań Battle ON.',
    nowKicker: 'Oficjalne misje', nowSummary: 'Udostępniaj filmy z dobrymi uczynkami i pomagaj szerzyć dobro na świecie.', nowEmpty: 'Brak otwartych misji Now ON.',
    sayHello: 'Przywitaj się', welcomeBonus: 'Bonus powitalny', welcomeBonusBody: 'Odbierz 100 UNON do 31.12.2026', sayHelloBody: 'Prześlij powitanie i odbierz 2 UNON', goldHeart: 'Złote serce', goldHeartBody: 'Wspieraj za pomocą UNON lub WLD', rankingBody: 'Sprawdź miesięczny ranking wsparcia',
    rankingKicker: 'Ranking wsparcia', rankingSummary: 'Wsparcie UNON i WLD według miesiąca, kwartału i roku.', month: 'Miesiąc', quarter: 'Kwartał', year: 'Rok', supports: 'wsparć', rankingEmpty: 'Brak danych dla tego okresu.',
    authTitle: 'Uwierzytelnianie w World App', authBody: 'Weryfikacja World ID rozpoczyna się automatycznie. Po jej zakończeniu można tworzyć.', authOutside: 'Jeśli otwarto poza World App, wróć do Mini App.',
    createTitle: 'Utwórz wyzwanie', createSummary: 'Dodaj tytuł, hashtagi i region, aby rozpocząć pozytywny ruch.', standard: 'Standardowe', prize: 'Nagroda UNON', arenaName: 'NAZWA WYZWANIA', arenaPlaceholder: 'Np. Podziel się dobrym uczynkiem', mainHashtag: 'GŁÓWNY HASHTAG', territory: 'REGION', ignite: 'UTWÓRZ WYZWANIE', creating: 'TWORZENIE...',
    uploadTitle: 'Wybierz zapisany film', uploadWarning: 'Nie wybieraj aparatu na następnym ekranie.', uploadHelp: 'Wybierz Galerię, Pliki, Zdjęcia lub zapisany film.', continueFile: 'Przejdź do wyboru pliku', cancel: 'Anuluj', closeUpload: 'Zamknij instrukcję',
    settings: 'Ustawienia', profileVisibility: 'Widoczność profilu', profileVisibilityBody: 'Twoje statystyki są widoczne w rankingu.', territoryPreference: 'Preferowany region', optimizedFor: 'Obecnie zoptymalizowano dla {region}.',
  },
  ca: {
    search: 'Cerca reptes...', openProfile: 'Obre el perfil', selectLanguage: 'Selecciona l’idioma', navCreate: 'Crea', navRanking: 'Classificació',
    trendKicker: 'Tendències diàries seleccionades per IA', trendSummary: 'Noves tendències globals per mirar, aprendre i participar ràpidament.', trendEmpty: 'Encara no hi ha reptes Trend ON.',
    battleKicker: 'Vídeos de creadors i reptes Platinum', battleSummary: 'Un espai per a vídeos de bones accions, elogis, suport, classificacions i premis Platinum+.', battleEmpty: 'No hi ha reptes Battle ON oberts.',
    nowKicker: 'Missions oficials', nowSummary: 'Comparteix vídeos de bones accions i ajuda a estendre el bé arreu del món.', nowEmpty: 'No hi ha missions Now ON obertes.',
    sayHello: 'Saluda', welcomeBonus: 'Bonificació de benvinguda', welcomeBonusBody: 'Rep 100 UNON fins al 31/12/2026', sayHelloBody: 'Puja una salutació i rep 2 UNON', goldHeart: 'Cor d’or', goldHeartBody: 'Dona suport amb UNON o WLD', rankingBody: 'Consulta la classificació mensual',
    rankingKicker: 'Classificació de suport', rankingSummary: 'Suport amb UNON i WLD per mes, trimestre i any.', month: 'Mes', quarter: 'Trimestre', year: 'Any', supports: 'suports', rankingEmpty: 'No hi ha dades per a aquest període.',
    authTitle: 'Autenticació a World App', authBody: 'La verificació de World ID comença automàticament. Després podràs crear.', authOutside: 'Si ho has obert fora de World App, torna a la Mini App.',
    createTitle: 'Crea el teu repte', createSummary: 'Afegeix un títol, etiquetes i una regió per iniciar un moviment positiu.', standard: 'Estàndard', prize: 'Premi UNON', arenaName: 'NOM DEL REPTE', arenaPlaceholder: 'Ex.: Comparteix un gest amable', mainHashtag: 'ETIQUETA PRINCIPAL', territory: 'REGIÓ', ignite: 'CREA EL REPTE', creating: 'CREANT...',
    uploadTitle: 'Selecciona un vídeo desat', uploadWarning: 'No triïs la càmera a la pantalla següent.', uploadHelp: 'Tria Galeria, Fitxers, Fotos o un vídeo desat.', continueFile: 'Continua als fitxers', cancel: 'Cancel·la', closeUpload: 'Tanca les instruccions',
    settings: 'Configuració', profileVisibility: 'Visibilitat del perfil', profileVisibilityBody: 'Les teves estadístiques són visibles a la classificació.', territoryPreference: 'Regió preferida', optimizedFor: 'Optimitzat per a {region}.',
  },
  hi: {
    search: 'चैलेंज खोजें...', openProfile: 'प्रोफ़ाइल खोलें', selectLanguage: 'भाषा चुनें', navCreate: 'बनाएँ', navRanking: 'रैंकिंग',
    trendKicker: 'AI द्वारा चुने दैनिक ट्रेंड', trendSummary: 'देखने, सीखने और तुरंत जुड़ने के लिए नए वैश्विक ट्रेंड।', trendEmpty: 'अभी कोई Trend ON चैलेंज नहीं है।',
    battleKicker: 'क्रिएटर वीडियो और Platinum चैलेंज', battleSummary: 'नेक काम, प्रशंसा, सहयोग, रैंकिंग और Platinum+ पुरस्कारों का साझा स्थान।', battleEmpty: 'कोई Battle ON चैलेंज खुला नहीं है।',
    nowKicker: 'आधिकारिक मिशन', nowSummary: 'नेक कामों के वीडियो साझा करें और अच्छाई को दुनिया भर में फैलाएँ।', nowEmpty: 'कोई Now ON मिशन खुला नहीं है।',
    sayHello: 'नमस्ते कहें', welcomeBonus: 'स्वागत बोनस', welcomeBonusBody: '31-12-2026 तक 100 UNON पाएँ', sayHelloBody: 'अभिवादन वीडियो डालें और 2 UNON पाएँ', goldHeart: 'गोल्ड हार्ट', goldHeartBody: 'UNON या WLD से सहयोग करें', rankingBody: 'मासिक सहयोग रैंकिंग देखें',
    rankingKicker: 'सहयोग लीडरबोर्ड', rankingSummary: 'UNON और WLD सहयोग को माह, तिमाही और वर्ष के अनुसार देखें।', month: 'माह', quarter: 'तिमाही', year: 'वर्ष', supports: 'सहयोग', rankingEmpty: 'इस अवधि का डेटा उपलब्ध नहीं है।',
    authTitle: 'World App में प्रमाणीकरण', authBody: 'World ID सत्यापन अपने आप शुरू होता है। पूरा होने पर निर्माण चालू होगा।', authOutside: 'यदि World App के बाहर खोला है तो Mini App में लौटें।',
    createTitle: 'अपना चैलेंज बनाएँ', createSummary: 'शीर्षक, हैशटैग और क्षेत्र जोड़कर सकारात्मक अभियान शुरू करें।', standard: 'सामान्य', prize: 'UNON पुरस्कार', arenaName: 'चैलेंज का नाम', arenaPlaceholder: 'जैसे: दयालु पल साझा करें', mainHashtag: 'मुख्य हैशटैग', territory: 'क्षेत्र', ignite: 'चैलेंज बनाएँ', creating: 'बन रहा है...',
    uploadTitle: 'सहेजा गया वीडियो चुनें', uploadWarning: 'अगली स्क्रीन पर कैमरा न चुनें।', uploadHelp: 'गैलरी, फ़ाइलें, फ़ोटो या सहेजा वीडियो चुनें।', continueFile: 'फ़ाइल चयन जारी रखें', cancel: 'रद्द करें', closeUpload: 'निर्देश बंद करें',
    settings: 'सेटिंग्स', profileVisibility: 'प्रोफ़ाइल दृश्यता', profileVisibilityBody: 'आपके आँकड़े लीडरबोर्ड पर दिखते हैं।', territoryPreference: 'पसंदीदा क्षेत्र', optimizedFor: 'अभी {region} के लिए अनुकूलित।',
  },
  id: {
    search: 'Cari tantangan...', openProfile: 'Buka profil', selectLanguage: 'Pilih bahasa', navCreate: 'Buat', navRanking: 'Peringkat',
    trendKicker: 'Tren harian pilihan AI', trendSummary: 'Tren global baru untuk ditonton, dipelajari, dan diikuti dengan cepat.', trendEmpty: 'Belum ada tantangan Trend ON.',
    battleKicker: 'Video kreator dan tantangan Platinum', battleSummary: 'Ruang untuk video kebaikan, pujian, dukungan, peringkat, dan hadiah Platinum+.', battleEmpty: 'Tidak ada tantangan Battle ON yang dibuka.',
    nowKicker: 'Misi resmi', nowSummary: 'Bagikan video perbuatan baik dan sebarkan kebaikan ke seluruh dunia.', nowEmpty: 'Tidak ada misi Now ON yang dibuka.',
    sayHello: 'Sapa dunia', welcomeBonus: 'Bonus selamat datang', welcomeBonusBody: 'Klaim 100 UNON hingga 31-12-2026', sayHelloBody: 'Unggah salam dan klaim 2 UNON', goldHeart: 'Hati emas', goldHeartBody: 'Dukung dengan UNON atau WLD', rankingBody: 'Lihat peringkat dukungan bulanan',
    rankingKicker: 'Peringkat dukungan', rankingSummary: 'Dukungan UNON dan WLD per bulan, kuartal, dan tahun.', month: 'Bulan', quarter: 'Kuartal', year: 'Tahun', supports: 'dukungan', rankingEmpty: 'Belum ada data untuk periode ini.',
    authTitle: 'Autentikasi di World App', authBody: 'Verifikasi World ID dimulai otomatis. Fitur buat terbuka setelah selesai.', authOutside: 'Jika dibuka di luar World App, kembali ke Mini App.',
    createTitle: 'Buat tantangan', createSummary: 'Tambahkan judul, tagar, dan wilayah untuk memulai gerakan positif.', standard: 'Standar', prize: 'Hadiah UNON', arenaName: 'NAMA TANTANGAN', arenaPlaceholder: 'mis. Bagikan momen kebaikan', mainHashtag: 'TAGAR UTAMA', territory: 'WILAYAH', ignite: 'BUAT TANTANGAN', creating: 'MEMBUAT...',
    uploadTitle: 'Pilih video tersimpan', uploadWarning: 'Jangan pilih kamera di layar berikutnya.', uploadHelp: 'Pilih Galeri, File, Foto, atau video yang tersimpan.', continueFile: 'Lanjut pilih file', cancel: 'Batal', closeUpload: 'Tutup panduan',
    settings: 'Pengaturan', profileVisibility: 'Visibilitas profil', profileVisibilityBody: 'Statistik Anda terlihat di papan peringkat.', territoryPreference: 'Wilayah pilihan', optimizedFor: 'Dioptimalkan untuk {region}.',
  },
  ms: {
    search: 'Cari cabaran...', openProfile: 'Buka profil', selectLanguage: 'Pilih bahasa', navCreate: 'Cipta', navRanking: 'Kedudukan',
    trendKicker: 'Trend harian pilihan AI', trendSummary: 'Trend global baharu untuk ditonton, dipelajari dan disertai dengan pantas.', trendEmpty: 'Belum ada cabaran Trend ON.',
    battleKicker: 'Video pencipta dan cabaran Platinum', battleSummary: 'Ruang untuk video amalan baik, pujian, sokongan, kedudukan dan hadiah Platinum+.', battleEmpty: 'Tiada cabaran Battle ON yang dibuka.',
    nowKicker: 'Misi rasmi', nowSummary: 'Kongsi video amalan baik dan bantu sebarkan kebaikan ke seluruh dunia.', nowEmpty: 'Tiada misi Now ON yang dibuka.',
    sayHello: 'Ucap helo', welcomeBonus: 'Bonus alu-aluan', welcomeBonusBody: 'Tuntut 100 UNON sehingga 31-12-2026', sayHelloBody: 'Muat naik ucapan dan tuntut 2 UNON', goldHeart: 'Hati emas', goldHeartBody: 'Sokong dengan UNON atau WLD', rankingBody: 'Semak kedudukan sokongan bulanan',
    rankingKicker: 'Kedudukan sokongan', rankingSummary: 'Sokongan UNON dan WLD mengikut bulan, suku tahun dan tahun.', month: 'Bulan', quarter: 'Suku tahun', year: 'Tahun', supports: 'sokongan', rankingEmpty: 'Belum ada data untuk tempoh ini.',
    authTitle: 'Pengesahan dalam World App', authBody: 'Pengesahan World ID bermula secara automatik. Cipta akan dibuka selepas selesai.', authOutside: 'Jika dibuka di luar World App, kembali ke Mini App.',
    createTitle: 'Cipta cabaran', createSummary: 'Tambah tajuk, tanda pagar dan wilayah untuk memulakan gerakan positif.', standard: 'Standard', prize: 'Hadiah UNON', arenaName: 'NAMA CABARAN', arenaPlaceholder: 'cth. Kongsi detik kebaikan', mainHashtag: 'TANDA PAGAR UTAMA', territory: 'WILAYAH', ignite: 'CIPTA CABARAN', creating: 'MENCIPTA...',
    uploadTitle: 'Pilih video tersimpan', uploadWarning: 'Jangan pilih kamera pada skrin seterusnya.', uploadHelp: 'Pilih Galeri, Fail, Foto atau video yang telah disimpan.', continueFile: 'Teruskan ke pemilihan fail', cancel: 'Batal', closeUpload: 'Tutup panduan',
    settings: 'Tetapan', profileVisibility: 'Keterlihatan profil', profileVisibilityBody: 'Statistik anda dipaparkan pada papan kedudukan.', territoryPreference: 'Wilayah pilihan', optimizedFor: 'Dioptimumkan untuk {region}.',
  },
  nl: {
    search: 'Challenges zoeken...', openProfile: 'Profiel openen', selectLanguage: 'Taal kiezen', navCreate: 'Maken', navRanking: 'Ranglijst',
    trendKicker: 'Dagelijkse trends gekozen door AI', trendSummary: 'Nieuwe wereldwijde trends om te bekijken, te leren en snel mee te doen.', trendEmpty: 'Er zijn nog geen Trend ON-challenges.',
    battleKicker: 'Video’s van makers en Platinum-challenges', battleSummary: 'Een plek voor goede-dadenvideo’s, complimenten, steun, ranglijsten en Platinum+-prijzen.', battleEmpty: 'Er zijn geen open Battle ON-challenges.',
    nowKicker: 'Officiële missies', nowSummary: 'Deel video’s van goede daden en help vriendelijkheid wereldwijd te verspreiden.', nowEmpty: 'Er zijn geen open Now ON-missies.',
    sayHello: 'Zeg hallo', welcomeBonus: 'Welkomstbonus', welcomeBonusBody: 'Ontvang 100 UNON tot en met 31-12-2026', sayHelloBody: 'Upload een begroeting en ontvang 2 UNON', goldHeart: 'Gouden hart', goldHeartBody: 'Steun met UNON of WLD', rankingBody: 'Bekijk de maandelijkse ranglijst',
    rankingKicker: 'Steunranglijst', rankingSummary: 'UNON- en WLD-steun per maand, kwartaal en jaar.', month: 'Maand', quarter: 'Kwartaal', year: 'Jaar', supports: 'steunbetuigingen', rankingEmpty: 'Geen gegevens voor deze periode.',
    authTitle: 'Verifiëren in World App', authBody: 'World ID-verificatie start automatisch. Daarna wordt maken beschikbaar.', authOutside: 'Ga terug naar de Mini App als je dit buiten World App hebt geopend.',
    createTitle: 'Maak je challenge', createSummary: 'Voeg een titel, hashtags en regio toe om een positieve beweging te starten.', standard: 'Standaard', prize: 'UNON-prijs', arenaName: 'NAAM VAN CHALLENGE', arenaPlaceholder: 'Bijv. Deel een vriendelijk moment', mainHashtag: 'BELANGRIJKSTE HASHTAG', territory: 'REGIO', ignite: 'CHALLENGE MAKEN', creating: 'BEZIG MET MAKEN...',
    uploadTitle: 'Opgeslagen video kiezen', uploadWarning: 'Kies op het volgende scherm niet de camera.', uploadHelp: 'Kies Galerij, Bestanden, Foto’s of een opgeslagen video.', continueFile: 'Doorgaan naar bestanden', cancel: 'Annuleren', closeUpload: 'Uploadinstructies sluiten',
    settings: 'Instellingen', profileVisibility: 'Profielzichtbaarheid', profileVisibilityBody: 'Je statistieken zijn zichtbaar in de ranglijst.', territoryPreference: 'Voorkeursregio', optimizedFor: 'Momenteel geoptimaliseerd voor {region}.',
  },
  th: {
    search: 'ค้นหาชาเลนจ์...', openProfile: 'เปิดโปรไฟล์', selectLanguage: 'เลือกภาษา', navCreate: 'สร้าง', navRanking: 'อันดับ',
    trendKicker: 'เทรนด์รายวันที่ AI คัดสรร', trendSummary: 'เทรนด์ใหม่ทั่วโลกให้รับชม เรียนรู้ และเข้าร่วมได้ทันที', trendEmpty: 'ยังไม่มีชาเลนจ์ Trend ON',
    battleKicker: 'วิดีโอครีเอเตอร์และชาเลนจ์ Platinum', battleSummary: 'พื้นที่รวมวิดีโอความดี คำชม การสนับสนุน อันดับ และรางวัล Platinum+', battleEmpty: 'ยังไม่มีชาเลนจ์ Battle ON',
    nowKicker: 'ภารกิจทางการ', nowSummary: 'แชร์วิดีโอการทำความดีและช่วยส่งต่อสิ่งดี ๆ ไปทั่วโลก', nowEmpty: 'ยังไม่มีภารกิจ Now ON',
    sayHello: 'กล่าวสวัสดี', welcomeBonus: 'โบนัสต้อนรับ', welcomeBonusBody: 'รับ 100 UNON ภายใน 31-12-2026', sayHelloBody: 'อัปโหลดวิดีโอทักทายและรับ 2 UNON', goldHeart: 'หัวใจทอง', goldHeartBody: 'สนับสนุนด้วย UNON หรือ WLD', rankingBody: 'ดูอันดับการสนับสนุนรายเดือน',
    rankingKicker: 'อันดับการสนับสนุน', rankingSummary: 'การสนับสนุน UNON และ WLD แยกตามเดือน ไตรมาส และปี', month: 'เดือน', quarter: 'ไตรมาส', year: 'ปี', supports: 'การสนับสนุน', rankingEmpty: 'ยังไม่มีข้อมูลในช่วงเวลานี้',
    authTitle: 'กำลังยืนยันใน World App', authBody: 'การยืนยัน World ID จะเริ่มอัตโนมัติ และสร้างได้เมื่อเสร็จสิ้น', authOutside: 'หากเปิดนอก World App โปรดกลับไปที่ Mini App',
    createTitle: 'สร้างชาเลนจ์', createSummary: 'เพิ่มชื่อ แฮชแท็ก และภูมิภาคเพื่อเริ่มการเปลี่ยนแปลงที่ดี', standard: 'มาตรฐาน', prize: 'รางวัล UNON', arenaName: 'ชื่อชาเลนจ์', arenaPlaceholder: 'เช่น แบ่งปันช่วงเวลาแห่งน้ำใจ', mainHashtag: 'แฮชแท็กหลัก', territory: 'ภูมิภาค', ignite: 'สร้างชาเลนจ์', creating: 'กำลังสร้าง...',
    uploadTitle: 'เลือกวิดีโอที่บันทึกไว้', uploadWarning: 'อย่าเลือกกล้องในหน้าถัดไป', uploadHelp: 'เลือกแกลเลอรี ไฟล์ รูปภาพ หรือวิดีโอที่บันทึกไว้', continueFile: 'เลือกไฟล์ต่อ', cancel: 'ยกเลิก', closeUpload: 'ปิดคำแนะนำ',
    settings: 'การตั้งค่า', profileVisibility: 'การมองเห็นโปรไฟล์', profileVisibilityBody: 'สถิติของคุณจะแสดงบนอันดับ', territoryPreference: 'ภูมิภาคที่ต้องการ', optimizedFor: 'ปรับให้เหมาะกับ {region}',
  },
  vi: {
    search: 'Tìm thử thách...', openProfile: 'Mở hồ sơ', selectLanguage: 'Chọn ngôn ngữ', navCreate: 'Tạo', navRanking: 'Xếp hạng',
    trendKicker: 'Xu hướng hằng ngày do AI chọn', trendSummary: 'Khám phá xu hướng toàn cầu mới để xem, học hỏi và tham gia nhanh chóng.', trendEmpty: 'Chưa có thử thách Trend ON.',
    battleKicker: 'Video nhà sáng tạo và thử thách Platinum', battleSummary: 'Không gian cho video việc tốt, lời khen, ủng hộ, xếp hạng và giải thưởng Platinum+.', battleEmpty: 'Chưa có thử thách Battle ON đang mở.',
    nowKicker: 'Nhiệm vụ chính thức', nowSummary: 'Chia sẻ video việc tốt và giúp lan tỏa điều tử tế trên toàn thế giới.', nowEmpty: 'Chưa có nhiệm vụ Now ON đang mở.',
    sayHello: 'Gửi lời chào', welcomeBonus: 'Thưởng chào mừng', welcomeBonusBody: 'Nhận 100 UNON đến ngày 31-12-2026', sayHelloBody: 'Tải video chào hỏi và nhận 2 UNON', goldHeart: 'Trái tim vàng', goldHeartBody: 'Ủng hộ bằng UNON hoặc WLD', rankingBody: 'Xem xếp hạng ủng hộ hằng tháng',
    rankingKicker: 'Bảng xếp hạng ủng hộ', rankingSummary: 'Ủng hộ bằng UNON và WLD theo tháng, quý và năm.', month: 'Tháng', quarter: 'Quý', year: 'Năm', supports: 'lượt ủng hộ', rankingEmpty: 'Chưa có dữ liệu cho giai đoạn này.',
    authTitle: 'Đang xác thực trong World App', authBody: 'Xác minh World ID tự động bắt đầu. Tính năng tạo sẽ mở khi hoàn tất.', authOutside: 'Nếu mở ngoài World App, hãy quay lại Mini App.',
    createTitle: 'Tạo thử thách', createSummary: 'Thêm tiêu đề, hashtag và khu vực để khởi đầu một phong trào tích cực.', standard: 'Tiêu chuẩn', prize: 'Thưởng UNON', arenaName: 'TÊN THỬ THÁCH', arenaPlaceholder: 'VD: Chia sẻ một khoảnh khắc tử tế', mainHashtag: 'HASHTAG CHÍNH', territory: 'KHU VỰC', ignite: 'TẠO THỬ THÁCH', creating: 'ĐANG TẠO...',
    uploadTitle: 'Chọn video đã lưu', uploadWarning: 'Không chọn máy ảnh ở màn hình tiếp theo.', uploadHelp: 'Chọn Thư viện, Tệp, Ảnh hoặc video đã lưu.', continueFile: 'Tiếp tục chọn tệp', cancel: 'Hủy', closeUpload: 'Đóng hướng dẫn tải lên',
    settings: 'Cài đặt', profileVisibility: 'Hiển thị hồ sơ', profileVisibilityBody: 'Thống kê của bạn hiển thị trên bảng xếp hạng.', territoryPreference: 'Khu vực ưu tiên', optimizedFor: 'Hiện được tối ưu cho {region}.',
  },
  ru: {
    search: 'Поиск челленджей...', openProfile: 'Открыть профиль', selectLanguage: 'Выбрать язык', navCreate: 'Создать', navRanking: 'Рейтинг',
    trendKicker: 'Ежедневные тренды от ИИ', trendSummary: 'Новые мировые тренды, которые можно смотреть, изучать и быстро поддерживать.', trendEmpty: 'Пока нет челленджей Trend ON.',
    battleKicker: 'Видео авторов и Platinum-челленджи', battleSummary: 'Пространство добрых видео, похвалы, поддержки, рейтингов и призов Platinum+.', battleEmpty: 'Нет открытых челленджей Battle ON.',
    nowKicker: 'Официальные миссии', nowSummary: 'Делитесь видео добрых поступков и помогайте распространять добро по всему миру.', nowEmpty: 'Нет открытых миссий Now ON.',
    sayHello: 'Поздороваться', welcomeBonus: 'Приветственный бонус', welcomeBonusBody: 'Получите 100 UNON до 31.12.2026', sayHelloBody: 'Загрузите приветствие и получите 2 UNON', goldHeart: 'Золотое сердце', goldHeartBody: 'Поддержите автора с UNON или WLD', rankingBody: 'Посмотрите ежемесячный рейтинг',
    rankingKicker: 'Рейтинг поддержки', rankingSummary: 'Поддержка UNON и WLD по месяцам, кварталам и годам.', month: 'Месяц', quarter: 'Квартал', year: 'Год', supports: 'поддержек', rankingEmpty: 'За этот период данных пока нет.',
    authTitle: 'Аутентификация в World App', authBody: 'Проверка World ID начнётся автоматически. После неё станет доступно создание.', authOutside: 'Если вы открыли страницу вне World App, вернитесь в Mini App.',
    createTitle: 'Создать челлендж', createSummary: 'Добавьте название, хэштеги и регион, чтобы начать позитивное движение.', standard: 'Обычный', prize: 'Приз UNON', arenaName: 'НАЗВАНИЕ ЧЕЛЛЕНДЖА', arenaPlaceholder: 'Например: Поделитесь добрым поступком', mainHashtag: 'ГЛАВНЫЙ ХЭШТЕГ', territory: 'РЕГИОН', ignite: 'СОЗДАТЬ ЧЕЛЛЕНДЖ', creating: 'СОЗДАНИЕ...',
    uploadTitle: 'Выбрать сохранённое видео', uploadWarning: 'Не выбирайте камеру на следующем экране.', uploadHelp: 'Выберите галерею, файлы, фото или сохранённое видео.', continueFile: 'Перейти к выбору файла', cancel: 'Отмена', closeUpload: 'Закрыть инструкцию',
    settings: 'Настройки', profileVisibility: 'Видимость профиля', profileVisibilityBody: 'Ваша статистика видна в рейтинге.', territoryPreference: 'Предпочитаемый регион', optimizedFor: 'Сейчас оптимизировано для {region}.',
  },
};

const STORAGE_KEY = 'challengeon-language';

export const normalizeLanguage = (value: string): AppLanguage | null => {
  const normalized = value.trim().toLowerCase();
  if (/^zh-(tw|hk|mo)/.test(normalized)) return 'zh-TW';
  const base = normalized.split('-')[0] as AppLanguage;
  return SUPPORTED_LANGUAGES.some(({ code }) => code === base) ? base : null;
};

const getInitialLanguage = (): AppLanguage => {
  if (typeof window === 'undefined') return 'en';
  const saved = normalizeLanguage(window.localStorage.getItem(STORAGE_KEY) || '');
  if (saved) return saved;
  for (const candidate of navigator.languages || [navigator.language]) {
    const matched = normalizeLanguage(candidate);
    if (matched) return matched;
  }
  return 'en';
};

type I18nContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (key: TranslationKey, variables?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(getInitialLanguage);

  const setLanguage = (next: AppLanguage) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setLanguageState(next);
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    t: (key, variables = {}) => {
      const template = translations[language][key] || en[key];
      return Object.entries(variables).reduce(
        (result, [name, replacement]) => result.replaceAll(`{${name}}`, String(replacement)),
        template,
      );
    },
  }), [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside LanguageProvider');
  return context;
}
