// Pure note / interval helpers (no DOM, no Web Audio).

export type Accidental = 'sharp' | 'flat';

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

export function pitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

export function octaveOf(midi: number): number {
  return Math.floor(Math.round(midi) / 12) - 1;
}

/** Pitch-class name in ASCII (C#, Bb), as used by tonal. */
export function pcName(pc: number, accidental: Accidental = 'sharp'): string {
  const names = accidental === 'flat' ? FLAT_NAMES : SHARP_NAMES;
  return names[((pc % 12) + 12) % 12];
}

/** MIDI number to scientific pitch name, e.g. 60 -> "C4". */
export function midiToName(midi: number, accidental: Accidental = 'sharp'): string {
  return pcName(pitchClass(midi), accidental) + octaveOf(midi);
}

export function midiToFreq(midi: number, a4 = 440): number {
  return a4 * 2 ** ((midi - 69) / 12);
}

/** Replace ASCII accidentals with music symbols for display. */
export function pretty(text: string): string {
  return text.replace(/#/g, '♯').replace(/(?<=[A-G])b/g, '♭').replace(/b(?=\d)/g, '♭');
}

const INTERVAL_JA = [
  '完全1度', '短2度', '長2度', '短3度', '長3度', '完全4度',
  '増4度/減5度', '完全5度', '短6度', '長6度', '短7度', '長7度',
];

/** Japanese interval name for a semitone distance (compound intervals keep the octave count). */
export function intervalNameJa(semitones: number): string {
  const s = Math.abs(Math.round(semitones));
  if (s === 0) return '同音';
  if (s % 12 === 0) return s === 12 ? '完全8度（オクターブ）' : `${s / 12}オクターブ`;
  const base = INTERVAL_JA[s % 12];
  const oct = Math.floor(s / 12);
  return oct > 0 ? `${base}（+${oct}oct）` : base;
}

/** Generic degree label relative to a root, used when no chord spelling is available. */
const GENERIC_DEGREE = ['R', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♯5', '6', '♭7', '7'];

export function genericDegree(semitonesFromRoot: number): string {
  return GENERIC_DEGREE[((semitonesFromRoot % 12) + 12) % 12];
}

/** Convert a tonal interval string ("3m", "9M", "5d", "1P") into a degree label ("♭3", "9", "♭5", "R"). */
export function intervalToDegree(interval: string): string {
  const m = /^(-?)(\d+)([PMmdA]+)$/.exec(interval);
  if (!m) return interval;
  const num = Number(m[2]);
  const q = m[3];
  if (num === 1 || num === 8) return 'R';
  if (q === 'P' || q === 'M') return String(num);
  if (q === 'm') return `♭${num}`;
  if (q === 'A') return `♯${num}`;
  if (q === 'AA') return `𝄪${num}`;
  if (q === 'd') return num === 7 ? `𝄫7` : `♭${num}`;
  if (q === 'dd') return `𝄫${num}`;
  return interval;
}

/** Semitone size of a tonal interval string, modulo 12. */
export function intervalSemitones(interval: string): number {
  const m = /^(-?)(\d+)([PMmdA]+)$/.exec(interval);
  if (!m) return 0;
  const num = Number(m[2]);
  const q = m[3];
  const simple = ((num - 1) % 7) + 1;
  const majorOrPerfect = [0, 0, 2, 4, 5, 7, 9, 11][simple];
  const perfect = simple === 1 || simple === 4 || simple === 5;
  let delta = 0;
  if (q === 'm') delta = -1;
  else if (q === 'A') delta = 1;
  else if (q === 'AA') delta = 2;
  else if (q === 'd') delta = perfect ? -1 : -2;
  else if (q === 'dd') delta = perfect ? -2 : -3;
  const s = (((majorOrPerfect + delta) % 12) + 12) % 12;
  return m[1] === '-' ? (12 - s) % 12 : s;
}
