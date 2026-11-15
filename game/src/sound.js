// sound.js — procedural WebAudio effects. No audio files: every sound is
// synthesized from oscillators and filtered noise, so the game stays offline.
export function createSound() {
  const s = { ctx: null, master: null, noiseBuf: null, enabled: true };
  s.unlock = () => {
    try {
      if (!s.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        s.ctx = new AC();
        s.master = s.ctx.createGain();
        s.master.gain.value = 0.4;
        s.master.connect(s.ctx.destination);
        const len = s.ctx.sampleRate * 0.5;
        s.noiseBuf = s.ctx.createBuffer(1, len, s.ctx.sampleRate);
        const d = s.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (s.ctx.state === 'suspended') s.ctx.resume();
    } catch (e) { s.enabled = false; }
  };
  function noise(dur, freq, gain, type) {
    if (!s.ctx || !s.enabled) return;
    try {
      const src = s.ctx.createBufferSource();
      src.buffer = s.noiseBuf;
      const f = s.ctx.createBiquadFilter();
      f.type = type || 'lowpass'; f.frequency.value = freq;
      const g = s.ctx.createGain();
      const t = s.ctx.currentTime;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f); f.connect(g); g.connect(s.master);
      src.start(t); src.stop(t + dur);
    } catch (e) { /* headless */ }
  }
  function tone(freq0, freq1, dur, gain, type) {
    if (!s.ctx || !s.enabled) return;
    try {
      const o = s.ctx.createOscillator();
      o.type = type || 'sine';
      const t = s.ctx.currentTime;
      o.frequency.setValueAtTime(freq0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, freq1), t + dur);
      const g = s.ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(s.master);
      o.start(t); o.stop(t + dur);
    } catch (e) { /* headless */ }
  }
  s.shot = (kind, far) => {
    const g = far ? 0.10 : 0.30;
    if (kind === 'rifle') { noise(0.14, 2400, g); tone(160, 55, 0.12, g * 0.8, 'square'); }
    else if (kind === 'smg') { noise(0.09, 3200, g * 0.8); tone(200, 70, 0.08, g * 0.6, 'square'); }
    else if (kind === 'shotgun') { noise(0.25, 1400, g * 1.1); tone(110, 40, 0.22, g, 'sawtooth'); }
    else { noise(0.11, 2800, g * 0.9); tone(190, 65, 0.1, g * 0.7, 'square'); }
  };
  s.dry = () => tone(1400, 900, 0.05, 0.12, 'square');
  s.reload = () => { tone(500, 300, 0.06, 0.12, 'square'); setTimeout(() => tone(700, 420, 0.06, 0.12, 'square'), 160); };
  s.hit = () => tone(2100, 1700, 0.06, 0.16, 'sine');
  s.kill = () => { tone(880, 880, 0.08, 0.16, 'sine'); setTimeout(() => tone(1320, 1320, 0.1, 0.16, 'sine'), 90); };
  s.hurt = () => { noise(0.15, 900, 0.2); tone(140, 70, 0.18, 0.2, 'sawtooth'); };
  s.beep = (n) => { for (let i = 0; i < n; i++) setTimeout(() => tone(1250, 1250, 0.09, 0.18, 'sine'), i * 160); };
  s.explosion = () => { noise(0.8, 500, 0.5); tone(90, 28, 0.7, 0.5, 'sine'); };
  s.win = () => { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, f, 0.16, 0.18, 'triangle'), i * 130)); };
  s.lose = () => { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, f, 0.18, 0.16, 'triangle'), i * 150)); };
  s.buy = () => tone(990, 990, 0.07, 0.14, 'sine');
  s.click = () => tone(700, 700, 0.04, 0.1, 'square');
  s.step = () => noise(0.05, 700, 0.05);
  return s;
}
