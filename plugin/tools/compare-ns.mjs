// Compare NoteSpectrogram output of the native build (ns_probe.exe) with the WebAssembly build.
//   node plugin/tools/compare-ns.mjs <path-to-ns_probe.exe> [midi...]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createChain } from '@effetune/dsp';
import { decodeTelemetryPacket } from '../../node_modules/@effetune/dsp/dist/telemetry.js';

const [probe, ...rest] = process.argv.slice(2);
const notes = rest.length ? rest.map(Number) : [45, 52, 55, 60, 64]; // Am7
const sr = 48000;

function pluck(midi, seconds, seed) {
  const f = 440 * 2 ** ((midi - 69) / 12);
  const n = Math.round(sr / f);
  const buf = new Float32Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 16807) % 2147483647;
    buf[i] = (s / 2147483647) * 2 - 1;
  }
  const out = new Float32Array(Math.round(sr * seconds));
  let idx = 0;
  for (let i = 0; i < out.length; i++) {
    const a = buf[idx];
    const b = buf[(idx + 1) % n];
    buf[idx] = 0.996 * 0.5 * (a + b);
    out[i] = a;
    idx = (idx + 1) % n;
  }
  return out;
}

const mono = new Float32Array(Math.round(sr * 1.5));
notes.forEach((m, k) => {
  const t = pluck(m, 1.2, k + 3);
  const start = Math.round(sr * 0.3) + k * 576; // 12 ms strum
  for (let i = 0; i < t.length && start + i < mono.length; i++) mono[start + i] += 0.25 * t[i];
});

// WebAssembly
const wasm = [];
const chain = await createChain({
  version: 1,
  chain: [{ id: 'ns', type: 'NoteSpectrogram', parameters: { minimumMidi: 40, maximumMidi: 88, chordKeyEnabled: true } }],
});
await chain.process([mono, mono.slice()], { sampleRate: sr, onTelemetry: (f) => wasm.push(f) });
chain.close();

// Native
const dir = mkdtempSync(join(tmpdir(), 'ns-'));
writeFileSync(join(dir, 'in.f32'), Buffer.from(mono.buffer));
execFileSync(probe, [join(dir, 'in.f32'), String(sr), join(dir, 'out.bin'), '128'], { stdio: 'inherit' });
const raw = readFileSync(join(dir, 'out.bin'));
const nodesByTap = new Map([[1, { effectId: 'ns', effectType: 'NoteSpectrogram', tapId: 1 }]]);
const native = [];
for (let off = 0; off < raw.length; ) {
  const bytes = raw.readUInt32LE(off);
  const packet = new Uint8Array(raw.buffer, raw.byteOffset + off + 4, bytes);
  native.push(...decodeTelemetryPacket(packet, bytes, nodesByTap).frames);
  off += 4 + bytes;
}

const pick = (arr, kind) => new Map(arr.filter((f) => f.kind === kind).map((f) => [`${f.frameIndex}:${f.generation ?? ''}:${f.revisionAge ?? ''}:${f.sequence ?? ''}`, f]));
const kinds = (arr) => arr.reduce((m, f) => ((m[f.kind] = (m[f.kind] ?? 0) + 1), m), {});
console.log('wasm kinds', kinds(wasm), 'native kinds', kinds(native));
const w = pick(wasm, 'noteSpectrogram');
const n = pick(native, 'noteSpectrogram');
let common = 0;
let maxDiff = 0;
let worstFrame = -1;
for (const [idx, wf] of w) {
  const nf = n.get(idx);
  if (!nf) continue;
  common++;
  for (let i = 0; i < wf.levels.length; i++) {
    const d = Math.abs(wf.levels[i] - nf.levels[i]);
    if (d > maxDiff) {
      maxDiff = d;
      worstFrame = idx;
    }
  }
}
const chords = (arr) => arr.filter((f) => f.kind === 'noteChordKey').map((f) => `${f.immediateRoot}:${f.immediateQuality}`);
const wc = chords(wasm);
const nc = chords(native);
const chordMismatch = wc.filter((c, i) => c !== nc[i]).length;
console.log(JSON.stringify({ wasmFrames: w.size, nativeFrames: n.size, common, maxLevelDiff: maxDiff, worstFrame, chordFrames: [wc.length, nc.length], chordMismatch }, null, 1));
