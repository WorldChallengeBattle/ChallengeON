require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'wcb_db',
  password: process.env.PGPASSWORD || 'password',
  port: process.env.PGPORT || 5432,
});

const TOP_20_CHALLENGES = [
  // Cluster A: AI-Hybrid
  { id: 'trend_nanobanana', title: 'Nano Banana Challenge', hashtags: '#nanobanana #AIArt #Surreal #GoodON #kindnesson #PraiseRelay', region: 'Global 🌍', score: 9500, participants: 1200, gradient: 'linear-gradient(45deg, #fce38a, #f38181)' },
  { id: 'trend_agenticai', title: 'Agentic AI Challenge', hashtags: '#agenticAI #Automation #Future #Work #GoodON #kindnesson #PraiseRelay', region: 'USA 🇺🇸', score: 8800, participants: 850, gradient: 'linear-gradient(45deg, #12c2e9, #c471ed, #f64f59)' },
  { id: 'trend_genvlog', title: 'Generative Vlog Challenge', hashtags: '#generativevlog #AIEdit #Cinematic #Story #GoodON #kindnesson #PraiseRelay', region: 'Europe 🇪🇺', score: 7200, participants: 600, gradient: 'linear-gradient(45deg, #6a11cb, #2575fc)' },
  { id: 'trend_aifilter', title: 'AI Filter Battle', hashtags: '#aifilterchallenge #Visuals #Tech #Battle #GoodON #kindnesson #PraiseRelay', region: 'Global 🌍', score: 6500, participants: 2100, gradient: 'linear-gradient(45deg, #00b09b, #96c93d)' },
  
  // Cluster B: Absurdist Memes
  { id: 'trend_sealion', title: 'Sea Lion Challenge', hashtags: '#sealion #ArkhArkh #Funny #Meme #GoodON #kindnesson #PraiseRelay', region: 'Global 🌍', score: 9900, participants: 4500, gradient: 'linear-gradient(45deg, #4facfe, #00f2fe)' },
  { id: 'trend_jonhamm', title: 'Jon Hamm Dance Challenge', hashtags: '#jonhammdancing #TurnTheLightsOff #Awkward #Vibe #GoodON #kindnesson #PraiseRelay', region: 'USA 🇺🇸', score: 9200, participants: 3200, gradient: 'linear-gradient(45deg, #ee9ca7, #ffdde1)' },
  { id: 'trend_owl', title: 'Owl Rhythm Challenge', hashtags: '#owlchallenge #Sync #Bass #Friends #GoodON #kindnesson #PraiseRelay', region: 'Japan 🇯🇵', score: 8100, participants: 1800, gradient: 'linear-gradient(45deg, #232526, #414345)' },
  { id: 'trend_tvon', title: 'Just Gonna Put The TV On', hashtags: '#justgonnaputthetvon #Procrastination #Relatable #Cleaning #GoodON #kindnesson #PraiseRelay', region: 'Global 🌍', score: 7800, participants: 5500, gradient: 'linear-gradient(45deg, #654ea3, #eaafc8)' },
  { id: 'trend_lifemission', title: 'Life Mission Carousel', hashtags: '#lifemission #ExpectationVsReality #Comedy #List #GoodON #kindnesson #PraiseRelay', region: 'Korea 🇰🇷', score: 7400, participants: 1100, gradient: 'linear-gradient(45deg, #ff9a9e, #fecfef)' },

  // Cluster C: Performance
  { id: 'trend_takaladentro', title: 'Taka La Dentro Dance', hashtags: '#takaladentro #DanceChallenge #Speed #Footwork #GoodON #kindnesson #PraiseRelay', region: 'Global 🌍', score: 9800, participants: 8900, gradient: 'linear-gradient(45deg, #0093E9, #80D0C7)' },
  { id: 'trend_365buttons', title: '365 Buttons Transition', hashtags: '#365buttons #Fashion #リップシンク #CharliXCX #GoodON #kindnesson #PraiseRelay', region: 'Global 🌍', score: 9400, participants: 6700, gradient: 'linear-gradient(45deg, #FBAB7E, #F7CE68)' },
  { id: 'trend_kpopmashup', title: 'K-Pop Mashup Mar 2026', hashtags: '#kpopmashup #Dance #Idol #Megamix #GoodON #kindnesson #PraiseRelay', region: 'Korea 🇰🇷', score: 9600, participants: 4200, gradient: 'linear-gradient(45deg, #85FFBD, #FFFB7D)' },
  { id: 'trend_heavencanwait', title: 'Heaven Can Wait Vocal', hashtags: '#heavencanwait #Singing #HighNote #Reaction #GoodON #kindnesson #PraiseRelay', region: 'Global 🌍', score: 7100, participants: 800, gradient: 'linear-gradient(45deg, #8EC5FC, #E0C3FC)' },

  // Cluster D: Discipline & Aesthetic
  { id: 'trend_analogue', title: 'Going Analogue 48H', hashtags: '#goinganalogue #DigitalDetox #Mindfulness #Peace #GoodON #kindnesson #PraiseRelay', region: 'UK 🇬🇧', score: 6800, participants: 400, gradient: 'linear-gradient(45deg, #d4fc79, #96e6a1)' },
  { id: 'trend_75hard', title: '75 Hard Challenge', hashtags: '#75hard #Fitness #Discipline #Consistency #GoodON #kindnesson #PraiseRelay', region: 'Global 🌍', score: 8500, participants: 15000, gradient: 'linear-gradient(45deg, #434343, #000000)' },
  { id: 'trend_adminnight', title: 'Admin Night Aesthetic', hashtags: '#adminnight #Chores #Productivity #Cozy #GoodON #kindnesson #PraiseRelay', region: 'USA 🇺🇸', score: 6200, participants: 2300, gradient: 'linear-gradient(45deg, #e6e9f0, #eef1f5)' },
  { id: 'trend_sunshineboy', title: 'Sunshine Boy Transition', hashtags: '#sunshineboy #SummerNostalgia #Vacation #Edit #GoodON #kindnesson #PraiseRelay', region: 'SEA 🌏', score: 7900, participants: 3400, gradient: 'linear-gradient(45deg, #f093fb, #f5576c)' },

  // Cluster E: Niche
  { id: 'trend_labubu', title: 'Labubu Style Challenge', hashtags: '#labubu #ArtToy #Fashion #Styling #GoodON #kindnesson #PraiseRelay', region: 'SEA 🌏', score: 8200, participants: 2900, gradient: 'linear-gradient(45deg, #fa709a, #fee140)' },
  { id: 'trend_pets', title: 'Level Up Pet Challenge', hashtags: '#leveluppet #Animal #SmartPet #Funny #GoodON #kindnesson #PraiseRelay', region: 'Global 🌍', score: 8900, participants: 12000, gradient: 'linear-gradient(45deg, #4facfe, #00f2fe)' },
  { id: 'trend_draculajennie', title: 'Dracula Jennie Vlog', hashtags: '#draculajennie #Vibe #Aesthetic #JENNIE #GoodON #kindnesson #PraiseRelay', region: 'Global 🌍', score: 8700, participants: 4800, gradient: 'linear-gradient(45deg, #252424, #910e0e)' }
];

async function seed() {
  try {
    console.log('[🚀] Starting DB Seeding for Top 20 Challenges...');
    
    for (const c of TOP_20_CHALLENGES) {
      const query = `
        INSERT INTO challenges (id, title, hashtags, region, viral_score, participants, bg_gradient)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          hashtags = EXCLUDED.hashtags,
          viral_score = EXCLUDED.viral_score,
          participants = EXCLUDED.participants,
          bg_gradient = EXCLUDED.bg_gradient
      `;
      await pool.query(query, [c.id, c.title, c.hashtags, c.region, c.score, c.participants, c.gradient]);
      console.log(`[✅] Seeded: ${c.title}`);
    }
    
    console.log('[✨] DB Seeding Complete!');
    process.exit(0);
  } catch (err) {
    console.error('[!] Seeding Error:', err.message);
    process.exit(1);
  }
}

seed();
