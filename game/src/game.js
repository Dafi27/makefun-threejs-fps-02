// The match: rounds, money, the bomb and the win conditions. One match is
// a first-to-5, at most 9 rounds. Ember attacks, Ash defends. A round is won
// by eliminating the other team, or by the bomb: plant it and it detonates,
// or defuse it before it does. The simulation calls tick() every fixed
// step; this module owns the rules, never the rendering.
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';

export const ROUND_TIME = 100;
export const BUY_TIME = 12;
export const BOMB_TIME = 35;
export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const WIN_SCORE = 5;
export const MAX_ROUNDS = 9;
const WIN_MONEY = 3250;
const LOSS_MONEY = 1900;
const LOSS_BONUS = 500;
const KILL_MONEY = 300;
const OBJECTIVE_MONEY = 300;
const MAX_MONEY = 16000;

export function createMatch() {
  const state = {
    phase: 'menu', // menu | buy | round | roundEnd | matchEnd
    phaseTime: 0,
    round: 0,
    score: { ember: 0, ash: 0 },
    money: 800,
    lossStreak: 0,
    timer: ROUND_TIME,
    bomb: {
      status: 'carried', // carried | planted | dropped | done
      carrier: null,
      siteKey: null,
      site: null,
      position: null,
      timer: BOMB_TIME,
    },
    plantProgress: 0,
    defuseProgress: 0,
    lastWinner: null,
    lastReason: '',
  };

  function addMoney(amount) {
    state.money = Math.max(0, Math.min(MAX_MONEY, state.money + amount));
  }

  function startMatch() {
    state.round = 0;
    state.score.ember = 0;
    state.score.ash = 0;
    state.money = 800;
    state.lossStreak = 0;
    state.lastWinner = null;
    startRound();
  }

  function startRound() {
    state.round += 1;
    state.phase = 'buy';
    state.phaseTime = BUY_TIME;
    state.timer = ROUND_TIME;
    state.bomb.status = 'carried';
    state.bomb.carrier = null;
    state.bomb.siteKey = null;
    state.bomb.site = null;
    state.bomb.position = null;
    state.bomb.timer = BOMB_TIME;
    state.plantProgress = 0;
    state.defuseProgress = 0;
  }

  function endRound(winner, reason) {
    if (state.phase !== 'round') return;
    state.phase = 'roundEnd';
    state.phaseTime = 4;
    state.lastWinner = winner;
    state.lastReason = reason;
    state.score[winner] += 1;
    if (winner === 'ember') {
      addMoney(WIN_MONEY);
      state.lossStreak = 0;
    } else {
      state.lossStreak += 1;
      addMoney(LOSS_MONEY + Math.min(2, state.lossStreak - 1) * LOSS_BONUS);
    }
  }

  function finishRoundEnd() {
    if (state.score.ember >= WIN_SCORE || state.score.ash >= WIN_SCORE || state.round >= MAX_ROUNDS) {
      state.phase = 'matchEnd';
    } else {
      startRound();
    }
  }

  function onKill(killerTeam) {
    if (killerTeam === 'ember') addMoney(KILL_MONEY);
  }

  function onPlant(byTeam) {
    state.bomb.status = 'planted';
    state.bomb.timer = BOMB_TIME;
    if (byTeam === 'ember') addMoney(OBJECTIVE_MONEY);
  }

  function onDefuse(byTeam) {
    state.bomb.status = 'done';
    if (byTeam === 'ash') addMoney(OBJECTIVE_MONEY);
    endRound('ash', 'defuse');
  }

  function onExplode() {
    state.bomb.status = 'done';
    endRound('ember', 'detonation');
  }

  function dropBomb(position) {
    if (state.bomb.status !== 'carried') return;
    state.bomb.status = 'dropped';
    state.bomb.carrier = null;
    state.bomb.position = { x: position.x, z: position.z };
  }

  function pickUpBomb(carrier) {
    if (state.bomb.status !== 'dropped') return;
    state.bomb.status = 'carried';
    state.bomb.carrier = carrier;
    state.bomb.position = null;
  }

  function setCarrier(carrier) {
    state.bomb.carrier = carrier;
  }

  function buyWeapon(id) {
    const def = WEAPONS[id];
    if (!def || state.phase !== 'buy') return false;
    if (state.money < def.price) return false;
    addMoney(-def.price);
    return true;
  }

  function buyArmor() {
    if (state.phase !== 'buy' || state.money < ARMOR_PRICE) return false;
    addMoney(-ARMOR_PRICE);
    return true;
  }

  function buyGrenade() {
    if (state.phase !== 'buy' || state.money < GRENADE_PRICE) return false;
    addMoney(-GRENADE_PRICE);
    return true;
  }

  // Win conditions, checked every step while a round runs.
  function tick(dt, ctx) {
    if (state.phase === 'buy') {
      state.phaseTime -= dt;
      if (state.phaseTime <= 0) state.phase = 'round';
      return;
    }
    if (state.phase === 'roundEnd') {
      state.phaseTime -= dt;
      if (state.phaseTime <= 0) finishRoundEnd();
      return;
    }
    if (state.phase !== 'round') return;

    state.timer -= dt;
    if (state.bomb.status === 'planted') {
      state.bomb.timer -= dt;
      if (state.bomb.timer <= 0) {
        onExplode();
        return;
      }
    }

    const emberAlive = ctx.playerAlive ? 1 : 0;
    const emberBots = ctx.botsAlive('ember');
    const ashBots = ctx.botsAlive('ash');
    if (ashBots === 0) {
      endRound('ember', 'elimination');
      return;
    }
    if (emberAlive + emberBots === 0) {
      if (state.bomb.status === 'planted') return; // the bomb can still win it
      endRound('ash', 'elimination');
      return;
    }
    if (state.timer <= 0) {
      state.timer = 0;
      endRound('ash', 'time');
    }
  }

  return {
    state,
    startMatch,
    startRound,
    endRound,
    finishRoundEnd,
    onKill,
    onPlant,
    onDefuse,
    onExplode,
    dropBomb,
    pickUpBomb,
    setCarrier,
    buyWeapon,
    buyArmor,
    buyGrenade,
    addMoney,
    tick,
  };
}
