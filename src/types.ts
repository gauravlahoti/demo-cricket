export interface Player {
  id: string;
  name: string;
  role: 'Batsman' | 'Bowler' | 'All-Rounder' | 'Wicketkeeper';
  battingStyle: 'Right-hand' | 'Left-hand';
  bowlingStyle?: string;
  // Career stats
  matches: number;
  runs: number;
  avg: number;
  sr: number;
  highScore: number;
  wickets: number;
  bowlAvg?: number;
  economy?: number;
  bestBowling?: string;
  // Simulated form details
  form: number[]; // last 5 innings runs or wickets
  strengths: string[];
  weaknesses: string[];
}

export interface Team {
  code: string;
  name: string;
  fullName: string;
  primaryColor: string; // Hex matching the design system
  secondaryColor: string;
  textColor: string;
  logo: string;
  squad: Player[];
}

export interface BallEvent {
  overNumber: number;
  ballNumber: number; // 0 to 5, representation of balls in the current over
  outcome: '0' | '1' | '2' | '3' | '4' | '6' | 'W' | 'Wd' | 'Nb' | 'By';
  runs: number;
  batterName: string;
  bowlerName: string;
  commentary: string;
  winProbBefore: number;
  winProbAfter: number;
  isBoundary: boolean;
  isWicket: boolean;
}

export interface MatchState {
  matchId: string;
  battingTeam: Team;
  bowlingTeam: Team;
  innings: 1 | 2;
  score: number;
  wickets: number;
  overs: number; // number of completed overs
  ballsInOver: number; // 0 to 5
  totalOvers: number;
  target?: number; // only relevant in innings 2
  striker: Player;
  nonStriker: Player;
  currentBowler: Player;
  // Active statistics
  strikerRuns: number;
  strikerBalls: number;
  strikerFours: number;
  strikerSixes: number;
  nonStrikerRuns: number;
  nonStrikerBalls: number;
  nonStrikerFours: number;
  nonStrikerSixes: number;
  bowlerOvers: number;
  bowlerWickets: number;
  bowlerRuns: number;
  bowlerBalls: number;
  // Partnerships
  partnershipRuns: number;
  partnershipBalls: number;
  // History arrays
  currentOverBalls: BallEvent[];
  recentHistory: BallEvent[];
  isGameOver: boolean;
  gameOutcome?: string;
}

export interface Scenario {
  id: string;
  title: string;
  phase: 'Powerplay' | 'Middle Overs' | 'Death Overs';
  battingTeamCode: string;
  bowlingTeamCode: string;
  innings: 1 | 2;
  score: number;
  wickets: number;
  overs: number;
  ballsInOver: number;
  target?: number;
  strikerId: string;
  nonStrikerId: string;
  bowlerId: string;
  strikerRuns: number;
  strikerBalls: number;
  nonStrikerRuns: number;
  nonStrikerBalls: number;
  bowlerWickets: number;
  bowlerRuns: number;
  bowlerOvers: number;
  description: string;
}

export interface AiCommentaryResponse {
  headline: string;
  commentary: string;
  confidence: number;
  winProbabilityAnalysis: string;
  tacticalKey: string;
}
