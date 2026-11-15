// Procedural sound: every effect is synthesised with WebAudio, so the game
// ships no audio files. The context is created on the first user gesture;
// every call is safe before that (it simply does nothing).
export function createAudio() {
  let context = null;
  let master = null;

  function ensure() {
    if (context) return true;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = 0.32;
      master.connect(context.destination);
    } catch {
      return false;
    }
    return true;
  }

  function unlock() {
    if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
  }

  // A short burst of filtered noise, the body of a gunshot.
  function noiseBurst(when, duration, filterFreq, gainValue) {
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(when);
  }

  // A short sine blip, for beeps, clicks and hit ticks.
  function blip(when, freq, duration, gainValue, type = 'sine') {
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  function now() {
    return context ? context.currentTime : 0;
  }

  return {
    unlock,
    shot(kind) {
      if (!ensure()) return;
      const t = now();
      if (kind === 'sniper') {
        noiseBurst(t, 0.28, 1400, 0.9);
        blip(t, 160, 0.16, 0.25, 'square');
      } else if (kind === 'shotgun') {
        noiseBurst(t, 0.22, 900, 0.9);
        blip(t, 90, 0.14, 0.3, 'square');
      } else if (kind === 'smg') {
        noiseBurst(t, 0.09, 2400, 0.55);
      } else if (kind === 'pistol') {
        noiseBurst(t, 0.11, 1800, 0.6);
      } else {
        noiseBurst(t, 0.13, 1700, 0.7);
      }
    },
    distantShot() {
      if (!ensure()) return;
      noiseBurst(now(), 0.16, 700, 0.22);
    },
    dryClick() {
      if (!ensure()) return;
      blip(now(), 1400, 0.04, 0.18, 'square');
    },
    reload() {
      if (!ensure()) return;
      const t = now();
      blip(t, 500, 0.05, 0.2, 'square');
      blip(t + 0.18, 700, 0.05, 0.2, 'square');
    },
    hit(kill) {
      if (!ensure()) return;
      const t = now();
      blip(t, kill ? 1500 : 1100, 0.06, 0.25, 'sine');
      if (kill) blip(t + 0.07, 1900, 0.08, 0.22, 'sine');
    },
    hurt() {
      if (!ensure()) return;
      blip(now(), 220, 0.12, 0.3, 'sawtooth');
    },
    plantBeep() {
      if (!ensure()) return;
      blip(now(), 980, 0.09, 0.25, 'sine');
    },
    explosion() {
      if (!ensure()) return;
      const t = now();
      noiseBurst(t, 0.9, 320, 1.0);
      blip(t, 55, 0.7, 0.5, 'sine');
    },
    roundWin() {
      if (!ensure()) return;
      const t = now();
      blip(t, 523, 0.14, 0.22, 'triangle');
      blip(t + 0.14, 659, 0.14, 0.22, 'triangle');
      blip(t + 0.28, 784, 0.26, 0.24, 'triangle');
    },
    roundLose() {
      if (!ensure()) return;
      const t = now();
      blip(t, 392, 0.16, 0.2, 'triangle');
      blip(t + 0.16, 330, 0.16, 0.2, 'triangle');
      blip(t + 0.32, 262, 0.3, 0.22, 'triangle');
    },
    buy() {
      if (!ensure()) return;
      const t = now();
      blip(t, 880, 0.05, 0.2, 'sine');
      blip(t + 0.06, 1174, 0.07, 0.2, 'sine');
    },
  };
}
