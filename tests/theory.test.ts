import { describe, expect, it } from 'vitest';
import { midiToName, intervalSemitones, intervalToDegree, intervalNameJa } from '../src/theory/notes';
import { positionsOf, positionsOfPitchClass, instrumentRange } from '../src/theory/fretboard';
import { analyzeNotes, ChordStabilizer, NO_CHORD } from '../src/theory/chordNamer';

describe('notes', () => {
  it('names MIDI notes', () => {
    expect(midiToName(60)).toBe('C4');
    expect(midiToName(40)).toBe('E2');
    expect(midiToName(61, 'flat')).toBe('Db4');
    expect(midiToName(86)).toBe('D6');
  });
  it('converts tonal intervals', () => {
    expect(intervalSemitones('3m')).toBe(3);
    expect(intervalSemitones('9M')).toBe(2);
    expect(intervalSemitones('5d')).toBe(6);
    expect(intervalSemitones('7d')).toBe(9);
    expect(intervalSemitones('-3M')).toBe(8);
    expect(intervalToDegree('1P')).toBe('R');
    expect(intervalToDegree('3m')).toBe('♭3');
    expect(intervalToDegree('9M')).toBe('9');
    expect(intervalToDegree('5A')).toBe('♯5');
    expect(intervalNameJa(7)).toBe('完全5度');
  });
});

describe('fretboard', () => {
  it('finds every position of C4', () => {
    const pos = positionsOf(60);
    expect(pos).toEqual([
      { string: 2, fret: 1 },
      { string: 3, fret: 5 },
      { string: 4, fret: 10 },
      { string: 5, fret: 15 },
      { string: 6, fret: 20 },
    ]);
  });
  it('finds pitch-class positions across octaves', () => {
    const pos = positionsOfPitchClass(4); // E
    expect(pos).toContainEqual({ string: 1, fret: 0 });
    expect(pos).toContainEqual({ string: 6, fret: 12 });
    expect(pos).toContainEqual({ string: 1, fret: 12 });
    // each string has 1-2 Es within 0..22
    expect(pos.length).toBeGreaterThanOrEqual(10);
  });
  it('reports the playable range', () => {
    expect(instrumentRange()).toEqual([40, 86]);
  });
});

describe('chord naming', () => {
  it('handles empty and single notes', () => {
    expect(analyzeNotes([]).kind).toBe('none');
    const s = analyzeNotes([60]);
    expect(s.kind).toBe('single');
    expect(s.name).toBe('C4');
  });
  it('names power chords and intervals', () => {
    expect(analyzeNotes([48, 55]).name).toBe('C5');
    expect(analyzeNotes([43, 48]).name).toBe('C5/G');
    const third = analyzeNotes([60, 64]);
    expect(third.kind).toBe('interval');
    expect(third.description).toBe('長3度');
  });
  it('names triads, inversions and added tones', () => {
    expect(analyzeNotes([48, 52, 55]).name).toBe('C');
    expect(analyzeNotes([52, 55, 60]).name).toBe('C/E');
    expect(analyzeNotes([48, 52, 55, 62]).name).toBe('Cadd9');
    expect(analyzeNotes([40, 47, 52, 55, 59, 64]).name).toBe('Em');
    expect(analyzeNotes([43, 47, 50, 53]).name).toBe('G7');
    expect(analyzeNotes([48, 52, 58]).name).toBe('C7no5');
  });
  it('labels degrees relative to the root', () => {
    const a = analyzeNotes([48, 52, 55, 62]);
    expect(a.rootPc).toBe(0);
    expect(a.degrees.get(0)).toBe('R');
    expect(a.degrees.get(4)).toBe('3');
    expect(a.degrees.get(7)).toBe('5');
    expect(a.degrees.get(2)).toBe('9');
    const inv = analyzeNotes([52, 55, 60]);
    expect(inv.rootPc).toBe(0);
    expect(inv.bassPc).toBe(4);
    expect(inv.degrees.get(4)).toBe('3');
  });
  it('prettifies accidentals inside chord symbols', () => {
    expect(analyzeNotes([48, 51, 54, 58]).name).toBe('Cm7♭5');
  });
  it('supports flat spelling', () => {
    expect(analyzeNotes([46, 50, 53], 'flat').name).toBe('B♭');
  });
});

describe('ChordStabilizer', () => {
  it('needs consecutive frames before switching', () => {
    const st = new ChordStabilizer(2, 3);
    const c = analyzeNotes([48, 52, 55]);
    const g = analyzeNotes([43, 47, 50]);
    expect(st.update(c).key).toBe(NO_CHORD.key);
    expect(st.update(c).name).toBe('C');
    expect(st.update(g).name).toBe('C');
    expect(st.update(g).name).toBe('G');
    expect(st.update(NO_CHORD).name).toBe('G');
    expect(st.update(NO_CHORD).name).toBe('G');
    expect(st.update(NO_CHORD).kind).toBe('none');
  });
});
