// Bridge to the VST3 / Standalone host (JUCE WebBrowserComponent).
// When the page runs inside the plugin, audio analysis happens natively and arrives as events.
import type { TelemetryFrame } from '@effetune/dsp';
import { decodeTelemetryPacket, type TelemetryNode } from 'effetune-telemetry';
import type { EngineChordHint, PitchFrame } from './pitchEngine';
import { mapChordHint, mapPitchFrame } from './effetuneFrames';

interface JuceBackend {
  addEventListener(id: string, fn: (payload: unknown) => void): unknown;
  emitEvent(id: string, payload: unknown): void;
}

function backend(): JuceBackend | null {
  const juce = (window as unknown as { __JUCE__?: { backend?: JuceBackend } }).__JUCE__;
  return juce?.backend ?? null;
}

/** True when the page is hosted by the plugin. */
export function isPluginHost(): boolean {
  return backend() != null;
}

export interface PluginInit {
  inputChannel: number;
  uiState: string;
  sampleRate: number;
}

export interface PluginAudio {
  levelDb: number;
  sampleRate: number;
  engineReady: boolean;
  /** Most recent mono samples (only while the tuner is on). */
  samples: Float32Array | null;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const NODES = new Map<number, TelemetryNode>([[1, { effectId: 'ns', effectType: 'NoteSpectrogram', tapId: 1 }]]);

export class NativeEngine {
  private frameCbs: ((f: PitchFrame) => void)[] = [];
  private hintCbs: ((h: EngineChordHint) => void)[] = [];
  private audioCbs: ((a: PluginAudio) => void)[] = [];
  private pendingDropped = 0;
  private readonly be: JuceBackend;

  constructor() {
    const be = backend();
    if (!be) throw new Error('Not running inside the plugin');
    this.be = be;
    be.addEventListener('gnvTelemetry', (payload) => {
      if (typeof payload !== 'string') return;
      const bytes = base64ToBytes(payload);
      const decoded = decodeTelemetryPacket(bytes, bytes.byteLength, NODES, this.pendingDropped);
      this.pendingDropped = decoded.pendingDropped;
      for (const f of decoded.frames as TelemetryFrame[]) this.dispatch(f);
    });
    be.addEventListener('gnvAudio', (payload) => {
      const p = payload as { levelDb: number; sampleRate: number; engineReady: boolean; samples?: string };
      const audio: PluginAudio = {
        levelDb: p.levelDb,
        sampleRate: p.sampleRate,
        engineReady: p.engineReady,
        samples: p.samples ? new Float32Array(base64ToBytes(p.samples).buffer) : null,
      };
      for (const cb of this.audioCbs) cb(audio);
    });
  }

  /** Resolves with the saved plugin state once the host answers. */
  ready(): Promise<PluginInit> {
    return new Promise((resolve) => {
      this.be.addEventListener('gnvInit', (payload) => resolve(payload as PluginInit));
      this.be.emitEvent('gnvReady', {});
    });
  }

  private dispatch(frame: TelemetryFrame): void {
    const pf = mapPitchFrame(frame);
    if (pf) for (const cb of this.frameCbs) cb(pf);
    const hint = mapChordHint(frame);
    if (hint) for (const cb of this.hintCbs) cb(hint);
  }

  onFrame(cb: (frame: PitchFrame) => void): void {
    this.frameCbs.push(cb);
  }

  onChordHint(cb: (hint: EngineChordHint) => void): void {
    this.hintCbs.push(cb);
  }

  onAudio(cb: (audio: PluginAudio) => void): void {
    this.audioCbs.push(cb);
  }

  setChannel(channel: number): void {
    this.be.emitEvent('gnvSetChannel', { channel });
  }

  /** Synthetic plucked notes, analysed but not sent to the plugin's output. */
  playTest(midis: number[]): void {
    this.be.emitEvent('gnvTest', { midis: midis.slice(0, 6) });
  }

  setTuner(on: boolean): void {
    this.be.emitEvent('gnvTuner', { on });
  }

  saveState(json: string): void {
    this.be.emitEvent('gnvState', { json });
  }
}
