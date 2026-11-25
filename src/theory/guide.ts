// Key / scale guide: which pitch classes belong to the chosen scale, and how a chord functions in that key.
// Pure TS (no DOM, no Web Audio).
import { Chord, Scale } from 'tonal';
import { type Accidental, intervalSemitones, intervalToDegree, pcName, pretty } from './notes';

export interface ScaleDef {
  id: string;
  /** Display name (Japanese). */
  label: string;
  /** tonal scale name. */
  tonal: string;
}

export const SCALES: readonly ScaleDef[] = [
  { id: 'major', label: 'メジャー（イオニアン）', tonal: 'major' },
  { id: 'minor', label: 'ナチュラルマイナー（エオリアン）', tonal: 'aeolian' },
  { id: 'harmonic-minor', label: 'ハーモニックマイナー', tonal: 'harmonic minor' },
  { id: 'melodic-minor', label: 'メロディックマイナー', tonal: 'melodic minor' },
  { id: 'major-pentatonic', label: 'メジャーペンタトニック', tonal: 'major pentatonic' },
  { id: 'minor-pentatonic', label: 'マイナーペンタトニック', tonal: 'minor pentatonic' },
  { id: 'blues', label: 'ブルース', tonal: 'blues' },
  { id: 'dorian', label: 'ドリアン', tonal: 'dorian' },
  { id: 'phrygian', label: 'フリジアン', tonal: 'phrygian' },
  { id: 'lydian', label: 'リディアン', tonal: 'lydian' },
  { id: 'mixolydian', label: 'ミクソリディアン', tonal: 'mixolydian' },
  { id: 'locrian', label: 'ロクリアン', tonal: 'locrian' },
];

export interface GuideScale {
  tonicPc: number;
  scaleId: string;
  /** Pitch class -> scale degree label relative to the tonic ("R", "2", "♭3", ...). */
  degrees: Map<number, string>;
}

/** Scale tones of `tonicPc` + scale, with degree labels. Returns null for an unknown scale id. */
export function buildScale(tonicPc: number, scaleId: string): GuideScale | null {
  const def = SCALES.find((s) => s.id === scaleId);
  if (!def) return null;
  const scale = Scale.get(`C ${def.tonal}`);
  if (scale.empty) return null;
  const degrees = new Map<number, string>();
  for (const iv of scale.intervals) {
    const pc = (tonicPc + intervalSemitones(iv)) % 12;
    if (!degrees.has(pc)) degrees.set(pc, intervalToDegree(iv));
  }
  return { tonicPc, scaleId, degrees };
}

/** Human-readable key name, e.g. "A マイナーペンタトニック". */
export function scaleTitle(guide: GuideScale, accidental: Accidental): string {
  const def = SCALES.find((s) => s.id === guide.scaleId);
  return `${pretty(pcName(guide.tonicPc, accidental))} ${def?.label ?? ''}`;
}

const NUMERALS = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♯IV', 'V', '♭VI', 'VI', '♭VII', 'VII'];

/**
 * Roman-numeral function of a chord relative to the guide tonic, e.g. "V7", "ii", "♭VII".
 * `symbol` is a tonal chord symbol (or power-chord "C5"); returns null when there is no root.
 */
export function romanNumeral(rootPc: number | null, symbol: string | null, tonicPc: number): string | null {
  if (rootPc == null) return null;
  const base = NUMERALS[(rootPc - tonicPc + 12) % 12];
  if (!symbol) return base;
  const chord = Chord.get(symbol.split('/')[0]);
  if (chord.empty) return base;
  const has = (iv: string): boolean => chord.intervals.includes(iv);
  const minorThird = has('3m');
  const dim = minorThird && has('5d');
  const aug = has('3M') && has('5A');
  const numeral = minorThird ? base.replace(/[IV]+/, (m) => m.toLowerCase()) : base;
  let suffix = '';
  if (dim) suffix = has('7d') ? '°7' : has('7m') ? 'ø7' : '°';
  else if (aug) suffix = '+';
  else if (has('7M')) suffix = 'maj7';
  else if (has('7m')) suffix = '7';
  else if (has('6M') && !has('3m')) suffix = '6';
  return numeral + suffix;
}
