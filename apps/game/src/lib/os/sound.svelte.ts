// Discreet UI sounds, synthesized with WebAudio (no assets, works offline and in Tauri).
// Muted state persists per browser. Nothing plays before the first user gesture (autoplay policy).

import { load, store } from './storage';

export type Cue = 'notify' | 'objective' | 'mail' | 'error' | 'success' | 'end';

const KEY = 'kp.sound.muted';

// [frequency Hz, start offset s, duration s] per note; all notes share one soft envelope.
const CUES: Record<Cue, { wave: OscillatorType; gain: number; notes: Array<[number, number, number]> }> = {
  notify: { wave: 'sine', gain: 0.05, notes: [[880, 0, 0.09]] },
  mail: { wave: 'sine', gain: 0.05, notes: [[740, 0, 0.08], [988, 0.09, 0.12]] },
  objective: { wave: 'triangle', gain: 0.06, notes: [[523, 0, 0.1], [659, 0.1, 0.1], [988, 0.2, 0.22]] },
  success: { wave: 'sine', gain: 0.045, notes: [[660, 0, 0.07], [880, 0.07, 0.1]] },
  error: { wave: 'square', gain: 0.025, notes: [[196, 0, 0.12], [147, 0.12, 0.16]] },
  end: { wave: 'triangle', gain: 0.06, notes: [[392, 0, 0.18], [523, 0.18, 0.18], [659, 0.36, 0.18], [1047, 0.54, 0.5]] },
};

class Sound {
  muted = $state(load<boolean>(KEY) ?? false);
  private ctx: AudioContext | null = null;

  toggle(): void {
    this.muted = !this.muted;
    store(KEY, this.muted);
    if (!this.muted) this.play('success');
  }

  play(cue: Cue): void {
    if (this.muted || typeof window === 'undefined' || !('AudioContext' in window)) return;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      const { wave, gain, notes } = CUES[cue];
      const t0 = this.ctx.currentTime + 0.01;
      for (const [freq, at, dur] of notes) {
        const osc = this.ctx.createOscillator();
        const env = this.ctx.createGain();
        osc.type = wave;
        osc.frequency.value = freq;
        env.gain.setValueAtTime(0, t0 + at);
        env.gain.linearRampToValueAtTime(gain, t0 + at + 0.012);
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
        osc.connect(env).connect(this.ctx.destination);
        osc.start(t0 + at);
        osc.stop(t0 + at + dur + 0.02);
      }
    } catch {
      /* audio unavailable: stay silent */
    }
  }
}

export const sound = new Sound();
