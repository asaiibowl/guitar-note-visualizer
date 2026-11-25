// Pure fretboard geometry for standard EADGBE tuning.

/** Open-string MIDI notes, index 0 = 1st string (high E) ... index 5 = 6th string (low E). */
export const STANDARD_TUNING: readonly number[] = [64, 59, 55, 50, 45, 40];
export const FRET_COUNT = 22;

export interface FretPosition {
  /** 1 = high E ... 6 = low E */
  string: number;
  fret: number;
}

export function midiAt(string: number, fret: number, tuning: readonly number[] = STANDARD_TUNING): number {
  return tuning[string - 1] + fret;
}

/** Every position that sounds exactly this MIDI pitch. */
export function positionsOf(midi: number, frets = FRET_COUNT, tuning: readonly number[] = STANDARD_TUNING): FretPosition[] {
  const out: FretPosition[] = [];
  tuning.forEach((open, i) => {
    const fret = midi - open;
    if (fret >= 0 && fret <= frets) out.push({ string: i + 1, fret });
  });
  return out;
}

/** Every position whose pitch class matches (all octaves). */
export function positionsOfPitchClass(pc: number, frets = FRET_COUNT, tuning: readonly number[] = STANDARD_TUNING): FretPosition[] {
  const out: FretPosition[] = [];
  tuning.forEach((open, i) => {
    for (let fret = 0; fret <= frets; fret++) {
      if ((((open + fret) % 12) + 12) % 12 === pc) out.push({ string: i + 1, fret });
    }
  });
  return out;
}

/** Playable MIDI range of the instrument. */
export function instrumentRange(frets = FRET_COUNT, tuning: readonly number[] = STANDARD_TUNING): [number, number] {
  return [Math.min(...tuning), Math.max(...tuning) + frets];
}
