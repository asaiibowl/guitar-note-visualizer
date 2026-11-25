// PitchEngine backed by EffeTune's NoteSpectrogram (MIT, WebAssembly AudioWorklet).
import { EffeTuneNode } from '@effetune/dsp/worklet';
import type { EngineChordHint, PitchEngine, PitchFrame } from './pitchEngine';
import { mapChordHint, mapPitchFrame } from './effetuneFrames';

function vendorUrl(file: string): URL {
  return new URL(`vendor/effetune-dsp/${file}`, document.baseURI);
}

export class EffeTuneEngine implements PitchEngine {
  private frameCbs: ((f: PitchFrame) => void)[] = [];
  private hintCbs: ((h: EngineChordHint) => void)[] = [];
  private unsubscribe: (() => void) | null = null;

  private constructor(private node: EffeTuneNode, readonly input: AudioNode) {}

  static async create(context: AudioContext, range: { minMidi: number; maxMidi: number }): Promise<EffeTuneEngine> {
    const node = await EffeTuneNode.create(
      context,
      [
        {
          id: 'ns',
          type: 'NoteSpectrogram',
          parameters: { minimumMidi: range.minMidi, maximumMidi: range.maxMidi, chordKeyEnabled: true },
        },
      ],
      {
        channels: 2,
        processorUrl: vendorUrl('worklet-processor.js'),
        wasmUrl: vendorUrl('assets/effetune-dsp.wasm'),
        simdWasmUrl: vendorUrl('assets/effetune-dsp.simd.wasm'),
        metaUrl: vendorUrl('assets/effetune-dsp.meta.json'),
      },
    );
    // Feed the same mono signal into both channels of the stereo processor.
    const merger = context.createChannelMerger(2);
    const inputBus = context.createGain();
    inputBus.channelCount = 1;
    inputBus.channelCountMode = 'explicit';
    inputBus.connect(merger, 0, 0);
    inputBus.connect(merger, 0, 1);
    merger.connect(node);
    // Keep the node pulled by the graph without making any sound.
    const sink = context.createGain();
    sink.gain.value = 0;
    node.connect(sink).connect(context.destination);

    const engine = new EffeTuneEngine(node, inputBus);
    engine.unsubscribe = node.subscribe((frame) => {
      const f = mapPitchFrame(frame);
      if (f) for (const cb of engine.frameCbs) cb(f);
      const h = mapChordHint(frame);
      if (h) for (const cb of engine.hintCbs) cb(h);
    });
    return engine;
  }

  onFrame(cb: (frame: PitchFrame) => void): void {
    this.frameCbs.push(cb);
  }

  onChordHint(cb: (hint: EngineChordHint) => void): void {
    this.hintCbs.push(cb);
  }

  dispose(): void {
    this.unsubscribe?.();
    this.node.close();
  }
}
