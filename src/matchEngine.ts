import { Player, Team, MatchState, BallEvent, Scenario } from './types';
import { TEAMS } from './data';

// Helper to choose a random outcome weighted by circumstances
export function simulateBall(
  state: MatchState,
  aggressivenessSlider: number // 1 to 5
): {
  outcome: BallEvent['outcome'];
  runs: number;
  isBoundary: boolean;
  isWicket: boolean;
  commentary: string;
} {
  const batsman = state.striker;
  const bowler = state.currentBowler;
  const isSpinner = bowler.bowlingStyle?.toLowerCase().includes('spin') || bowler.bowlingStyle?.toLowerCase().includes('orthodox');
  
  // Base weights for each runs result in T20 match context
  // [0, 1, 2, 3, 4, 6, W, Wd, Nb]
  let weights = [35, 30, 8, 1, 12, 6, 4, 3, 1];

  // Adjust weights based on aggressiveness (slider 1 to 5, default 3)
  if (aggressivenessSlider === 1) { // Defensive / Block
    weights[0] += 25; // More dot balls
    weights[1] += 5;
    weights[4] = Math.max(2, weights[4] - 8); // fewer boundaries
    weights[5] = Math.max(1, weights[5] - 5);
    weights[6] = Math.max(1, weights[6] - 3); // fewer wickets
  } else if (aggressivenessSlider === 2) { // Strike rotation
    weights[0] -= 10;
    weights[1] += 15;
    weights[4] = Math.max(4, weights[4] - 4);
    weights[5] = Math.max(2, weights[5] - 2);
    weights[6] = Math.max(2, weights[6] - 1);
  } else if (aggressivenessSlider === 4) { // Aggressive
    weights[0] -= 10;
    weights[4] += 8;
    weights[5] += 5;
    weights[6] += 2; // high risk, higher wicket danger
  } else if (aggressivenessSlider === 5) { // Absolute Carnage (Death Overs / Free Hit style)
    weights[0] -= 15;
    weights[1] -= 10;
    weights[4] += 15;
    weights[5] += 12;
    weights[6] += 5; // extreme risk!
  }

  // Strategic match phase adjustment
  const currentOverFloat = state.overs + state.ballsInOver / 6;
  if (currentOverFloat < 6) { // Powerplay: attack with field restrictions
    weights[4] += 4;
    weights[0] -= 2;
  } else if (currentOverFloat >= 15) { // Death overs: score at any cost!
    weights[5] += 6;
    weights[4] += 4;
    weights[6] += 2;
    weights[0] -= 8;
  }

  // Player strength match-ups
  const batsStrengths = batsman.strengths.map(s => s.toLowerCase());
  const batsWeaknesses = batsman.weaknesses.map(w => w.toLowerCase());
  const bowlStrengths = bowler.strengths.map(s => s.toLowerCase());
  
  if (isSpinner && batsStrengths.some(s => s.includes('spin'))) {
    // Spin crusher facing spin: boost boundary probability
    weights[4] += 5;
    weights[5] += 4;
  }
  if (!isSpinner && batsStrengths.some(s => s.includes('pace'))) {
    // Pace hitter facing pace: boost boundary
    weights[4] += 4;
    weights[5] += 3;
  }

  // Handling special bowler traits like Yorkers or Slingshot action
  if (bowlStrengths.some(s => s.includes('yorker') || s.includes('slinger'))) {
    weights[0] += 8; // more dot balls
    weights[6] += 2; // more wickets
    weights[4] = Math.max(3, weights[4] - 4);
  }

  if (batsWeaknesses.some(w => w.includes('inswing')) && bowlStrengths.some(s => s.includes('inswing') || s.includes('swinger'))) {
    weights[6] += 4; // Weak against inswing facing swinger! Highlighted vulnerability
  }

  // Convert weights into cumulative probability
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const randomVal = Math.random() * totalWeight;
  
  let tempSum = 0;
  let choosenIndex = 0;
  for (let i = 0; i < weights.length; i++) {
    tempSum += weights[i];
    if (randomVal <= tempSum) {
      choosenIndex = i;
      break;
    }
  }

  // Mapping choosing index back to outcome
  // [0: '0', 1: '1', 2: '2', 3: '3', 4: '4', 5: '6', 6: 'W', 7: 'Wd', 8: 'Nb']
  const outcomesMap: BallEvent['outcome'][] = ['0', '1', '2', '3', '4', '6', 'W', 'Wd', 'Nb'];
  const outcomeSelected = outcomesMap[choosenIndex];

  let runs = 0;
  let isBoundary = false;
  let isWicket = false;

  switch (outcomeSelected) {
    case '0':
      runs = 0;
      break;
    case '1':
      runs = 1;
      break;
    case '2':
      runs = 2;
      break;
    case '3':
      runs = 3;
      break;
    case '4':
      runs = 4;
      isBoundary = true;
      break;
    case '6':
      runs = 6;
      isBoundary = true;
      break;
    case 'W':
      runs = 0;
      isWicket = true;
      break;
    case 'Wd':
      runs = 1; // 1 extra run, ball will be re-bowled
      break;
    case 'Nb':
      runs = 1; // 1 extra run, free hit follows!
      break;
  }

  // Dynamic commentary generation contextually matching the play
  let commentary = '';
  const batterName = batsman.name;
  const bowlerName = bowler.name;

  const dotCommentaries = [
    `${bowlerName} fires in a quick length ball, ${batterName} pushes it safely to mid-off. No run.`,
    `Excellent dot ball! ${bowlerName} finds the block-hole, ${batterName} squeezes it out to cover.`,
    `Slight swing there. ${batterName} attempts a gentle push but gets beaten on the outer edge!`,
    `A sharp short delivery from ${bowlerName}. ${batterName} ducked under it vigilantly. Solid visual tension.`,
    `Good length outside off, ${batterName} lets it sail through to the keeper.`
  ];

  const singleCommentaries = [
    `${batterName} plays it soft into the gap at deep cover for a quick single.`,
    `Guided down to third man. Smart strike rotation by ${batterName}.`,
    `${bowlerName} delivers a full-toss, ${batterName} whips it away to deep square leg for one.`,
    `Direct tap to mid-on. They scramble through for a risky single! Good running!`,
    `Tucked off the pads towards short fine leg for a single.`
  ];

  const boundaryFourCommentaries = [
    `SHOT! ${batterName} steps down the crease and drives it beautifully past mid-off! CRASHED for FOUR!`,
    `Unbelievable boundary! ${batterName} stands tall and plays a savage pull shot through mid-wicket! FOUR runs!`,
    `CRISP! ${batterName} cuts it off the backfoot. The ball flashes past the point fielder into the boundary!`,
    `Full and wide, ${batterName} plays an elegant cover drive that bullets to the fence! Magnificent stroke!`,
    `Audacious! ${batterName} reverse-sweeps ${bowlerName} over third man! Luminous boundary!`
  ];

  const boundarySixCommentaries = [
    `OUT OF THE PARK! ${batterName} launches a majestic helicopter loft over deep mid-wicket! That is a MASSIVE SIX!`,
    `HE\'S HIT THAT INTO THE 3RD TIER! ${batterName} reads the slower delivery and sends it soaring 98 meters! SIX!`,
    `CLEAN AS A WHISTLE! ${batterName} clears his front leg and lofts ${bowlerName} straight over the bowler\'s head! SIX!`,
    `MAGNIFICENT! ${batterName} scoops it off his hips. The ball carries easily over the fine leg boundary. Pure neon fireworks!`,
    `SENSATIONAL! ${batterName} steps out and lofts this high over long-off. The stadium erupted! SIX!`
  ];

  const wicketCommentaries = [
    `OUT! CLEAN BOWLED! ${bowlerName} fires in a searing yorker. ${batterName} plays all over it and the stumps are shattered! Cobra-style bowling!`,
    `OUT! IN THE AIR AND CAUGHT! ${batterName} attempts another monster slog, gets a massive leading edge, and falls into deep mid-on\'s safe hands!`,
    `OUT! TRAPPED plumb LBW! ${bowlerName} swings this one sharply inwards, hitting ${batterName} dead in front of the middle stump. Unbelievable scene!`,
    `OUT! EDGED AND GONE! ${batterName} tries to slice a wide one, gets a thick outer edge, and the keeper makes no mistake diving to his right!`,
    `OUT! RUN OUT! A horrific mix-up in the middle. ${batterName} tap-and-ran but got sent back late. Direct hit at the non-striker\'s end!`
  ];

  if (isWicket) {
    commentary = wicketCommentaries[Math.floor(Math.random() * wicketCommentaries.length)];
  } else if (outcomeSelected === '6') {
    commentary = boundarySixCommentaries[Math.floor(Math.random() * boundarySixCommentaries.length)];
  } else if (outcomeSelected === '4') {
    commentary = boundaryFourCommentaries[Math.floor(Math.random() * boundaryFourCommentaries.length)];
  } else if (outcomeSelected === '1') {
    commentary = singleCommentaries[Math.floor(Math.random() * singleCommentaries.length)];
  } else if (outcomeSelected === '2') {
    commentary = `${batterName} double-taps this past deep mid-wicket. Superb hustle, they push hard and complete two runs!`;
  } else if (outcomeSelected === '3') {
    commentary = `Brilliant placement. ${batterName} drives through cow corner, tracking three rapid runs before the fielder slides to save the boundary.`;
  } else if (outcomeSelected === 'Wd') {
    commentary = `wide delivery! ${bowlerName} slides too far down the leg side. Special warning from umpire, CSK/MI get 1 extra run. Ball re-bowled.`;
  } else if (outcomeSelected === 'Nb') {
    commentary = `NO BALL! ${bowlerName} oversteps. It\'s an extra run and more importantly, a FREE HIT on the next delivery! Batter cannot be bowled!`;
  } else {
    commentary = dotCommentaries[Math.floor(Math.random() * dotCommentaries.length)];
  }

  return {
    outcome: outcomeSelected,
    runs,
    isBoundary,
    isWicket,
    commentary
  };
}

// Compute mathematically precise win probability based on live parameters
export function computeWinProbability(state: MatchState): number {
  if (state.isGameOver) {
    if (state.gameOutcome?.includes(state.battingTeam.fullName) || state.gameOutcome?.includes('won by')) {
      return state.innings === 2 ? 100 : 0;
    }
    return state.innings === 2 ? 0 : 100;
  }

  // If first innings, we gauge based on projected score
  if (state.innings === 1) {
    const currentBalls = state.overs * 6 + state.ballsInOver;
    if (currentBalls === 0) return 50;

    const currentRuns = state.score;
    const currentCRR = (currentRuns / currentBalls) * 6;
    const projectedScore = currentCRR * 20;

    // A score of 180 is baseline 50% in modern T20.
    // Lose wickets and project is penalized.
    let baseProb = 50 + (projectedScore - 180) * 0.45;
    baseProb -= state.wickets * 4.5; // penality for wickets lost

    return Math.max(10, Math.min(90, Math.round(baseProb)));
  }

  // If second innings, context is a fully interactive chase
  const target = state.target || 180;
  const totalBalls = 120;
  const ballsPlayed = state.overs * 6 + state.ballsInOver;
  const ballsRemaining = Math.max(0, totalBalls - ballsPlayed);
  const runsNeeded = Math.max(0, target - state.score);
  const wicketsInHand = 10 - state.wickets;

  if (runsNeeded <= 0) return 100; // already won
  if (ballsRemaining <= 0 && runsNeeded > 0) return 0; // already lost
  if (wicketsInHand <= 0) return 0; // all out

  // Compute rates
  const reqRR = (runsNeeded / ballsRemaining) * 6;
  
  // Base calculation mapping ReqRR to chasing win probability
  // 36 runs needed in 36 balls (ReqRR 6): base chaser is 70% favored at the death
  // 36 runs needed in 12 balls (ReqRR 18): base chaser is 3%
  let chaserProb = 50;
  
  if (reqRR <= 4) {
    chaserProb = 95 - (state.wickets * 3);
  } else if (reqRR > 4 && reqRR <= 8) {
    chaserProb = 85 - (reqRR - 4) * 10 - (state.wickets * 4);
  } else if (reqRR > 8 && reqRR <= 12) {
    chaserProb = 45 - (reqRR - 8) * 8 - (state.wickets * 5);
  } else if (reqRR > 12 && reqRR <= 18) {
    chaserProb = 13 - (reqRR - 12) * 1.5 - (state.wickets * 1.5);
  } else {
    chaserProb = 2;
  }

  // Boost chasing probability slightly if set batters on strike or Dhoni is at the crease
  if (state.striker.id.includes('dhoni') && runsNeeded <= 25) {
    chaserProb += 12; // "The Dhoni Factor"
  }
  if (state.striker.id.includes('kohli') && reqRR <= 10) {
    chaserProb += 8; // "King Kohli Chase Cushion"
  }

  // Wickets in hand multiplier
  const wicketFactor = (wicketsInHand / 10);
  chaserProb = chaserProb * (0.6 + 0.4 * wicketFactor);

  let finalProb = Math.round(chaserProb);
  finalProb = Math.max(1, Math.min(99, finalProb));
  
  return finalProb;
}

// Generate strategic factor list based on exact match state
export function getWinProbabilityFactors(state: MatchState): string[] {
  const factors: string[] = [];
  const target = state.target || 180;
  const runsNeeded = target - state.score;
  const ballsPlayed = state.overs * 6 + state.ballsInOver;
  const ballsRemaining = Math.max(0, 120 - ballsPlayed);
  const wicketsInHand = 10 - state.wickets;

  if (state.innings === 1) {
    const currentCRR = ballsPlayed > 0 ? ((state.score / ballsPlayed) * 6).toFixed(2) : '0';
    factors.push(`CURRENT RUN RATE AT ${currentCRR} RPO`);
    if (state.wickets >= 5) {
      factors.push('CRITICAL WICKET LOSS PREVENTS ALL-OUT AGGRESSION');
    } else {
      factors.push(`${wicketsInHand} WICKETS REMAINING FAVORS POWER PLAYING`);
    }
    if (state.overs >= 15) {
      factors.push('DEATH OVER FLURRY ENGAGED BY SET BATSMEN');
    }
  } else {
    // Innings 2 Chasing
    const reqRR = ballsRemaining > 0 ? ((runsNeeded / ballsRemaining) * 6).toFixed(2) : '0';
    factors.push(`REQUIRED RUN RATE STEADY AT ${reqRR} RPO`);
    if (reqRR > "12.00") {
      factors.push('STEEP EXTREME CHASE RATE STRAINING BATTING PRESSURE');
    }
    if (wicketsInHand <= 3) {
      factors.push('TAIL-END BATTING SQUAD HIGH RISK OF TOTAL SYSTEM COLLAPSE');
    } else if (wicketsInHand >= 6) {
      factors.push('HEALTHY BATTING SQUAD DEPTH PROVIDES ATTACK CAPITAL');
    }
    if (state.striker.id.includes('dhoni') || state.nonStriker.id.includes('dhoni')) {
      factors.push('ICE-COLD M.S. DHONI PRESSURING BOWLER IN THE FINALE CHAMPIONSHIP');
    }
    if (state.currentBowler.id.includes('bumrah') && ballsRemaining <= 18) {
      factors.push('JASPRIT BUMRAH DEATH OVERS MISSILES CURBING BOUNDARIES');
    }
  }
  return factors;
}

// Get next available bowler who is not current bowler
export function selectNextBowler(team: Team, currentBowlerId: string): Player {
  const bowlers = team.squad.filter(p => p.role === 'Bowler' || p.role === 'All-Rounder');
  const eligibleBowlers = bowlers.filter(p => p.id !== currentBowlerId);
  if (eligibleBowlers.length > 0) {
    return eligibleBowlers[Math.floor(Math.random() * eligibleBowlers.length)];
  }
  return bowlers[0] || team.squad[team.squad.length - 1];
}

// Get next available batsman in order
export function selectNextBatsman(team: Team, activeStrikerId: string, activeNonStrikerId: string, lostWicketsCount: number): Player {
  // Let's filter out active batsmen
  const activeIds = [activeStrikerId, activeNonStrikerId];
  // To simulate squad batting order, we exclude active and previously dismissed players
  // In our simplified squad, we have 5 players. If wickets lie 0-4, we can pick the unused ones.
  const squad = team.squad;
  const available = squad.filter(p => !activeIds.includes(p.id));
  
  if (available.length > 0) {
    // Pick the highest order player available
    return available[0];
  }
  
  // Fallback
  return squad[squad.length - 1];
}

// Initialize state from a scenario
export function initializeMatchFromScenario(scenario: Scenario): MatchState {
  const battingTeam = TEAMS[scenario.battingTeamCode];
  const bowlingTeam = TEAMS[scenario.bowlingTeamCode];
  
  const striker = battingTeam.squad.find(p => p.id === scenario.strikerId) || battingTeam.squad[0];
  const nonStriker = battingTeam.squad.find(p => p.id === scenario.nonStrikerId) || battingTeam.squad[1];
  const currentBowler = bowlingTeam.squad.find(p => p.id === scenario.bowlerId) || bowlingTeam.squad[bowlingTeam.squad.length - 1];

  return {
    matchId: `sim_${Math.floor(Math.random() * 900000) + 100000}`,
    battingTeam,
    bowlingTeam,
    innings: scenario.innings,
    score: scenario.score,
    wickets: scenario.wickets,
    overs: scenario.overs,
    ballsInOver: scenario.ballsInOver,
    totalOvers: 20,
    target: scenario.target,
    striker,
    nonStriker,
    currentBowler,
    strikerRuns: scenario.strikerRuns,
    strikerBalls: scenario.strikerBalls,
    strikerFours: Math.floor(scenario.strikerRuns * 0.12),
    strikerSixes: Math.floor(scenario.strikerRuns * 0.08),
    nonStrikerRuns: scenario.nonStrikerRuns,
    nonStrikerBalls: scenario.nonStrikerBalls,
    nonStrikerFours: Math.floor(scenario.nonStrikerRuns * 0.1),
    nonStrikerSixes: Math.floor(scenario.nonStrikerRuns * 0.05),
    bowlerOvers: scenario.bowlerOvers,
    bowlerWickets: scenario.bowlerWickets,
    bowlerRuns: scenario.bowlerRuns,
    bowlerBalls: Math.round(scenario.bowlerOvers * 6),
    partnershipRuns: scenario.strikerRuns + scenario.nonStrikerRuns,
    partnershipBalls: scenario.strikerBalls + scenario.nonStrikerBalls,
    currentOverBalls: [],
    recentHistory: [],
    isGameOver: false
  };
}

// New default match generator from Ball 1
export function createDefaultMatch(battingCode: string, bowlingCode: string): MatchState {
  const battingTeam = TEAMS[battingCode] || TEAMS.CSK;
  const bowlingTeam = TEAMS[bowlingCode] || TEAMS.MI;

  return {
    matchId: `sim_${Math.floor(Math.random() * 900000) + 100000}`,
    battingTeam,
    bowlingTeam,
    innings: 1,
    score: 0,
    wickets: 0,
    overs: 0,
    ballsInOver: 0,
    totalOvers: 20,
    striker: battingTeam.squad[0],
    nonStriker: battingTeam.squad[1],
    currentBowler: bowlingTeam.squad[bowlingTeam.squad.length - 1], // Usually starts with a premier bowler
    strikerRuns: 0,
    strikerBalls: 0,
    strikerFours: 0,
    strikerSixes: 0,
    nonStrikerRuns: 0,
    nonStrikerBalls: 0,
    nonStrikerFours: 0,
    nonStrikerSixes: 0,
    bowlerOvers: 0,
    bowlerWickets: 0,
    bowlerRuns: 0,
    bowlerBalls: 0,
    partnershipRuns: 0,
    partnershipBalls: 0,
    currentOverBalls: [],
    recentHistory: [],
    isGameOver: false
  };
}
