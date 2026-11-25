// Chromatic tuner panel with standard-tuning string guidance.
import { detectPitch, FreqSmoother, freqToMidi, toTunerReading } from '../engine/pitchDetect';
import { STANDARD_TUNING } from '../theory/fretboard';
import { type Accidental, midiToName, pretty } from '../theory/notes';

function $(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e;
}

const IN_TUNE_CENTS = 3;
const OPEN_STRINGS = [...STANDARD_TUNING].reverse(); // 6th string (E2) first

export class TunerView {
  readonly bufferSize = 2048;
  private buf = new Float32Array(this.bufferSize);
  private smoother = new FreqSmoother(5);
  private lastPitchedAt = 0;
  private noteEl = $('tuner-note');
  private freqEl = $('tuner-freq');
  private centsEl = $('tuner-cents');
  private needleEl = $('tuner-needle');
  private stringEl = $('tuner-string');
  private stringsEl = $('tuner-strings');

  constructor() {
    this.stringsEl.replaceChildren(
      ...OPEN_STRINGS.map((m, i) => {
        const span = document.createElement('span');
        span.textContent = `${6 - i}弦 ${midiToName(m).replace(/\d/, '')}`;
        return span;
      }),
    );
  }

  reset(): void {
    this.smoother.reset();
    this.noteEl.textContent = '—';
    this.noteEl.classList.remove('in-tune');
    this.freqEl.textContent = '— Hz';
    this.centsEl.textContent = '— ¢';
    this.needleEl.className = 'tuner-needle';
    this.needleEl.style.left = '50%';
    this.stringEl.textContent = '弦を1本ずつ鳴らしてください';
    for (const el of this.stringsEl.children) el.className = '';
  }

  /** Read the analyser, estimate the pitch and redraw. */
  update(analyser: AnalyserNode, sampleRate: number, a4: number, accidental: Accidental): void {
    analyser.getFloatTimeDomainData(this.buf);
    this.updateSamples(this.buf, sampleRate, a4, accidental);
  }

  /** Estimate the pitch of `samples` (most recent mono audio) and redraw. */
  updateSamples(samples: Float32Array, sampleRate: number, a4: number, accidental: Accidental): void {
    const now = performance.now();
    const est = detectPitch(samples, sampleRate, { minFreq: 60, maxFreq: 1400 });
    if (!est) {
      // Keep the last reading briefly so the needle doesn't blink during decay.
      if (now - this.lastPitchedAt > 600) {
        this.smoother.reset();
        this.needleEl.className = 'tuner-needle';
        this.noteEl.classList.remove('in-tune');
      }
      return;
    }
    this.lastPitchedAt = now;
    const freq = this.smoother.push(est.freq);
    const r = toTunerReading(freq, a4);
    const inTune = Math.abs(r.cents) <= IN_TUNE_CENTS;
    this.noteEl.textContent = pretty(midiToName(r.midi, accidental));
    this.noteEl.classList.toggle('in-tune', inTune);
    this.freqEl.textContent = `${freq.toFixed(1)} Hz`;
    this.centsEl.textContent = `${r.cents > 0 ? '+' : ''}${r.cents.toFixed(1)} ¢`;
    this.needleEl.style.left = `${50 + Math.max(-50, Math.min(50, r.cents))}%`;
    this.needleEl.className = `tuner-needle active${inTune ? ' in-tune' : ''}`;

    // Nearest open string, measured in cents from the exact pitch.
    const exact = freqToMidi(freq, a4);
    let nearest = 0;
    OPEN_STRINGS.forEach((m, i) => {
      if (Math.abs(exact - m) < Math.abs(exact - OPEN_STRINGS[nearest])) nearest = i;
    });
    const diff = (exact - OPEN_STRINGS[nearest]) * 100;
    const target = pretty(midiToName(OPEN_STRINGS[nearest], accidental));
    let advice: string;
    if (Math.abs(diff) <= IN_TUNE_CENTS) advice = 'OK';
    else if (Math.abs(diff) >= 150) advice = `${diff > 0 ? '高すぎ' : '低すぎ'}（約${Math.abs(Math.round(diff / 100))}半音）`;
    else advice = `${diff > 0 ? '+' : ''}${diff.toFixed(0)}¢ → ${diff > 0 ? '緩める' : '締める'}`;
    this.stringEl.textContent = `${6 - nearest}弦 ${target}：${advice}`;
    [...this.stringsEl.children].forEach((el, i) => {
      el.className = i === nearest ? (Math.abs(diff) <= IN_TUNE_CENTS ? 'ok' : 'near') : '';
    });
  }
}
