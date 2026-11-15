// The HUD: every DOM read and write the game does, in one place, so the
// simulation never touches the document. Elements live in index.html.
export function createHud() {
  const $ = (id) => document.getElementById(id);
  const elements = {
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    damage: $('damage'),
    healthValue: $('health-value'),
    healthFill: $('health-fill'),
    armorValue: $('armor-value'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'),
    moneyValue: $('money-value'),
    timerValue: $('timer-value'),
    scoreEmber: $('score-ember'),
    scoreAsh: $('score-ash'),
    aliveEmber: $('alive-ember'),
    aliveAsh: $('alive-ash'),
    roundValue: $('round-value'),
    killfeed: $('killfeed'),
    bombBanner: $('bomb-banner'),
    buy: $('buy'),
    buyItems: $('buy-items'),
    buyMoney: $('buy-money'),
    buyTimer: $('buy-timer'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    overlayStats: $('overlay-stats'),
    play: $('play'),
    plantWrap: $('plant-wrap'),
    plantLabel: $('plant-label'),
    plantFill: $('plant-fill'),
    toast: $('toast'),
    grenades: $('grenades-value'),
  };

  let hitTimer = null;
  let toastTimer = null;

  function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    setHealth(health, armor) {
      elements.healthValue.textContent = String(Math.round(health));
      elements.healthFill.style.width = `${Math.max(0, health)}%`;
      elements.armorValue.textContent = armor > 0 ? `+${Math.round(armor)}` : '';
    },
    setAmmo(mag, reserve, name) {
      elements.ammoMag.textContent = String(mag);
      elements.ammoReserve.textContent = `/ ${reserve}`;
      elements.weaponName.textContent = name;
      elements.ammoMag.parentElement.classList.toggle('empty', mag === 0);
    },
    setGrenades(count) {
      elements.grenades.textContent = count > 0 ? `Frag x${count}` : '';
    },
    setMoney(money) {
      elements.moneyValue.textContent = `$${money}`;
      elements.buyMoney.textContent = `$${money}`;
    },
    setTimer(seconds) {
      elements.timerValue.textContent = formatTime(seconds);
      elements.timerValue.classList.toggle('low', seconds <= 15);
    },
    setScore(ember, ash) {
      elements.scoreEmber.textContent = String(ember);
      elements.scoreAsh.textContent = String(ash);
    },
    setAlive(ember, ash) {
      elements.aliveEmber.textContent = `Ember ${ember} alive`;
      elements.aliveAsh.textContent = `Ash ${ash} alive`;
    },
    setRound(round) {
      elements.roundValue.textContent = `Round ${round}`;
    },
    setCrosshairGap(px) {
      elements.crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    hitMarker(kill, holdMs = 90) {
      elements.hitmarker.classList.add('on');
      elements.hitmarker.classList.toggle('kill', kill);
      if (hitTimer) clearTimeout(hitTimer);
      hitTimer = setTimeout(() => elements.hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      elements.damage.classList.add('on');
      setTimeout(() => elements.damage.classList.remove('on'), 180);
    },
    feed(html) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.innerHTML = html;
      elements.killfeed.prepend(line);
      while (elements.killfeed.children.length > 5) elements.killfeed.lastChild.remove();
      setTimeout(() => line.remove(), 6000);
    },
    setBomb(text, kind) {
      elements.bombBanner.textContent = text;
      elements.bombBanner.className = kind ? `bomb ${kind}` : 'bomb';
      elements.bombBanner.hidden = !text;
    },
    setPlant(progress, label) {
      if (progress == null) {
        elements.plantWrap.hidden = true;
        return;
      }
      elements.plantWrap.hidden = false;
      elements.plantLabel.textContent = label;
      elements.plantFill.style.width = `${Math.round(progress * 100)}%`;
    },
    toast(text) {
      elements.toast.textContent = text;
      elements.toast.classList.add('on');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => elements.toast.classList.remove('on'), 2200);
    },
    showBuy(items, onBuy) {
      elements.buyItems.innerHTML = '';
      for (const item of items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'buy-item';
        button.disabled = item.disabled;
        button.innerHTML = `<b>${item.name}</b><span>${item.detail}</span><i>$${item.price}</i>`;
        button.addEventListener('click', () => onBuy(item.id));
        elements.buyItems.appendChild(button);
      }
      elements.buy.hidden = false;
    },
    hideBuy() {
      elements.buy.hidden = true;
    },
    setBuyTimer(seconds) {
      elements.buyTimer.textContent = `Buy phase — ${Math.max(0, Math.ceil(seconds))}s — press B to close`;
    },
    showOverlay(kind, data) {
      const titles = {
        start: 'EMBER YARD',
        paused: 'Paused',
        roundEnd: data && data.winner === 'ember' ? 'Round won' : 'Round lost',
        matchEnd: data && data.winner === 'ember' ? 'Match won — Ember takes the yard' : 'Match lost — Ash holds the yard',
      };
      const copies = {
        start: 'A round-based tactical shooter. Plant the bomb at A or B, or eliminate the Ash defenders. Buy weapons between rounds — accuracy beats speed.',
        paused: 'Pointer unlocked. Click to play to keep going.',
        roundEnd: data ? data.reason : '',
        matchEnd: data ? data.reason : '',
      };
      elements.overlayTitle.textContent = titles[kind] || kind;
      elements.overlayCopy.textContent = copies[kind] || '';
      elements.overlayStats.innerHTML = data && data.stats ? data.stats : '';
      elements.play.textContent = kind === 'start' ? 'Click to play' : kind === 'matchEnd' ? 'Play again' : kind === 'roundEnd' ? 'Next round' : 'Click to play';
      elements.overlay.hidden = false;
    },
    hideOverlay() {
      elements.overlay.hidden = true;
    },
    onPlay(callback) {
      elements.play.addEventListener('click', callback);
    },
  };
}
