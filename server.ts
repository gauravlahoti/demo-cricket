import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Lazy-initialized Gemini client to prevent crashes on startup if key is missing
let aiInstance: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey === '') {
    return null;
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
}

// REST route for AI Strategic Analysis
app.post('/api/ai-analysis', async (req, res) => {
  try {
    const matchState = req.body;
    const ai = getGemini();

    if (!ai) {
      // Return a very high quality, dynamic fallback analyzer in case the API key is not supplied
      const mockAnalysis = generateMockAnalysis(matchState);
      return res.json(mockAnalysis);
    }

    const {
      battingTeam,
      bowlingTeam,
      innings,
      score,
      wickets,
      overs,
      ballsInOver,
      target,
      striker,
      nonStriker,
      currentBowler,
      recentHistory
    } = matchState;

    const lastBall = recentHistory && recentHistory.length > 0 ? recentHistory[0] : null;
    const lastBallEvent = lastBall ? `last ball event: ${lastBall.outcome} runs scored, commentary: ${lastBall.commentary}` : 'match is just beginning';

    const prompt = `
Analyze this high-tension T20 cricket encounter as an expert tactical broadcast commentator.
Current State:
- Batting Team: ${battingTeam.fullName} (${battingTeam.code})
- Bowling Team: ${bowlingTeam.fullName} (${bowlingTeam.code})
- Innings: ${innings}
- Score: ${score}/${wickets}
- Overs completed: ${overs}.${ballsInOver} / 20
- Target: ${target ? `${target} runs` : 'Not set yet (first innings)'}
- Batter on strike (Striker): ${striker.name} (Style: ${striker.battingStyle}, Strengths: ${striker.strengths.join(', ')}, Weaknesses: ${striker.weaknesses.join(', ')})
- Non-striker: ${nonStriker.name}
- Current Bowler: ${currentBowler.name} (Style: ${currentBowler.bowlingStyle}, Strengths: ${currentBowler.strengths.join(', ')})
- Latest Action Context: ${lastBallEvent}

Your response must contain:
1. headline: High-drama HUD uppercase headline (maximum 4 words) describing the tactical tension.
2. commentary: Energetic, concise 1-2 sentence real-time tactical overview analyzing the batting-bowling matchup.
3. confidence: Number (1-100) representing AI confidence.
4. winProbabilityAnalysis: A short, direct sentence explaining why the win probability lies where it does, citing exact metrics (runs, balls remaining, or wickets).
5. tacticalKey: A sharp tactical, uppercase instruction tag (e.g. "TARGET THIRD MAN CHANNEL" or "DEPLOY GOOGLY AT DEATH") that the captain or batsman should adopt.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        systemInstruction: "You are a professional futuristic cricket broadcast AI system analyzing tactical telemetry and simulation state on a sports screen.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["headline", "commentary", "confidence", "winProbabilityAnalysis", "tacticalKey"],
          properties: {
            headline: { type: Type.STRING, description: "Uppercase HUD broadcast headline, maximum 4 words." },
            commentary: { type: Type.STRING, description: "Energetic and crisp 1-2 sentence tactical matchup observation." },
            confidence: { type: Type.INTEGER, description: "Confidence score percentage index between 10-100." },
            winProbabilityAnalysis: { type: Type.STRING, description: "Precise sentence explaining current probability shifts citing actual score metrics." },
            tacticalKey: { type: Type.STRING, description: "Short uppercase analytical action command tag, maximum 4 words." }
          }
        }
      }
    });

    const textToParse = response.text || '{}';
    const parsedData = JSON.parse(textToParse);
    return res.json(parsedData);

  } catch (error: any) {
    console.error('Error generating AI analysis:', error);
    // Return high quality graceful fallback
    const fallback = generateMockAnalysis(req.body);
    return res.json(fallback);
  }
});

// Dynamic local fallback analyzer generator
function generateMockAnalysis(match: any): any {
  if (!match) {
    return {
      headline: "HUD TELEMETRY STANDBY",
      commentary: "Active feedback analyzer is waiting for initial match event transmission.",
      confidence: 90,
      winProbabilityAnalysis: "Steady state balance pending telemetry feeds.",
      tacticalKey: "ACQUIRING COGNITIVE FEED"
    };
  }

  const runsNeeded = match.target ? match.target - match.score : 0;
  const completedBalls = match.overs * 6 + match.ballsInOver;
  const ballsRemaining = Math.max(0, 120 - completedBalls);

  if (match.isGameOver) {
    return {
      headline: "ENCOUNTER RESOLVED",
      commentary: `Simulation terminated with definitive victor established. ${match.gameOutcome || 'Match finished.'}`,
      confidence: 100,
      winProbabilityAnalysis: "The win probability has settled at a deterministic state of absolute ceiling.",
      tacticalKey: "ANALYSIS STANDBY"
    };
  }

  if (match.innings === 1) {
    const projected = completedBalls > 0 ? Math.round((match.score / completedBalls) * 20 * 6) : 180;
    return {
      headline: `${match.battingTeam?.code || 'BATTER'} ATTACK ACTIVE`,
      commentary: `${match.striker?.name || 'Batsman'} and ${match.nonStriker?.name || 'partner'} are building the innings. ${match.currentBowler?.name || 'Bowler'} is varying speeds.`,
      confidence: 85,
      winProbabilityAnalysis: `Based on current rate, projecting a final score of ${projected}. Wickets lost: ${match.wickets}/10.`,
      tacticalKey: match.overs >= 15 ? "ATTACK CRATE NOW" : "CONSOLIDATE ROTATION"
    };
  } else {
    // Chasing
    const reqRR = ballsRemaining > 0 ? ((runsNeeded / ballsRemaining) * 6).toFixed(2) : '0';
    const isCrisis = parseFloat(reqRR) > 11;
    return {
      headline: isCrisis ? "PRESSURE RATIO MAXIMUM" : "CHASE PATTERN ENGAGED",
      commentary: `${match.striker?.name || 'Batsman'} faces ${match.currentBowler?.name || 'Bowler'} with ${runsNeeded} runs required off ${ballsRemaining} deliveries.`,
      confidence: 88,
      winProbabilityAnalysis: `Chaser requires ${reqRR} runs per over with ${10 - match.wickets} wickets remaining in bank.`,
      tacticalKey: isCrisis ? "LAUNCH BOUNDARIES" : "SECURE GAP SINGLES"
    };
  }
}

// Serve Frontend using Vite Dev Mode in development & Dist folder in production
const isProduction = process.env.NODE_ENV === 'production';
const PORT = 3000;

async function startServer() {
  if (!isProduction) {
    console.log('Starting Express Server in DEVELOPMENT mode with Vite Middleware...');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    console.log('Starting Express Server in PRODUCTION mode...');
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Express custom server listening on port ${PORT}`);
  });
}

startServer();
