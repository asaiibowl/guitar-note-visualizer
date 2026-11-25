// Turns per-frame pitch confidences into a stable set of sounding notes (pure TS).

export interface TrackerConfig {
  /** Lowest MIDI note considered (E2 = 40). */
  minMidi: number;
  /** Highest MIDI note considered (D6 = 86, 22nd fret on the 1st string). */
  maxMidi: number;
  /** Confidence needed to switch a note on. */
  onThreshold: number;
  /** Confidence below which a note starts to release. */
  offThreshold: number;
  /** Consecutive frames below offThreshold before the note switches off. */
  releaseFrames: number;
}

export const DEFAULT_TRACKER_CONFIG: TrackerConfig = {
  minMidi: 40,
  maxMidi: 86,
  onThreshold: 0.5,
  offThreshold: 0.3,
  releaseFrames: 2,
};

export interface ActiveNote {
  midi: number;
  /** Confidence 0..1 */
  level: number;
  /** Estimated offset from equal temperament in cents (0 when unknown). */
  cents: number;
  /** Frame index at which the note switched on. */
  onFrame: number;
}

/** Layout of the confidence array delivered by the pitch engine. */
export interface LevelLayout {
  firstMidi: number;
  divisionsPerSemitone: number;
}

export const EFFETUNE_LAYOUT: LevelLayout = { firstMidi: 21, divisionsPerSemitone: 5 };

/** Max confidence within ±half a semitone of the given MIDI note. */
export function semitoneLevel(levels: ArrayLike<number>, midi: number, layout: LevelLayout = EFFETUNE_LAYOUT): number {
  const d = layout.divisionsPerSemitone;
  const center = (midi - layout.firstMidi) * d + Math.floor(d / 2);
  const half = Math.floor(d / 2);
  let max = 0;
  for (let i = center - half; i <= center + half; i++) {
    if (i >= 0 && i < levels.length && levels[i] > max) max = levels[i];
  }
  return max;
}

interface NoteState {
  active: boolean;
  below: number;
  onFrame: number;
}

export class NoteTracker {
  config: TrackerConfig;
  private states = new Map<number, NoteState>();

  constructor(config: Partial<TrackerConfig> = {}, private layout: LevelLayout = EFFETUNE_LAYOUT) {
    this.config = { ...DEFAULT_TRACKER_CONFIG, ...config };
  }

  /**
   * @param levels per-bin confidences
   * @param pitchCents optional per-semitone cent offsets indexed from layout.firstMidi
   * @param frameIndex monotonically increasing frame counter
   * @param gateOpen false forces every note off (e.g. input below the noise gate)
   */
  update(levels: ArrayLike<number>, pitchCents: ArrayLike<number> | null, frameIndex: number, gateOpen = true): ActiveNote[] {
    const { minMidi, maxMidi, onThreshold, offThreshold, releaseFrames } = this.config;
    const out: ActiveNote[] = [];
    for (let midi = minMidi; midi <= maxMidi; midi++) {
      const level = gateOpen ? semitoneLevel(levels, midi, this.layout) : 0;
      let st = this.states.get(midi);
      if (!st) {
        st = { active: false, below: 0, onFrame: 0 };
        this.states.set(midi, st);
      }
      if (!st.active) {
        if (level >= onThreshold) {
          st.active = true;
          st.below = 0;
          st.onFrame = frameIndex;
        }
      } else if (level < offThreshold) {
        st.below++;
        if (st.below >= releaseFrames || !gateOpen) st.active = false;
      } else {
        st.below = 0;
      }
      if (st.active) {
        const ci = midi - this.layout.firstMidi;
        const cents = pitchCents && ci >= 0 && ci < pitchCents.length ? pitchCents[ci] : 0;
        out.push({ midi, level, cents: Number.isFinite(cents) ? cents : 0, onFrame: st.onFrame });
      }
    }
    return out;
  }

  reset(): void {
    this.states.clear();
  }
}
