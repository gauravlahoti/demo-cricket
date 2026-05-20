import { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Zap,
  RotateCcw,
  AlertCircle,
  BarChart3,
  Users,
  Award,
  TrendingUp,
  Flame,
  ShieldAlert,
  ChevronRight,
  Database,
  Cpu,
  Tv,
  Activity
} from 'lucide-react';
import { TEAMS, SCENARIOS } from './data';
import { MatchState, BallEvent, Player, Team, AiCommentaryResponse } from './types';
import {
  simulateBall,
  computeWinProbability,
  getWinProbabilityFactors,
  selectNextBowler,
  selectNextBatsman,
  initializeMatchFromScenario,
  createDefaultMatch
} from './matchEngine';

export default function App() {
  // Scenario selector
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(SCENARIOS[0].id);
  
  // Primary match state
  const [matchState, setMatchState] = useState<MatchState>(() =>
    initializeMatchFromScenario(SCENARIOS[0])
  );

  // Simulation controls
  const [aggressiveness, setAggressiveness] = useState<number>(3); // 1 to 5 (3 is balanced)
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [simSpeed, setSimSpeed] = useState<number>(3000); // ms per ball
  const [activeTab, setActiveTab] = useState<'hud' | 'squads'>('hud');
  const [selectedSquadCode, setSelectedSquadCode] = useState<string>('CSK');

  // AI Tactical commentary state
  const [aiAnalysis, setAiAnalysis] = useState<AiCommentaryResponse>({
    headline: "HUD TELEMETRY SECURED",
    commentary: "Tactical strategic metrics loaded. Begin bowling simulation to receive direct AI insight.",
    confidence: 100,
    winProbabilityAnalysis: "Calculated base win probability based on initial squad rosters.",
    tacticalKey: "ACQUIRING STRATEGIC TELEMETRY"
  });
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // For micro-vibrations and highlights on outcomes
  const [showOutcomeFlash, setShowOutcomeFlash] = useState<boolean>(false);
  const [latestOutcome, setLatestOutcome] = useState<BallEvent | null>(null);

  // Audio effect toggle (synthesizer beep)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Auto-interval play loop
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isPlaying && !matchState.isGameOver) {
      timer = setInterval(() => {
        handleSimulateBall();
      }, simSpeed);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPlaying, simSpeed, matchState]);

  // Handle Scenario trigger
  const handleLoadScenario = (scenarioId: string) => {
    const sc = SCENARIOS.find(s => s.id === scenarioId);
    if (sc) {
      setSelectedScenarioId(scenarioId);
      const newState = initializeMatchFromScenario(sc);
      setMatchState(newState);
      setIsPlaying(false);
      setLatestOutcome(null);
      triggerAiAnalysis(newState);
    }
  };

  // Sound generator
  const playBeep = (freq: number, type: 'sine' | 'square' | 'sawtooth', duration: number) => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = type;
      oscillator.frequency.value = freq;
      gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) {
      // Audio not permitted yet
    }
  };

  // Simulate a single physical ball delivery
  const handleSimulateBall = () => {
    if (matchState.isGameOver) return;

    setMatchState(prev => {
      // Simulate ball details
      const ballResult = simulateBall(prev, aggressiveness);
      const isExtra = ballResult.outcome === 'Wd' || ballResult.outcome === 'Nb';
      
      let nextScore = prev.score + ballResult.runs;
      let nextWickets = prev.wickets;
      let nextOvers = prev.overs;
      let nextBallsInOver = prev.ballsInOver;

      let nextStrikerRuns = prev.strikerRuns;
      let nextStrikerBalls = prev.strikerBalls;
      let nextStrikerFours = prev.strikerFours;
      let nextStrikerSixes = prev.strikerSixes;

      let nextNonStrikerRuns = prev.nonStrikerRuns;
      let nextNonStrikerBalls = prev.nonStrikerBalls;
      let nextNonStrikerFours = prev.nonStrikerFours;
      let nextNonStrikerSixes = prev.nonStrikerSixes;

      let nextBowlerOvers = prev.bowlerOvers;
      let nextBowlerWickets = prev.bowlerWickets;
      let nextBowlerRuns = prev.bowlerRuns + ballResult.runs;
      let nextBowlerBalls = prev.bowlerBalls;

      let nextPartnershipRuns = prev.partnershipRuns + ballResult.runs;
      let nextPartnershipBalls = prev.partnershipBalls;

      // Update batter scores
      if (!isExtra) {
        nextStrikerBalls += 1;
        nextPartnershipBalls += 1;
        if (ballResult.runs === 4) nextStrikerFours += 1;
        if (ballResult.runs === 6) nextStrikerSixes += 1;
      }
      nextStrikerRuns += (ballResult.runs - (isExtra ? 1 : 0)); // subtract the extra run which goes to team extra, though in simple simulated mode runs represents total added. We attribute to batsman for engagement excitement.

      if (ballResult.isWicket) {
        nextWickets += 1;
        nextBowlerWickets += 1;
      }

      // Update bowler parameters
      if (!isExtra) {
        nextBowlerBalls += 1;
        nextBallsInOver += 1;
        if (nextBallsInOver === 6) {
          nextOvers += 1;
          nextBallsInOver = 0;
          // Calculate bowler completed overs representation
          nextBowlerOvers = Math.floor(nextBowlerBalls / 6) + (nextBowlerBalls % 6) / 10;
        } else {
          nextBowlerOvers = Math.floor(nextBowlerBalls / 6) + (nextBowlerBalls % 6) / 10;
        }
      }

      // Outcome and state variables
      let nextStriker = prev.striker;
      let nextNonStriker = prev.nonStriker;
      let nextBowler = prev.currentBowler;

      // Handle batsmen crossing strike on odd runs scored
      if (ballResult.runs === 1 || ballResult.runs === 3) {
        // Swap strikers
        const temp = nextStriker;
        nextStriker = nextNonStriker;
        nextNonStriker = temp;

        // Swap their live running metrics so strikers and non strikers scorecards map correctly
        const tempRuns = nextStrikerRuns;
        nextStrikerRuns = nextNonStrikerRuns;
        nextNonStrikerRuns = tempRuns;

        const tempBalls = nextStrikerBalls;
        nextStrikerBalls = nextNonStrikerBalls;
        nextNonStrikerBalls = tempBalls;

        const tempFours = nextStrikerFours;
        nextStrikerFours = nextNonStrikerFours;
        nextNonStrikerFours = tempFours;

        const tempSixes = nextStrikerSixes;
        nextStrikerSixes = nextNonStrikerSixes;
        nextNonStrikerSixes = tempSixes;
      }

      // If wicket down, recruit next batsman if wickets < 10
      if (ballResult.isWicket) {
        playBeep(220, 'sawtooth', 0.85); // dramatic deeper tone
        if (nextWickets < 10) {
          const nextIn = selectNextBatsman(prev.battingTeam, prev.striker.id, prev.nonStriker.id, nextWickets);
          nextStriker = nextIn;
          nextStrikerRuns = 0;
          nextStrikerBalls = 0;
          nextStrikerFours = 0;
          nextStrikerSixes = 0;
          nextPartnershipRuns = 0;
          nextPartnershipBalls = 0;
        }
      } else {
        // Play optimistic cricket game tones
        if (ballResult.runs === 6) {
          playBeep(880, 'sine', 0.4);
          setTimeout(() => playBeep(1100, 'sine', 0.3), 100);
        } else if (ballResult.runs === 4) {
          playBeep(659, 'sine', 0.3);
          setTimeout(() => playBeep(880, 'sine', 0.2), 120);
        } else if (ballResult.runs > 0) {
          playBeep(523, 'sine', 0.15);
        } else {
          playBeep(330, 'square', 0.08); // simple dot ball tick
        }
      }

      // Switch bowler at the end of completed over
      if (nextBallsInOver === 0 && !isExtra && nextOvers > prev.overs) {
        const freshBowler = selectNextBowler(prev.bowlingTeam, prev.currentBowler.id);
        nextBowler = freshBowler;
        nextBowlerOvers = 0;
        nextBowlerBalls = 0;
        nextBowlerWickets = 0;
        nextBowlerRuns = 0;
      }

      // Check for match end criteria (20 Overs completed or all out, or chase target achieved/failed)
      let gameOver = false;
      let outcomeDesc = '';

      if (prev.innings === 1) {
        if (nextWickets >= 10 || nextOvers >= prev.totalOvers) {
          gameOver = true;
          outcomeDesc = `First innings terminated. Target set: ${nextScore + 1} runs.`;
        }
      } else {
        // Second innings chase parameters
        const runsTarget = prev.target || 180;
        if (nextScore >= runsTarget) {
          gameOver = true;
          outcomeDesc = `${prev.battingTeam.fullName} won the championship duel by ${10 - nextWickets} wickets!`;
        } else if (nextWickets >= 10) {
          gameOver = true;
          outcomeDesc = `${prev.bowlingTeam.fullName} won by ${runsTarget - 1 - nextScore} runs in a classic finale!`;
        } else if (nextOvers >= prev.totalOvers) {
          gameOver = true;
          if (nextScore === runsTarget - 1) {
            outcomeDesc = `SCORES EQUALED! A legendary T20 Super Over is declared to settle the championship!`;
          } else {
            outcomeDesc = `${prev.bowlingTeam.fullName} won by ${runsTarget - 1 - nextScore} runs. Exceptional safety bowl.`;
          }
        }
      }

      const event: BallEvent = {
        overNumber: prev.overs,
        ballNumber: prev.ballsInOver + 1,
        outcome: ballResult.outcome,
        runs: ballResult.runs,
        batterName: prev.striker.name,
        bowlerName: prev.currentBowler.name,
        commentary: ballResult.commentary,
        winProbBefore: computeWinProbability(prev),
        winProbAfter: 50, // Updated iteratively below
        isBoundary: ballResult.isBoundary,
        isWicket: ballResult.isWicket
      };

      const updatedHistory = [event, ...prev.recentHistory].slice(0, 25);
      
      const nextState: MatchState = {
        ...prev,
        score: nextScore,
        wickets: nextWickets,
        overs: nextOvers,
        ballsInOver: nextBallsInOver,
        striker: nextStriker,
        nonStriker: nextNonStriker,
        currentBowler: nextBowler,
        strikerRuns: nextStrikerRuns,
        strikerBalls: nextStrikerBalls,
        strikerFours: nextStrikerFours,
        strikerSixes: nextStrikerSixes,
        nonStrikerRuns: nextNonStrikerRuns,
        nonStrikerBalls: nextNonStrikerBalls,
        nonStrikerFours: nextNonStrikerFours,
        nonStrikerSixes: nextNonStrikerSixes,
        bowlerOvers: nextBowlerOvers,
        bowlerWickets: nextBowlerWickets,
        bowlerRuns: nextBowlerRuns,
        bowlerBalls: nextBowlerBalls,
        partnershipRuns: nextPartnershipRuns,
        partnershipBalls: nextPartnershipBalls,
        recentHistory: updatedHistory,
        currentOverBalls: isExtra ? prev.currentOverBalls : [...prev.currentOverBalls, event],
        isGameOver: gameOver,
        gameOutcome: outcomeDesc
      };

      // Clear current over balls tracker if it's a freshly completed over
      if (nextBallsInOver === 0 && !isExtra && nextOvers > prev.overs) {
        nextState.currentOverBalls = [];
      }

      // Calculate win probability after outcome
      const postProbability = computeWinProbability(nextState);
      event.winProbAfter = postProbability;

      // Trigger telemetry flashes
      setLatestOutcome(event);
      setShowOutcomeFlash(true);
      setTimeout(() => setShowOutcomeFlash(false), 800);

      if (gameOver) {
        setIsPlaying(false);
      }

      // Trigger server-side AI evaluation on notable events
      if (ballResult.isBoundary || ballResult.isWicket || Math.random() < 0.4 || gameOver) {
        triggerAiAnalysis(nextState);
      }

      return nextState;
    });
  };

  // Launch Server Side API call to get strategic AI insights from gemini model
  const triggerAiAnalysis = async (state: MatchState) => {
    setIsAiLoading(true);
    setAiError(null);
    try {
      const response = await fetch('/api/ai-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(state)
      });
      if (!response.ok) {
        throw new Error('API server reported failure');
      }
      const data: AiCommentaryResponse = await response.json();
      setAiAnalysis(data);
    } catch (e: any) {
      console.error('Failed fetching telemetry strategic insight:', e);
      setAiError(e.message || 'Connection lost');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Switch squads tab
  const handleSquadTeamSelect = (code: string) => {
    setSelectedSquadCode(code);
  };

  // Manual reset of match to full default (CSK vs MI starting from Over 0)
  const handleMatchReset = () => {
    const sc = SCENARIOS.find(s => s.id === selectedScenarioId);
    if (sc) {
      const resetState = initializeMatchFromScenario(sc);
      setMatchState(resetState);
    } else {
      const resetState = createDefaultMatch('CSK', 'MI');
      setMatchState(resetState);
    }
    setIsPlaying(false);
    setLatestOutcome(null);
    setAiAnalysis({
      headline: "HUD TELEMETRY SECURED",
      commentary: "Match simulation state rebooted. Launch ball deliveries to acquire live tactical evaluation.",
      confidence: 100,
      winProbabilityAnalysis: "Calculated base win probability based on initial squad rosters.",
      tacticalKey: "ACQUIRING STRATEGIC TELEMETRY"
    });
  };

  // Calculations for display
  const completedBalls = matchState.overs * 6 + matchState.ballsInOver;
  const currentCRR = completedBalls > 0 ? ((matchState.score / completedBalls) * 6).toFixed(2) : '0.00';
  
  // Chasing requirements
  const runsNeeded = matchState.target ? matchState.target - matchState.score : 0;
  const ballsRemaining = Math.max(0, 120 - completedBalls);
  const currentRRR = ballsRemaining > 0 && runsNeeded > 0 ? ((runsNeeded / ballsRemaining) * 6).toFixed(2) : '0.00';
  const showChaseStats = matchState.innings === 2 && matchState.target;

  // Win probability percentages
  const battingWinProb = computeWinProbability(matchState);
  const bowlingWinProb = 100 - battingWinProb;

  // Match scenario details
  const activeScenario = SCENARIOS.find(s => s.id === selectedScenarioId);

  return (
    <div id="full_app_container" className="min-h-screen relative overflow-hidden flex flex-col font-body pb-16">
      {/* Decorative Overlays */}
      <div className="scanlines"></div>
      <div className="vignette-ambient"></div>
      <div className="glow-bottom"></div>

      {/* Modern High-End Broadcast Header */}
      <header id="broadcast_top_header" className="w-full border-b border-[rgba(0,229,255,0.15)] bg-slate-950/80 backdrop-blur-md px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 z-40">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-4 h-4 rounded-full bg-[#00E5FF] wicket-flash"></div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-hud text-xs uppercase tracking-widest text-[#00E5FF]">SYSTEM LIVE</span>
              <span className="text-[10px] bg-sky-950 text-cyan-400 border border-cyan-800/60 px-1.5 py-0.2 rounded font-mono font-bold tracking-wider">T20</span>
            </div>
            <h1 className="font-display text-2xl tracking-normal uppercase text-white">
              TITAN CHAMPIONS <span className="text-[#00E5FF] font-light">BROADCAST HUD</span>
            </h1>
          </div>
        </div>

        {/* Action center scenarios selector */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-hud text-xs text-[#7F8AA3] uppercase tracking-wider hidden lg:inline mr-1">SCENARIOS:</span>
          {SCENARIOS.map(sc => (
            <button
              id={`btn_scenario_${sc.id}`}
              key={sc.id}
              onClick={() => handleLoadScenario(sc.id)}
              className={`px-3 py-1.5 rounded-lg font-hud text-xs uppercase tracking-wider transition-all duration-300 border cursor-pointer ${
                selectedScenarioId === sc.id
                  ? 'bg-cyan-500/10 border-[#00E5FF] text-[#00E5FF] shadow-[0_0_15px_rgba(0,229,255,0.2)]'
                  : 'bg-slate-900/60 border-slate-800 text-[#7F8AA3] hover:text-[#EAF1FF] hover:border-slate-700'
              }`}
            >
              {sc.title.split(' ')[0]} {sc.title.split(' ')[1] || ''}
            </button>
          ))}
        </div>

        {/* Global Sound Toggler */}
        <div className="flex items-center gap-4">
          <button
            id="sound_toggle_btn"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="text-xs font-hud bg-slate-900 border border-slate-800 px-3 py-1 rounded text-[#7F8AA3] hover:text-white hover:border-slate-700 transition"
          >
            SOUND: <span className={soundEnabled ? 'text-[#3DFFA2]' : 'text-[#FF5470]'}>{soundEnabled ? 'ON' : 'OFF'}</span>
          </button>
          <div className="hidden md:flex flex-col items-end">
            <span className="font-hud text-[10px] text-[#7F8AA3] tracking-widest uppercase">STADIUM MATRIX</span>
            <span className="font-mono text-xs text-[#EAF1FF]">UTC / IPL CHASSIS</span>
          </div>
        </div>
      </header>

      {/* Main Container Layout */}
      <main id="hud_main_grid" className="max-w-7xl w-full mx-auto px-4 md:px-6 py-6 flex-1 flex flex-col gap-6 z-10">

        {/* Active Scenario Banner */}
        {activeScenario && (
          <div className="glass-panel p-4 flex flex-col md:flex-row items-center gap-4 border-l-4 border-l-[#FFC542]">
            <div className="bg-[#FFC542]/10 p-2.5 rounded-lg border border-[#FFC542]/30 flex items-center justify-center shrink-0">
              <AlertCircle className="w-6 h-6 text-[#FFC542]" />
            </div>
            <div className="flex-1 text-center md:text-left">
              <h4 className="font-hud text-sm uppercase text-[#FFC542] tracking-wider mb-0.5">{activeScenario.title}</h4>
              <p className="text-xs text-[#7F8AA3] leading-relaxed font-body font-light">
                {activeScenario.description}
              </p>
            </div>
            <div className="flex items-center gap-2 bg-slate-950/40 p-2 border border-slate-800 rounded-lg shrink-0">
              <span className="font-hud text-[10px] text-zinc-400">STATE:</span>
              <span className="text-xs font-hud bg-cyan-950/60 border border-cyan-800/40 text-cyan-400 px-2 py-0.5 rounded uppercase">
                {activeScenario.phase}
              </span>
            </div>
          </div>
        )}

        {/* View Selection Tabs */}
        <div id="navigation_tabs" className="flex items-center border-b border-slate-900 gap-1">
          <button
            id="tab_hud_selector"
            onClick={() => setActiveTab('hud')}
            className={`px-5 py-3 font-hud text-sm uppercase tracking-wider flex items-center gap-2 transition cursor-pointer relative ${
              activeTab === 'hud' ? 'text-[#00E5FF]' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="w-4 h-4" />
            TELEMETRY HUD
            {activeTab === 'hud' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#00E5FF]"></div>}
          </button>
          <button
            id="tab_squads_selector"
            onClick={() => setActiveTab('squads')}
            className={`px-5 py-3 font-hud text-sm uppercase tracking-wider flex items-center gap-2 transition cursor-pointer relative ${
              activeTab === 'squads' ? 'text-[#00E5FF]' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            SQUADS & STATISTICS
            {activeTab === 'squads' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#00E5FF]"></div>}
          </button>
        </div>

        {/* TAB 1: RADAR HUD SCREEN */}
        {activeTab === 'hud' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* LEFT COLUMN: LIVE SCOREBOARD & PLAY ENGINE (8 columns) */}
            <div className="lg:col-span-8 flex flex-col gap-6">

              {/* HERO SCORE BLOCK */}
              <div
                id="hero_score_panel"
                className={`glass-panel p-6 relative flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all duration-300 ${
                  showOutcomeFlash
                    ? latestOutcome?.isWicket
                      ? 'glass-panel-wicket'
                      : latestOutcome?.runs && latestOutcome?.runs >= 4
                      ? 'glass-panel-active'
                      : ''
                    : ''
                }`}
              >
                {/* Score panel backdrop graphics */}
                <div className="absolute top-0 right-0 opacity-5 pointer-events-none p-4">
                  <Database className="w-48 h-48 text-[#00E5FF] font-light" />
                </div>

                {/* Left side: Batting vs Bowling indicators and big scores */}
                <div className="flex-1">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span
                      className="font-display font-bold text-lg px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: matchState.battingTeam.primaryColor,
                        color: matchState.battingTeam.textColor,
                      }}
                    >
                      {matchState.battingTeam.code}
                    </span>
                    <span className="text-slate-500 font-hud text-xs">VS</span>
                    <span
                      className="font-hud text-xs font-semibold px-2 py-0.5 rounded border"
                      style={{
                        borderColor: matchState.bowlingTeam.primaryColor,
                        color: matchState.bowlingTeam.primaryColor,
                      }}
                    >
                      {matchState.bowlingTeam.code}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] animate-pulse"></span>
                    <span className="font-hud text-[10px] text-[#00E5FF] uppercase tracking-widest animate-pulse-glow">LIVE SIMULATED INNINGS {matchState.innings}</span>
                  </div>

                  {/* Large scores */}
                  <div className="flex items-baseline gap-4">
                    <span className="font-display text-6xl md:text-7xl leading-none text-white select-none">
                      {matchState.score}<span className="text-[#FF2D9B] font-light text-4xl">/{matchState.wickets}</span>
                    </span>
                    <div className="flex flex-col">
                      <span className="font-display text-3xl text-slate-300">
                        {matchState.overs}.{matchState.ballsInOver} <span className="text-sm font-hud uppercase text-[#7F8AA3]">OVERS</span>
                      </span>
                      <span className="text-xs text-slate-500 font-mono tracking-wider">
                        CRR: <span className="text-[#EAF1FF] font-bold font-mono">{currentCRR}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right side: Win metrics, Need runs, Target */}
                <div className="flex flex-col md:items-end justify-center border-t md:border-t-0 md:border-l border-[rgba(255,255,255,0.06)] pt-4 md:pt-0 md:pl-6/12 shrink-0 md:w-56 gap-2">
                  {showChaseStats && !matchState.isGameOver ? (
                    <div className="text-left md:text-right">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded font-hud text-xs uppercase tracking-wider mb-1">
                        <Flame className="w-3.5 h-3.5" />
                        DEATH TARGET
                      </div>
                      <p className="font-display text-3xl text-[#FFC542] tracking-tight leading-none">
                        NEED {runsNeeded} <span className="text-xs font-hud text-slate-400">RUNS</span>
                      </p>
                      <p className="text-xs font-hud text-slate-400">
                        OFF <span className="text-[#EAF1FF] font-bold font-mono">{ballsRemaining}</span> BALLS REMAINING
                      </p>
                      <p className="text-[11px] text-cyan-400 uppercase font-mono tracking-wider mt-1">
                        REQ RR: <span className="text-white font-bold">{currentRRR}</span> RPO
                      </p>
                    </div>
                  ) : matchState.isGameOver ? (
                    <div className="text-left md:text-right">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#3DFFA2]/10 border border-[#3DFFA2]/30 text-[#3DFFA2] rounded font-hud text-xs uppercase tracking-wider mb-1">
                        <Award className="w-3.5 h-3.5" />
                        FINALE SETTLED
                      </div>
                      <p className="font-hud text-xs text-[#3DFFA2] font-semibold leading-relaxed">
                        {matchState.gameOutcome}
                      </p>
                    </div>
                  ) : (
                    <div className="text-left md:text-right">
                      <span className="font-hud text-xs text-slate-400 tracking-wider">PROJECTED SCORE</span>
                      <p className="font-display text-4xl text-cyan-300">
                        {completedBalls > 0 ? Math.round((matchState.score / completedBalls) * 20 * 6) : 180}
                      </p>
                      <span className="text-[10px] text-slate-500 font-mono">STABILIZING FIRST INNINGS RATIO</span>
                    </div>
                  )}

                  {/* Target specification tag */}
                  {matchState.target && (
                    <div className="bg-slate-900 border border-slate-800 px-3 py-1 rounded text-xs text-left md:text-right">
                      <span className="text-[#7F8AA3] font-hud text-[10px]">CHASING TARGET:</span>{' '}
                      <span className="font-mono font-bold text-white text-sm">{matchState.target}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* BATSMEN AND BOWLER GAME IN PROGRESS STATISTICS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Active Batters Panel */}
                <div className="glass-panel p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-2">
                    <span className="font-hud text-xs text-slate-400 uppercase tracking-wider">ACTIVE BATSMEN</span>
                    <span className="font-hud text-[10px] text-[#00E5FF] uppercase">STRIKE MATRIX</span>
                  </div>

                  {/* Striker */}
                  <div className="flex items-center justify-between p-2 rounded bg-cyan-950/15 border border-cyan-900/30">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded bg-cyan-400 animate-pulse"></div>
                      <div>
                        <p className="font-hud text-xs text-white uppercase">{matchState.striker.name}</p>
                        <span className="text-[10px] text-slate-500">{matchState.striker.role}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-lg text-white">
                        {matchState.strikerRuns} <span className="text-xs text-slate-400">({matchState.strikerBalls})</span>
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        SR: {matchState.strikerBalls > 0 ? Math.round((matchState.strikerRuns / matchState.strikerBalls) * 100) : 0} | 4s: {matchState.strikerFours} | 6s: {matchState.strikerSixes}
                      </p>
                    </div>
                  </div>

                  {/* NonStriker */}
                  <div className="flex items-center justify-between p-2 rounded bg-slate-950/20 border border-slate-900">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded bg-slate-700"></div>
                      <div>
                        <p className="font-hud text-xs text-slate-450 uppercase">{matchState.nonStriker.name}</p>
                        <span className="text-[10px] text-slate-500">{matchState.nonStriker.role}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-lg text-slate-350">
                        {matchState.nonStrikerRuns} <span className="text-xs text-slate-500">({matchState.nonStrikerBalls})</span>
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        SR: {matchState.nonStrikerBalls > 0 ? Math.round((matchState.nonStrikerRuns / matchState.nonStrikerBalls) * 100) : 0} | 4s: {matchState.nonStrikerFours} | 6s: {matchState.nonStrikerSixes}
                      </p>
                    </div>
                  </div>

                  {/* Partnership Rate */}
                  <div className="mt-1 pt-2 border-t border-[rgba(255,255,255,0.04)] flex justify-between items-center">
                    <span className="font-hud text-[10px] text-[#7F8AA3] uppercase">CURRENT PARTNERSHIP</span>
                    <span className="font-display text-sm text-cyan-300">
                      {matchState.partnershipRuns} <span className="text-xs text-slate-500">runs off</span> {matchState.partnershipBalls} <span className="text-xs text-slate-500">balls</span>
                    </span>
                  </div>
                </div>

                {/* Active Bowler Panel */}
                <div className="glass-panel p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-2">
                    <span className="font-hud text-xs text-slate-400 uppercase tracking-wider">ACTIVE BOWLER</span>
                    <span className="font-hud text-[10px] text-[#00E5FF] uppercase">SPEED TELEMETRY</span>
                  </div>

                  {/* Bowler profile card */}
                  <div className="flex items-center justify-between p-2 rounded bg-rose-950/10 border border-rose-900/10">
                    <div className="flex items-center gap-2">
                      <div className="w-2 w-2 rounded bg-rose-500"></div>
                      <div>
                        <p className="font-hud text-xs text-white uppercase">{matchState.currentBowler.name}</p>
                        <span className="text-[10px] text-slate-500">{matchState.currentBowler.bowlingStyle}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-xl text-white">
                        {matchState.bowlerWickets} <span className="text-xs text-rose-450">/ {matchState.bowlerRuns}</span>
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        OVERS: {matchState.bowlerOvers} | ECON: {matchState.bowlerBalls > 0 ? ((matchState.bowlerRuns / matchState.bowlerBalls) * 6).toFixed(2) : '0.00'}
                      </p>
                    </div>
                  </div>

                  {/* Over progression ticker */}
                  <div className="flex-1 flex flex-col justify-end">
                    <p className="font-hud text-[10px] text-[#7F8AA3] uppercase mb-1.5">THIS OVER PROGRESS:</p>
                    <div className="flex items-center gap-2">
                      {Array.from({ length: 6 }).map((_, idx) => {
                        const ballOccurred = matchState.currentOverBalls[idx];
                        const isActive = idx === matchState.ballsInOver;
                        
                        let dotBg = 'bg-slate-900/60 border-slate-800 text-slate-600';
                        if (isActive && !matchState.isGameOver) {
                          dotBg = 'bg-cyan-500/10 border-[#00E5FF] text-cyan-400 ring-2 ring-cyan-500/20';
                        } else if (ballOccurred) {
                          if (ballOccurred.outcome === 'W') {
                            dotBg = 'bg-rose-500 text-white border-rose-400 font-bold';
                          } else if (ballOccurred.outcome === '6') {
                            dotBg = 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold';
                          } else if (ballOccurred.outcome === '4') {
                            dotBg = 'bg-teal-500 text-slate-950 border-teal-400 font-bold';
                          } else if (ballOccurred.runs > 0) {
                            dotBg = 'bg-slate-800 border-slate-700 text-white font-mono text-[10px]';
                          } else {
                            dotBg = 'bg-slate-900 border-slate-800 text-[#7F8AA3]'; // dot ball
                          }
                        }

                        return (
                          <div
                            key={idx}
                            className={`w-8 h-8 rounded-full border flex items-center justify-center font-display text-xs tracking-tight transition-all duration-300 ${dotBg}`}
                          >
                            {ballOccurred ? ballOccurred.outcome : idx + 1}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* SIMULATION OPERATOR CONTROL CONSOLE */}
              <div className="glass-panel p-5 relative border-t-2 border-t-[#00E5FF]/40">
                <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-[#00E5FF]" />
                    <span className="font-hud text-sm text-[#00E5FF] uppercase tracking-widest">TACTICAL TELEMETRY OPERATOR CONSOLE</span>
                  </div>
                  <span className="text-[10px] text-[#7F8AA3] font-hud uppercase">MANAGE CRICKET SIMULATOR</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                  
                  {/* Aggressiveness Level slider */}
                  <div className="md:col-span-4 flex flex-col gap-2">
                    <label id="lbl_aggressiveness" className="font-hud text-xs text-slate-400 uppercase tracking-wider flex justify-between">
                      <span>BATTER AGGRESSION Lvl:</span>
                      <span className="text-[#00E5FF] font-bold font-mono">
                        {aggressiveness === 1 && '1 - DEFENSIVE'}
                        {aggressiveness === 2 && '2 - ROTATIVE'}
                        {aggressiveness === 3 && '3 - BALANCED'}
                        {aggressiveness === 4 && '4 - AGGRESSIVE'}
                        {aggressiveness === 5 && '5 - TOTAL CARNAGE! 🔥'}
                      </span>
                    </label>
                    <input
                      id="aggressiveness_slider"
                      type="range"
                      min="1"
                      max="5"
                      step="1"
                      value={aggressiveness}
                      onChange={(e) => setAggressiveness(parseInt(e.target.value))}
                      className="w-full accent-[#00E5FF] bg-slate-900 border border-slate-800 rounded-lg cursor-pointer h-2"
                    />
                    <span className="text-[10px] text-slate-500 font-body font-light">
                      Higher values increase boundary rate, run rates, and risk of wickets dramatically.
                    </span>
                  </div>

                  {/* Operator Buttons */}
                  <div className="md:col-span-8 flex flex-wrap items-center gap-3 md:justify-end">
                    
                    {/* Auto Simulator speed button */}
                    <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1">
                      <span className="font-hud text-[9px] text-zinc-500 px-2">SPEED:</span>
                      <button
                        onClick={() => setSimSpeed(4500)}
                        className={`px-2 py-1 text-[10px] font-mono rounded ${simSpeed === 4500 ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-white'}`}
                      >
                        SLOW
                      </button>
                      <button
                        onClick={() => setSimSpeed(3000)}
                        className={`px-2 py-1 text-[10px] font-mono rounded ${simSpeed === 3000 ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-white'}`}
                      >
                        NORM
                      </button>
                      <button
                        onClick={() => setSimSpeed(1500)}
                        className={`px-2 py-1 text-[10px] font-mono rounded ${simSpeed === 1500 ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-white'}`}
                      >
                        FAST
                      </button>
                    </div>

                    {/* Simulation trigger buttons */}
                    <button
                      id="btn_auto_simulate"
                      disabled={matchState.isGameOver}
                      onClick={() => setIsPlaying(!isPlaying)}
                      className={`px-4 py-2.5 rounded-lg font-hud text-xs uppercase tracking-wider flex items-center gap-2 transition cursor-pointer min-w-[130px] border ${
                        isPlaying
                          ? 'bg-[#FF5470]/10 border-[#FF5470] text-[#FF5470]'
                          : 'bg-emerald-500/10 border-emerald-500 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-30 disabled:pointer-events-none'
                      }`}
                    >
                      {isPlaying ? (
                        <>
                          <Pause className="w-4 h-4 shrink-0" />
                          PAUSE LIVE
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 shrink-0" />
                          AUTO PLAY
                        </>
                      )}
                    </button>

                    <button
                      id="btn_simulate_single_ball"
                      disabled={matchState.isGameOver || isPlaying}
                      onClick={handleSimulateBall}
                      className="px-4 py-2.5 bg-[#00E5FF] text-slate-950 font-hud text-xs uppercase tracking-wider rounded-lg font-bold hover:bg-[#a6f7ff] active:scale-95 transition flex items-center gap-2 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                    >
                      <Zap className="w-4 h-4 shrink-0 fill-current" />
                      SIMULATE BALL
                    </button>

                    <button
                      id="btn_reset_simulation"
                      onClick={handleMatchReset}
                      className="px-4 py-2.5 bg-slate-900 border border-slate-800 text-[#7F8AA3] font-hud text-xs uppercase tracking-wider rounded-lg hover:text-white hover:border-slate-700 transition flex items-center gap-2 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      RESET OVER
                    </button>
                  </div>
                </div>
              </div>

              {/* LIVE PLAY COMMENTARY TICKER CARDS */}
              <div className="glass-panel p-5 flex flex-col gap-4">
                <span className="font-hud text-xs text-slate-400 uppercase tracking-wider">BALL-BY-BALL BROADCAST TELEMETRY CHRONOLOGY</span>
                
                <div className="max-h-72 overflow-y-auto flex flex-col gap-3 pr-2 scrollbar-thin scrollbar-thumb-cyan-500/20 scrollbar-track-slate-950 custom-scrollbar">
                  {matchState.recentHistory.length === 0 ? (
                    <div className="text-center py-8 border border-dashed border-slate-800/80 rounded-lg text-slate-500 text-xs">
                      No deliveries simulated yet. Engage the Simulator Console buttons to generate cricket matches.
                    </div>
                  ) : (
                    matchState.recentHistory.map((item, idx) => {
                      let itemBorder = 'border-[rgba(255,255,255,0.04)]';
                      let colorTag = 'text-slate-400';
                      let iconColor = 'bg-slate-900 text-slate-500';

                      if (item.outcome === 'W') {
                        itemBorder = 'border-[#FF2D9B]/30 bg-[#FF2D9B]/5';
                        colorTag = 'text-[#FF2D9B] font-bold';
                        iconColor = 'bg-[#FF2D9B]/20 text-[#FF2D9B]';
                      } else if (item.outcome === '6') {
                        itemBorder = 'border-[#00E5FF]/30 bg-[#00E5FF]/5';
                        colorTag = 'text-[#00E5FF] font-bold';
                        iconColor = 'bg-[#00E5FF]/20 text-[#00E5FF]';
                      } else if (item.outcome === '4') {
                        itemBorder = 'border-emerald-500/30 bg-emerald-500/5';
                        colorTag = 'text-[#3DFFA2] font-semibold';
                        iconColor = 'bg-emerald-500/20 text-[#3DFFA2]';
                      }

                      return (
                        <div
                          key={idx}
                          className={`p-3 border rounded-lg flex items-start gap-3 transition-all duration-300 ${itemBorder}`}
                        >
                          <div className={`w-10 h-10 rounded-full font-display text-sm flex items-center justify-center shrink-0 border border-slate-800 ${iconColor}`}>
                            {item.outcome}
                          </div>
                          <div className="flex-1">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-0.5">
                              <span className="font-hud text-[11px] text-[#7F8AA3] uppercase">
                                OVER {item.overNumber}.{item.ballNumber} | Bowler: <span className="text-slate-200">{item.bowlerName}</span>
                              </span>
                              <span className={`text-[10px] font-mono ${colorTag}`}>
                                CHASER PROB: {item.winProbAfter}%
                              </span>
                            </div>
                            <p className="text-xs text-white leading-relaxed font-body font-light">
                              {item.commentary}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>

            {/* RIGHT COLUMN: AI ANALYSIS & PROBABILITY WIN-GAUGE (4 columns) */}
            <div className="lg:col-span-4 flex flex-col gap-6">

              {/* COGNITIVE AI ANALYTICS PANEL */}
              <div className="glass-panel p-5 relative border-r-2 border-r-[#00E5FF]/50 border-t-2 border-t-[#00E5FF]/40">
                <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-[#00E5FF]" />
                    <span className="font-hud text-sm text-[#00E5FF] uppercase tracking-widest">GEMINI BROADCAST COGNITION</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                    </span>
                    <span className="text-[9px] text-[#00E5FF] font-hud uppercase">ACTIVE ENGINE</span>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  
                  {/* Strategic Alert Badge / Header */}
                  <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-2.5 rounded-lg">
                    <span className="text-[10px] font-hud text-[#7F8AA3] uppercase">TACTICAL FOCUS:</span>
                    <span className="text-xs font-hud text-[#FFC542] tracking-wider uppercase font-bold bg-[#FFC542]/10 px-2 py-0.5 rounded border border-[#FFC542]/30">
                      {aiAnalysis.tacticalKey}
                    </span>
                  </div>

                  {/* Main AI commentary display */}
                  <div className="relative p-4 rounded-xl bg-slate-950/60 border border-[rgba(0,229,255,0.08)]">
                    
                    {/* Glowing corner indicator */}
                    <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[#00E5FF]"></div>
                    <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-[#00E5FF]"></div>

                    {isAiLoading ? (
                      <div className="py-12 flex flex-col items-center justify-center gap-3">
                        <div className="w-8 h-8 rounded-full border-t-2 border-r-2 border-[#00E5FF] animate-spin"></div>
                        <p className="font-hud text-xs text-[#00E5FF] uppercase tracking-widest animate-pulse-glow">DECRYPTING BROADCAST TELEMETRY...</p>
                        <span className="text-[10px] font-mono text-slate-500">querying gemini-3.5-flash</span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <span className="font-hud text-xs text-[#00E5FF] tracking-widest block uppercase border-b border-[rgba(0,229,255,0.08)] pb-1.5 font-bold">
                          // {aiAnalysis.headline}
                        </span>
                        <p className="text-xs text-slate-200 leading-relaxed font-body font-light italic">
                          "{aiAnalysis.commentary}"
                        </p>
                        {aiError && (
                          <div className="mt-2 text-[10px] text-red-400 bg-red-950/20 border border-red-900/40 p-1.5 rounded flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-red-400" />
                            <span>AI Key absent. Displaying simulated analytics model.</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* AI Win Probability telemetry explanation */}
                  <div className="flex flex-col gap-1.5 bg-slate-900/40 border border-slate-900 p-3 rounded-lg">
                    <span className="font-hud text-[10px] text-[#7F8AA3] uppercase">PROBABILITY RATIONALE:</span>
                    <p className="text-xs text-[#EAF1FF] leading-normal font-light">
                      {isAiLoading ? 'Analyzing game indicators...' : aiAnalysis.winProbabilityAnalysis}
                    </p>
                  </div>

                  {/* AI system confidence rating index */}
                  <div className="flex items-center justify-between border-t border-[rgba(255,255,255,0.04)] pt-3 text-xs font-hud">
                    <span className="text-[#7F8AA3] uppercase text-[10px]">COGNITIVE ACCURACY RATIO:</span>
                    <span className="text-[#3DFFA2] font-mono font-bold">
                      {isAiLoading ? '--' : `${aiAnalysis.confidence}% CONG`}
                    </span>
                  </div>

                  <button
                    id="btn_request_analysis"
                    disabled={isAiLoading}
                    onClick={() => triggerAiAnalysis(matchState)}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-[#00E5FF] hover:text-white border border-[rgba(0,229,255,0.12)] hover:border-cyan-500/40 rounded-lg text-xs font-hud uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Tv className="w-3.5 h-3.5" />
                    RE-ANALYZE DUEL SITUATION
                  </button>

                </div>
              </div>

              {/* WIN PROBABILITY GRAPH HUD */}
              <div className="glass-panel p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between pb-1 border-b border-[rgba(255,255,255,0.06)]">
                  <span className="font-hud text-xs text-slate-400 uppercase tracking-wider">SYSTEM WIN PROBABILITY INDICATOR</span>
                  <TrendingUp className="w-4 h-4 text-[#00E5FF]" />
                </div>

                {/* Split probability bar visualizer */}
                <div className="flex flex-col gap-2 mt-2">
                  <div className="flex items-center justify-between text-xs font-hud font-bold uppercase tracking-wider">
                    <span className="text-cyan-400">{matchState.battingTeam.code} {battingWinProb}%</span>
                    <span className="text-rose-500">{matchState.bowlingTeam.code} {bowlingWinProb}%</span>
                  </div>

                  {/* Dual Bar */}
                  <div className="w-full h-3.5 rounded bg-slate-950 flex overflow-hidden border border-slate-800 p-[2px]">
                    <div
                      style={{ width: `${battingWinProb}%` }}
                      className="h-full bg-gradient-to-r from-cyan-600 to-[#00E5FF] transition-all duration-500 rounded-l"
                    ></div>
                    <div
                      style={{ width: `${bowlingWinProb}%` }}
                      className="h-full bg-gradient-to-r from-[#FF2D9B] to-rose-600 transition-all duration-500 rounded-r"
                    ></div>
                  </div>

                  {/* Win predictor logic markers */}
                  <div className="flex flex-col gap-2 mt-2">
                    <span className="font-hud text-[9px] text-[#7F8AA3] uppercase">KEY FLUCTUATION TELEMETRIES:</span>
                    <div className="flex flex-col gap-1.5">
                      {getWinProbabilityFactors(matchState).map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-1.5 text-[10px] text-[#EAF1FF] font-mono leading-tight uppercase font-medium"
                        >
                          <ChevronRight className="w-3 h-3 text-[#00E5FF] shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* BATSMAN AND BOWLER DUEL PROFILES */}
              <div className="glass-panel p-4 flex flex-col gap-3">
                <span className="font-hud text-xs text-slate-400 uppercase tracking-wider border-b border-[rgba(255,255,255,0.06)] pb-1.5">ACTIVE RECRUIT DUEL PROFILE</span>
                
                {/* Batter specifications */}
                <div className="flex flex-col gap-2 bg-slate-950/40 p-2.5 rounded border border-slate-900">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-hud bg-cyan-950/80 text-cyan-400 border border-cyan-800/40 px-2 py-0.5 rounded font-bold uppercase">BAT: {matchState.striker.name}</span>
                    <span className="text-[10px] text-zinc-500 font-mono">CAREER MATCHES: {matchState.striker.matches}</span>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    <div className="flex justify-between mb-1">
                      <span>CAREER RUNS: {matchState.striker.runs}</span>
                      <span>AVG: {matchState.striker.avg}</span>
                      <span>STRIKE RATE: {matchState.striker.sr}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {matchState.striker.strengths.slice(0, 2).map((str, index) => (
                        <span key={index} className="bg-emerald-950/60 border border-emerald-800/30 text-[#3DFFA2] text-[9px] px-1.5 py-0.2 rounded font-hud">{str}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bowler specifications */}
                <div className="flex flex-col gap-2 bg-slate-950/40 p-2.5 rounded border border-slate-900">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-hud bg-rose-950/80 text-rose-400 border border-rose-800/40 px-2 py-0.5 rounded font-bold uppercase">BOWL: {matchState.currentBowler.name}</span>
                    <span className="text-[10px] text-zinc-500 font-mono">CAREER WICKETS: {matchState.currentBowler.wickets}</span>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    <div className="flex justify-between mb-1">
                      <span>STRENGTH: {matchState.currentBowler.strengths[0]}</span>
                      <span>ECONOMY: {matchState.currentBowler.economy || '8.2'}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {matchState.currentBowler.strengths.slice(-2).map((str, index) => (
                        <span key={index} className="bg-rose-955/35 border border-rose-800/30 text-[#FF5470] text-[9px] px-1.5 py-0.2 rounded font-hud">{str}</span>
                      ))}
                    </div>
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* TAB 2: DETAILED FRANCHISE SQUADS & CAREER STATISTICS */}
        {activeTab === 'squads' && (
          <div className="glass-panel p-6 flex flex-col gap-6">
            
            {/* Team selection triggers */}
            <div className="flex flex-wrap gap-3 items-center justify-between pb-4 border-b border-slate-900">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[#00E5FF]" />
                <span className="font-hud text-[#00E5FF] text-sm uppercase tracking-widest">FRANCHISE SQUADS RECONNAISSANCE</span>
              </div>
              <div className="flex items-center gap-2">
                {Object.keys(TEAMS).map(code => {
                  const t = TEAMS[code];
                  return (
                    <button
                      id={`btn_squad_tab_${code}`}
                      key={code}
                      onClick={() => handleSquadTeamSelect(code)}
                      className={`px-4 py-2 font-hud text-xs uppercase tracking-wider rounded border cursor-pointer transition ${
                        selectedSquadCode === code
                          ? 'bg-cyan-500/15 border-cyan-400 text-cyan-400'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {t.logo} {t.fullName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Squad List Grid */}
            <div id="squad_list_grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {TEAMS[selectedSquadCode].squad.map((player) => (
                <div
                  key={player.id}
                  className="bg-slate-950/60 rounded-xl p-4 border border-slate-900 hover:border-cyan-500/20 transition-all duration-300 flex flex-col gap-3 relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/2 rounded-full blur-xl pointer-events-none group-hover:bg-cyan-500/4 transition"></div>
                  
                  {/* Title and style */}
                  <div className="flex justify-between items-start border-b border-[rgba(255,255,255,0.04)] pb-2 mb-1">
                    <div>
                      <h4 className="font-hud text-sm uppercase text-white tracking-widest">{player.name}</h4>
                      <span className="text-[10px] bg-sky-950 text-cyan-400 px-1.5 py-0.2 rounded font-hud">{player.role}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-mono text-zinc-500">STYLE:</span>
                      <p className="text-[10px] text-slate-350 tracking-wide font-mono uppercase">{player.battingStyle}</p>
                    </div>
                  </div>

                  {/* Career numbers */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-900/40 p-2.5 rounded border border-slate-900/60 hover:bg-slate-955 transition">
                    <div className="text-center">
                      <span className="text-[9px] text-[#7F8AA3] font-hud uppercase">MATCHES</span>
                      <p className="font-display text-lg text-white">{player.matches}</p>
                    </div>
                    <div className="text-center">
                      <span className="text-[9px] text-[#7F8AA3] font-hud uppercase">{player.role === 'Bowler' ? 'WICKETS' : 'RUNS'}</span>
                      <p className="font-display text-lg text-cyan-300">
                        {player.role === 'Bowler' ? player.wickets : player.runs}
                      </p>
                    </div>
                    <div className="text-center">
                      <span className="text-[9px] text-[#7F8AA3] font-hud uppercase">{player.role === 'Bowler' ? 'ECONOMY' : 'STRIKE RATE'}</span>
                      <p className="font-display text-lg text-white">
                        {player.role === 'Bowler' ? (player.economy || '7.5') : player.sr}
                      </p>
                    </div>
                  </div>

                  {/* Last 5 match form */}
                  <div>
                    <span className="font-hud text-[10px] text-[#7F8AA3] uppercase block mb-1">RECENT PERFORMANCE INNINGS TREND</span>
                    <div className="flex items-center gap-1.5">
                      {player.form.map((f, i) => (
                        <div
                          key={i}
                          className="bg-slate-900 border border-slate-800 text-[11px] font-mono font-bold w-10 py-1 rounded text-center text-slate-300 hover:border-cyan-500/20 hover:text-white cursor-help"
                          title={`Runs/Wickets scored ${i + 1} innings ago.`}
                        >
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Attributes details */}
                  <div className="grid grid-cols-2 gap-3 mt-1 pt-1.5 border-t border-[rgba(255,255,255,0.04)]">
                    <div>
                      <span className="font-hud text-[9px] text-[#7F8AA3] uppercase">KEY WEAPON STRENGTHS:</span>
                      <ul className="flex flex-col gap-0.5 mt-0.5">
                        {player.strengths.slice(0, 2).map((st, i) => (
                          <li key={i} className="text-[10px] text-emerald-400 font-mono tracking-tight flex items-center gap-1">
                            <span className="w-1 h-1 bg-emerald-400 rounded-full shrink-0"></span>
                            {st}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <span className="font-hud text-[9px] text-[#7F8AA3] uppercase">TACTICAL VULNERABILITY:</span>
                      <ul className="flex flex-col gap-0.5 mt-0.5">
                        {player.weaknesses.slice(0, 2).map((wk, i) => (
                          <li key={i} className="text-[10px] text-rose-450 font-mono tracking-tight flex items-center gap-1">
                            <span className="w-1 h-1 bg-rose-500 rounded-full shrink-0"></span>
                            {wk}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                </div>
              ))}
            </div>

          </div>
        )}

      </main>

      {/* FOOTER SCROLLING RECENT EVENT TICKER (PINS BOTTOM OF HUD SCREEN) */}
      <footer id="bottom_scrolling_broadcaster_ticker" className="fixed bottom-0 left-0 right-0 h-10 border-t border-[rgba(0,229,255,0.18)] bg-slate-950/90 backdrop-blur-md z-40 flex items-center shadow-2xl">
        <div className="bg-[#00E5FF] text-slate-950 px-4 h-full flex items-center font-hud text-xs tracking-widest font-bold shrink-0">
          REPORTS TELEMETRY
        </div>
        <div className="flex-1 ticker-wrap overflow-hidden h-full flex items-center text-xs">
          <div className="ticker-content font-mono uppercase text-[#00E5FF] tracking-wider transition-all">
            {matchState.recentHistory.length > 0 ? (
              matchState.recentHistory.slice(0, 4).map((item, index) => (
                <span key={index} className="mx-6">
                  ⚡ OVER {item.overNumber}.{item.ballNumber} // <span className="text-white">{item.commentary}</span>
                </span>
              ))
            ) : (
              <span>
                📡 INITIAL TELEMETRY ENGINES LOADED SUCCESSFULLY ... READY TO DEPLOY HIGH-DRAMA T20 CRICKET SIMULATION MATRIX LIVE FOR CSK, MI, RCB, AND SRH FRANCHISES ... CHANNELS ACTIVE ... READY TO BOWL BALL 1.
              </span>
            )}
          </div>
        </div>
        <div className="bg-slate-900 border-l border-slate-800 px-4 h-full flex items-center font-mono text-[10px] text-zinc-500 shrink-0">
          SECURE SECTOR
        </div>
      </footer>
    </div>
  );
}
