// Synthetic plucked-string (Karplus-Strong) test signal so the app can be checked without a guitar.

function pluck(context: BaseAudioContext, midi: number, seconds: number, seed: number): Float32Array {
  const sr = context.sampleRate;
  const f = 440 * 2 ** ((midi - 69) / 12);
  const n = Math.max(2, Math.round(sr / f));
  const ring = new Float32Array(n);
  let s = seed * 9301 + 49297;
  for (let i = 0; i < n; i++) {
    s = (s * 16807) % 2147483647;
    ring[i] = (s / 2147483647) * 2 - 1;
  }
  const out = new Float32Array(Math.round(sr * seconds));
  let idx = 0;
  for (let i = 0; i < out.length; i++) {
    const a = ring[idx];
    const b = ring[(idx + 1) % n];
    ring[idx] = 0.996 * 0.5 * (a + b);
    out[i] = a;
    idx = (idx + 1) % n;
  }
  return out;
}

export interface ScheduledSignal {
  /** AudioContext time at which the first string sounds. */
  startTime: number;
  stop(): void;
}

/**
 * Plays the given notes as a strum into `destination`.
 * @param strumMs delay between successive strings (low to high)
 */
export function playTestNotes(
  context: AudioContext,
  destination: AudioNode,
  midis: number[],
  { seconds = 2.0, strumMs = 12, gain = 0.25 } = {},
): ScheduledSignal {
  const sr = context.sampleRate;
  const sorted = [...midis].sort((a, b) => a - b);
  const total = seconds + (sorted.length * strumMs) / 1000;
  const buffer = context.createBuffer(1, Math.round(sr * total), sr);
  const data = buffer.getChannelData(0);
  sorted.forEach((m, k) => {
    const offset = Math.round((k * strumMs * sr) / 1000);
    const tone = pluck(context, m, seconds, k + 1);
    for (let i = 0; i < tone.length && offset + i < data.length; i++) data[offset + i] += gain * tone[i];
  });
  const src = context.createBufferSource();
  src.buffer = buffer;
  src.connect(destination);
  const startTime = context.currentTime + 0.05;
  src.start(startTime);
  return {
    startTime,
    stop: () => {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    },
  };
}

export const TEST_PRESETS: { label: string; notes: number[] }[] = [
  { label: 'C4 単音', notes: [60] },
  { label: 'E2 単音', notes: [40] },
  { label: 'C (開放)', notes: [48, 52, 55, 60, 64] },
  { label: 'Em (開放)', notes: [40, 47, 52, 55, 59, 64] },
  { label: 'G7', notes: [43, 47, 50, 53, 59, 67] },
  { label: 'Cadd9', notes: [48, 52, 55, 62, 64] },
  { label: 'Am7', notes: [45, 52, 55, 60, 64] },
  { label: 'D/F♯', notes: [42, 50, 57, 62, 66] },
];
