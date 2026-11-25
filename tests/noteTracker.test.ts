import { describe, expect, it } from 'vitest';
import { NoteTracker, semitoneLevel } from '../src/engine/noteTracker';

function frame(notes: Record<number, number>): Float32Array {
  const levels = new Float32Array(440);
  for (const [midi, level] of Object.entries(notes)) {
    levels[(Number(midi) - 21) * 5 + 2] = level;
  }
  return levels;
}

describe('semitoneLevel', () => {
  it('reads the max within ±2 sub-bins', () => {
    const l = new Float32Array(440);
    l[(60 - 21) * 5 + 4] = 0.7; // +40 cents
    expect(semitoneLevel(l, 60)).toBeCloseTo(0.7);
    expect(semitoneLevel(l, 61)).toBe(0);
  });
});

describe('NoteTracker', () => {
  it('switches on at onThreshold and off after releaseFrames below offThreshold', () => {
    const t = new NoteTracker({ onThreshold: 0.5, offThreshold: 0.3, releaseFrames: 2 });
    expect(t.update(frame({ 60: 0.4 }), null, 0)).toEqual([]);
    expect(t.update(frame({ 60: 0.6 }), null, 1).map((n) => n.midi)).toEqual([60]);
    // hysteresis: stays on between off and on thresholds
    expect(t.update(frame({ 60: 0.35 }), null, 2).map((n) => n.midi)).toEqual([60]);
    // one frame below off threshold is tolerated
    expect(t.update(frame({ 60: 0.2 }), null, 3).map((n) => n.midi)).toEqual([60]);
    expect(t.update(frame({ 60: 0.2 }), null, 4)).toEqual([]);
  });

  it('does not flap on a level hovering near the on threshold', () => {
    const t = new NoteTracker({ onThreshold: 0.5, offThreshold: 0.3, releaseFrames: 2 });
    const seq = [0.55, 0.45, 0.52, 0.48, 0.51, 0.47];
    const states = seq.map((v, i) => t.update(frame({ 64: v }), null, i).length);
    expect(states).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('closes immediately when the gate closes', () => {
    const t = new NoteTracker();
    t.update(frame({ 52: 0.9 }), null, 0);
    expect(t.update(frame({ 52: 0.9 }), null, 1, false)).toEqual([]);
  });

  it('ignores notes outside the guitar range and reports cents', () => {
    const t = new NoteTracker();
    const cents = new Float32Array(88);
    cents[60 - 21] = -12;
    const notes = t.update(frame({ 30: 0.9, 60: 0.9, 100: 0.9 }), cents, 0);
    expect(notes.map((n) => n.midi)).toEqual([60]);
    expect(notes[0].cents).toBeCloseTo(-12);
  });
});
