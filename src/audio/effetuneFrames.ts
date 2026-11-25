// Map EffeTune telemetry frames (WASM worklet or native plugin) to the engine-neutral types.
import type { TelemetryFrame } from '@effetune/dsp';
import type { EngineChordHint, PitchFrame } from './pitchEngine';

const QUALITIES = ['', 'm', 'dim', 'aug', 'maj7', 'm7', '7', 'dim7', 'm7♭5', 'sus2', 'sus4'];

export function mapPitchFrame(frame: TelemetryFrame): PitchFrame | null {
  if (frame.kind !== 'noteSpectrogram') return null;
  return {
    levels: frame.levels,
    firstMidi: frame.firstMidi,
    divisionsPerSemitone: frame.divisionsPerSemitone,
    pitchCents: frame.pitchCents,
    frameIndex: frame.frameIndex,
    hopSeconds: frame.hopSeconds,
  };
}

export function mapChordHint(frame: TelemetryFrame): EngineChordHint | null {
  if (frame.kind !== 'noteChordKey') return null;
  return {
    root: frame.immediateRoot,
    quality: frame.immediateQuality == null ? null : (QUALITIES[frame.immediateQuality] ?? '?'),
    bass: frame.immediateBass,
    probability: frame.confirmedProbability,
  };
}
