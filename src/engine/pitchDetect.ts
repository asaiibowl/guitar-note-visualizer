// Monophonic pitch detection for the tuner: McLeod Pitch Method (normalised square difference function).
// Pure TS (no DOM, no Web Audio).

export interface PitchEstimate {
  /** Fundamental frequency in Hz. */
  freq: number;
  /** NSDF peak height, 0..1 (how periodic the signal is). */
  clarity: number;
}

export interface DetectOptions {
  minFreq?: number;
  maxFreq?: number;
  /** Pick the first key maximum that reaches this fraction of the highest one (MPM's "k"). */
  cutoff?: number;
  /** Below this clarity the frame is treated as unpitched. */
  minClarity?: number;
  /** Below this RMS the frame is treated as silence. */
  minRms?: number;
}

/**
 * Estimate the fundamental of `buf` (mono samples). Cost is O(N × maxLag), so with N = 2048 and
 * minFreq = 60 Hz at 48 kHz it is about 1.3 M multiply-adds per call.
 */
export function detectPitch(input: Float32Array, sampleRate: number, opts: DetectOptions = {}): PitchEstimate | null {
  const { minFreq = 60, maxFreq = 1400, cutoff = 0.93, minClarity = 0.8, minRms = 0.003 } = opts;
  let buf = input;
  const n = buf.length;
  // Remove any DC offset first: it keeps the NSDF positive and hides every period peak.
  let mean = 0;
  for (let i = 0; i < n; i++) mean += buf[i];
  mean /= n;
  if (mean !== 0) {
    const centred = new Float32Array(n);
    for (let i = 0; i < n; i++) centred[i] = buf[i] - mean;
    buf = centred;
  }
  let energy = 0;
  for (let i = 0; i < n; i++) energy += buf[i] * buf[i];
  if (Math.sqrt(energy / n) < minRms) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
  const maxLag = Math.min(n - 2, Math.ceil(sampleRate / minFreq));
  if (maxLag <= minLag + 2) return null;

  // NSDF over lags 0..maxLag+1 (lag 0 is 1 by definition).
  const nsdf = new Float32Array(maxLag + 2);
  nsdf[0] = 1;
  // m(τ) = Σ x_j² + x_{j+τ}², updated incrementally.
  let m = 2 * energy;
  for (let tau = 1; tau <= maxLag + 1; tau++) {
    m -= buf[tau - 1] * buf[tau - 1] + buf[n - tau] * buf[n - tau];
    let acf = 0;
    for (let j = 0, end = n - tau; j < end; j++) acf += buf[j] * buf[j + tau];
    nsdf[tau] = m > 0 ? (2 * acf) / m : 0;
  }

  // Key maxima: the highest point between each positive-going and negative-going zero crossing.
  const peaks: number[] = [];
  let tau = 1;
  while (tau <= maxLag && nsdf[tau] > 0) tau++; // skip the lobe around lag 0
  let best = -1;
  let bestTau = -1;
  for (; tau <= maxLag; tau++) {
    if (nsdf[tau] > 0 && nsdf[tau - 1] <= 0) {
      best = -1;
      bestTau = -1;
    }
    if (nsdf[tau] > 0 && nsdf[tau] > best) {
      best = nsdf[tau];
      bestTau = tau;
    }
    if (nsdf[tau] <= 0 && nsdf[tau - 1] > 0 && bestTau > 0) {
      peaks.push(bestTau);
      bestTau = -1;
    }
  }
  if (bestTau > 0) peaks.push(bestTau);
  const candidates = peaks.filter((p) => p >= minLag);
  if (candidates.length === 0) return null;

  const highest = Math.max(...candidates.map((p) => nsdf[p]));
  const chosen = candidates.find((p) => nsdf[p] >= cutoff * highest) ?? candidates[0];

  // Parabolic interpolation around the chosen lag.
  const a = nsdf[chosen - 1];
  const b = nsdf[chosen];
  const c = nsdf[chosen + 1];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  const lag = chosen + Math.max(-0.5, Math.min(0.5, shift));
  const clarity = b - 0.25 * (a - c) * shift;
  if (clarity < minClarity) return null;
  return { freq: sampleRate / lag, clarity: Math.min(1, clarity) };
}

/** Frequency -> fractional MIDI number. */
export function freqToMidi(freq: number, a4 = 440): number {
  return 69 + 12 * Math.log2(freq / a4);
}

export interface TunerReading {
  freq: number;
  /** Nearest equal-tempered MIDI note. */
  midi: number;
  /** Deviation from that note in cents (-50..+50). */
  cents: number;
}

export function toTunerReading(freq: number, a4 = 440): TunerReading {
  const exact = freqToMidi(freq, a4);
  const midi = Math.round(exact);
  return { freq, midi, cents: (exact - midi) * 100 };
}

/** Median of the last few readings, to keep the needle steady without adding much lag. */
export class FreqSmoother {
  private history: number[] = [];
  constructor(private size = 5) {}

  push(freq: number): number {
    // Jumps of more than ~a semitone reset the history so a new string responds at once.
    const last = this.history[this.history.length - 1];
    if (last != null && Math.abs(12 * Math.log2(freq / last)) > 0.7) this.history = [];
    this.history.push(freq);
    if (this.history.length > this.size) this.history.shift();
    const sorted = [...this.history].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  reset(): void {
    this.history = [];
  }
}
