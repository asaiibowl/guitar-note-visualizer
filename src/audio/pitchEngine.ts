// Engine-neutral contract so the detector can be swapped (EffeTune today, something else later).

export interface PitchFrame {
  /** Confidence per pitch bin (layout described by firstMidi / divisionsPerSemitone). */
  levels: Float32Array;
  firstMidi: number;
  divisionsPerSemitone: number;
  /** Cent offsets per semitone from firstMidi, or null. */
  pitchCents: Float32Array | null;
  frameIndex: number;
  hopSeconds: number;
}

/** Optional chord estimate from the engine itself (used only for comparison). */
export interface EngineChordHint {
  root: number | null;
  quality: string | null;
  bass: number | null;
  probability: number;
}

export interface PitchEngine {
  /** Mono/stereo input node to connect the guitar signal into. */
  readonly input: AudioNode;
  onFrame(cb: (frame: PitchFrame) => void): void;
  onChordHint(cb: (hint: EngineChordHint) => void): void;
  dispose(): void;
}
