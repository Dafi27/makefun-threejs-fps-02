// state.js — one central store for the whole match. No rendering here.
export const TEAMS = { JACKALS: 'jackals', WARDENS: 'wardens' };
export const TEAM_NAME = { jackals: 'JACKALS', wardens: 'WARDENS' };
export const TEAM_COLOR = { jackals: 0xe8a33d, wardens: 0x4d9de0 };

export const ROUND_TIME = 100;      // seconds of live play
export const BUY_TIME = 15;         // seconds in the buy phase
export const ROUND_END_TIME = 4;    // seconds the banner shows
export const WIN_ROUNDS = 4;        // first to this takes the match
export const PLANT_TIME = 3.5;      // seconds holding E to plant
export const DEFUSE_TIME = 5;       // seconds holding E to defuse
export const BOMB_FUSE = 35;        // seconds from plant to detonation
export const START_MONEY = 800;
export const WIN_BONUS = 1200;
export const LOSS_BONUS = 700;
export const KILL_BONUS = 250;
export const PLANT_BONUS = 400;

export function createState() {
  return {
    phase: 'menu',           // menu | buy | live | roundEnd | matchEnd
    phaseT: 0,               // seconds spent in this phase
    round: 1,
    score: { jackals: 0, wardens: 0 },
    money: START_MONEY,
    timer: ROUND_TIME,
    plan: 'A',               // squad's target site this round
    bomb: { state: 'carried', site: null, carrierId: 'player', x: 0, y: 0, z: 0, fuse: 0, plantT: 0, defuseT: 0, defuserId: null },
    actors: [],              // player + bots, see player.js / bots.js
    events: [],              // {t, text, kind} for the killfeed
    roundWinner: null,
    matchWinner: null,
    roundLog: [],
    seed: 1,
    time: 0,               // seconds of simulation since match start
    muted: false,
  };
}

export function logEvent(state, text, kind) {
  state.events.push({ t: state.phaseT, text, kind: kind || 'info' });
  if (state.events.length > 8) state.events.shift();
}

export function aliveOf(state, team) {
  let n = 0;
  for (const a of state.actors) if (a.team === team && a.alive) n++;
  return n;
}

export function otherTeam(team) {
  return team === TEAMS.JACKALS ? TEAMS.WARDENS : TEAMS.JACKALS;
}
