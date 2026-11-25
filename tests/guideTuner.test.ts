import { describe, expect, it } from 'vitest';
import { buildScale, romanNumeral, scaleTitle, SCALES } from '../src/theory/guide';
import { detectPitch, FreqSmoother, toTunerReading } from '../src/engine/pitchDetect';

describe('guide scales', () => {
  it('builds C major', () => {
    const g = buildScale(0, 'major')!;
    expect([...g.degrees.keys()].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(g.degrees.get(0)).toBe('R');
    expect(g.degrees.get(11)).toBe('7');
  });
  it('builds A minor pentatonic with degree labels', () => {
    const g = buildScale(9, 'minor-pentatonic')!;
    expect([...g.degrees.keys()].sort((a, b) => a - b)).toEqual([0, 2, 4, 7, 9]);
    expect(g.degrees.get(0)).toBe('♭3');
    expect(g.degrees.get(7)).toBe('♭7');
  });
  it('includes the blue note', () => {
    const g = buildScale(4, 'blues')!; // E blues: E G A A# B D
    expect(g.degrees.get(10)).toBe('♭5');
  });
  it('builds every listed scale', () => {
    for (const s of SCALES) expect(buildScale(2, s.id)?.degrees.size).toBeGreaterThanOrEqual(5);
  });
  it('titles the key', () => {
    expect(scaleTitle(buildScale(10, 'major')!, 'flat')).toBe('B♭ メジャー（イオニアン）');
  });
});

describe('roman numerals', () => {
  it('labels diatonic chords in C', () => {
    expect(romanNumeral(0, 'CM', 0)).toBe('I');
    expect(romanNumeral(2, 'Dm', 0)).toBe('ii');
    expect(romanNumeral(7, 'G7', 0)).toBe('V7');
    expect(romanNumeral(11, 'Bm7b5', 0)).toBe('viiø7');
    expect(romanNumeral(5, 'Fmaj7', 0)).toBe('IVmaj7');
    expect(romanNumeral(10, 'BbM', 0)).toBe('♭VII');
    expect(romanNumeral(0, 'CM/E', 0)).toBe('I');
  });
  it('labels relative to another key', () => {
    expect(romanNumeral(4, 'E7', 9)).toBe('V7'); // E7 in A
    expect(romanNumeral(9, 'Am', 9)).toBe('i');
  });
});

function guitarTone(freq: number, sr: number, n: number, phase = 0): Float32Array {
  // Harmonic-rich tone with a weak fundamental, like a plucked low string.
  const out = new Float32Array(n);
  const amps = [0.4, 1, 0.7, 0.5, 0.3, 0.2];
  for (let i = 0; i < n; i++) {
    let v = 0;
    amps.forEach((a, h) => (v += a * Math.sin(2 * Math.PI * freq * (h + 1) * (i / sr) + phase * (h + 1))));
    out[i] = 0.2 * v;
  }
  return out;
}

describe('tuner pitch detection', () => {
  const sr = 48000;
  it.each([82.41, 110, 146.83, 196, 246.94, 329.63])('detects %f Hz within 1 cent', (f) => {
    const est = detectPitch(guitarTone(f, sr, 2048, 0.3), sr)!;
    expect(est).not.toBeNull();
    const cents = 1200 * Math.log2(est.freq / f);
    expect(Math.abs(cents)).toBeLessThan(1);
  });
  it('ignores a DC offset', () => {
    const tone = guitarTone(110, sr, 2048, 0.1).map((v) => v + 0.3);
    const est = detectPitch(tone, sr)!;
    expect(Math.abs(1200 * Math.log2(est.freq / 110))).toBeLessThan(1);
  });
  it('returns null for silence and noise', () => {
    expect(detectPitch(new Float32Array(2048), sr)).toBeNull();
    const noise = new Float32Array(2048).map(() => (Math.random() * 2 - 1) * 0.3);
    expect(detectPitch(noise, sr)).toBeNull();
  });
  it('converts to note and cents', () => {
    const r = toTunerReading(442);
    expect(r.midi).toBe(69);
    expect(r.cents).toBeCloseTo(7.85, 1);
    expect(toTunerReading(442, 442).cents).toBeCloseTo(0, 5);
  });
  it('smooths with a median and resets on a new note', () => {
    const s = new FreqSmoother(3);
    s.push(110);
    s.push(150);
    expect(s.push(110.2)).toBeCloseTo(110.2, 5);
    expect(s.push(110.1)).toBeCloseTo(110.15, 0);
  });
});
