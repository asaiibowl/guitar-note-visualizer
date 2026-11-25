// Pure chord naming from a set of sounding MIDI notes (no DOM, no Web Audio).
import { Chord, Note } from 'tonal';
import {
  type Accidental,
  genericDegree,
  intervalNameJa,
  intervalSemitones,
  intervalToDegree,
  midiToName,
  pcName,
  pitchClass,
  pretty,
} from './notes';

export type ChordKind = 'none' | 'single' | 'interval' | 'chord' | 'unknown';

export interface ChordAnalysis {
  kind: ChordKind;
  /** Display name with ♯/♭ symbols, e.g. "C/E", "C4", "C5". */
  name: string;
  /** tonal chord symbol of the chosen interpretation, if any. */
  symbol: string | null;
  /** Other interpretations (display form). */
  alternatives: string[];
  /** Short explanation, e.g. the interval name for two notes. */
  description: string;
  rootPc: number | null;
  bassPc: number | null;
  /** Pitch class -> degree label relative to the root ("R", "♭3", "5", "9"...). */
  degrees: Map<number, string>;
  /** Stable identity used for flicker suppression. */
  key: string;
}

export const NO_CHORD: ChordAnalysis = {
  kind: 'none',
  name: '',
  symbol: null,
  alternatives: [],
  description: '',
  rootPc: null,
  bassPc: null,
  degrees: new Map(),
  key: 'none',
};

/** Make tonal symbols read like lead-sheet names: "CM" -> "C", "CMadd9" -> "Cadd9", "CM/E" -> "C/E". */
export function formatSymbol(symbol: string): string {
  const s = symbol
    .replace(/^([A-G][#b]*)M(?=$|\/|add)/, '$1')
    .replace(/^([A-G][#b]*)6add9/, '$16/9');
  return pretty(s);
}

function genericDegrees(pcs: number[], rootPc: number): Map<number, string> {
  return new Map(pcs.map((pc) => [pc, genericDegree(pc - rootPc)]));
}

export function analyzeNotes(midis: readonly number[], accidental: Accidental = 'sharp'): ChordAnalysis {
  if (midis.length === 0) return NO_CHORD;
  const sorted = [...midis].map(Math.round).sort((a, b) => a - b);
  const bass = sorted[0];
  const bassPc = pitchClass(bass);
  // Unique pitch classes, bass first, then ascending above the bass.
  const pcs = [...new Set(sorted.map(pitchClass))].sort(
    (a, b) => ((a - bassPc + 12) % 12) - ((b - bassPc + 12) % 12),
  );

  if (pcs.length === 1) {
    const octaves = [...new Set(sorted)];
    const name = pretty(octaves.map((m) => midiToName(m, accidental)).join(' + '));
    return {
      kind: 'single',
      name,
      symbol: null,
      alternatives: [],
      description: octaves.length > 1 ? 'オクターブ' : '単音',
      rootPc: bassPc,
      bassPc,
      degrees: new Map([[bassPc, 'R']]),
      key: `single:${octaves.join(',')}`,
    };
  }

  if (pcs.length === 2) {
    const other = pcs[1];
    const semis = (other - bassPc + 12) % 12;
    const bassName = pcName(bassPc, accidental);
    const otherName = pcName(other, accidental);
    if (semis === 7) {
      return {
        kind: 'interval',
        name: pretty(`${bassName}5`),
        symbol: `${bassName}5`,
        alternatives: [],
        description: `パワーコード（${intervalNameJa(7)}）`,
        rootPc: bassPc,
        bassPc,
        degrees: new Map([[bassPc, 'R'], [other, '5']]),
        key: `int:${bassPc}:${other}`,
      };
    }
    if (semis === 5) {
      return {
        kind: 'interval',
        name: pretty(`${otherName}5/${bassName}`),
        symbol: `${otherName}5/${bassName}`,
        alternatives: [],
        description: `パワーコード転回（${intervalNameJa(5)}）`,
        rootPc: other,
        bassPc,
        degrees: new Map([[other, 'R'], [bassPc, '5']]),
        key: `int:${bassPc}:${other}`,
      };
    }
    return {
      kind: 'interval',
      name: pretty(`${bassName} + ${otherName}`),
      symbol: null,
      alternatives: [],
      description: intervalNameJa(semis),
      rootPc: bassPc,
      bassPc,
      degrees: genericDegrees(pcs, bassPc),
      key: `int:${bassPc}:${other}`,
    };
  }

  const names = pcs.map((pc) => pcName(pc, accidental));
  const detected = Chord.detect(names, { assumePerfectFifth: true });
  if (detected.length === 0) {
    return {
      kind: 'unknown',
      name: pretty(names.join(' ')),
      symbol: null,
      alternatives: [],
      description: '名前の付かない響き（クラスター）',
      rootPc: bassPc,
      bassPc,
      degrees: genericDegrees(pcs, bassPc),
      key: `unk:${pcs.join(',')}`,
    };
  }

  const symbol = detected[0];
  const chord = Chord.get(symbol);
  const rootPc = Note.chroma(chord.tonic ?? '') ?? bassPc;
  const degrees = new Map<number, string>();
  for (const pc of pcs) {
    const semis = (pc - rootPc + 12) % 12;
    const iv = chord.intervals.find((i) => intervalSemitones(i) === semis);
    degrees.set(pc, iv ? intervalToDegree(iv) : genericDegree(semis));
  }
  return {
    kind: 'chord',
    name: formatSymbol(symbol),
    symbol,
    alternatives: detected.slice(1, 4).map(formatSymbol),
    description: chord.name && chord.name !== symbol ? chord.name : '',
    rootPc,
    bassPc,
    degrees,
    key: `chord:${symbol}`,
  };
}

/** Holds the displayed analysis until a new one has been seen for N consecutive frames. */
export class ChordStabilizer {
  private candidate: ChordAnalysis = NO_CHORD;
  private count = 0;
  private shown: ChordAnalysis = NO_CHORD;

  constructor(private framesToChange = 2, private framesToClear = 3) {}

  update(next: ChordAnalysis): ChordAnalysis {
    if (next.key === this.candidate.key) this.count++;
    else {
      this.candidate = next;
      this.count = 1;
    }
    const need = next.kind === 'none' ? this.framesToClear : this.framesToChange;
    if (this.count >= need || next.key === this.shown.key) this.shown = next;
    return this.shown;
  }

  reset(): void {
    this.candidate = NO_CHORD;
    this.shown = NO_CHORD;
    this.count = 0;
  }
}
