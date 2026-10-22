import { store } from '../state/store';

/** Short, soft synthesised sound effects (no audio files). Muted by default. */
export type SoundName = 'tap' | 'coin' | 'bill' | 'beep' | 'success' | 'oops' | 'star';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = 'sine', volume = 0.08): void {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = a.currentTime + start;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function play(name: SoundName): void {
  if (!store.settings.sound) return;
  try {
    switch (name) {
      case 'tap':
        tone(660, 0, 0.06, 'triangle', 0.04);
        break;
      case 'coin':
        tone(1320, 0, 0.12, 'triangle', 0.05);
        tone(1760, 0.04, 0.14, 'sine', 0.04);
        break;
      case 'bill':
        tone(420, 0, 0.08, 'triangle', 0.035);
        break;
      case 'beep':
        tone(980, 0, 0.09, 'square', 0.025);
        break;
      case 'success':
        tone(523.25, 0, 0.16);
        tone(659.25, 0.1, 0.16);
        tone(783.99, 0.2, 0.28);
        break;
      case 'oops':
        tone(392, 0, 0.18, 'sine', 0.06);
        tone(330, 0.12, 0.24, 'sine', 0.05);
        break;
      case 'star':
        tone(880, 0, 0.12);
        tone(1174.66, 0.08, 0.2);
        break;
    }
  } catch {
    /* ignore */
  }
}
