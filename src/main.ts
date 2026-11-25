// Wires audio input -> pitch engine -> note tracker -> chord naming -> fretboard / HUD.
import { EffeTuneEngine } from './audio/effetuneEngine';
import { isPluginHost, NativeEngine } from './audio/nativeBridge';
import { InputDevice, type ChannelChoice, type InputInfo } from './audio/inputDevice';
import type { EngineChordHint, PitchEngine, PitchFrame } from './audio/pitchEngine';
import { playTestNotes, TEST_PRESETS } from './dev/testSignal';
import { NoteTracker, type ActiveNote } from './engine/noteTracker';
import { analyzeNotes, ChordStabilizer, NO_CHORD, type ChordAnalysis } from './theory/chordNamer';
import { instrumentRange, midiAt, FRET_COUNT } from './theory/fretboard';
import { buildScale, SCALES, type GuideScale } from './theory/guide';
import { pcName, pretty } from './theory/notes';
import { FretboardView } from './ui/fretboardView';
import { Hud } from './ui/hud';
import { bindOptionsDialog } from './ui/options';
import { PianoRoll } from './ui/pianoRoll';
import { loadSettings, saveSettings } from './ui/settings';
import { TunerView } from './ui/tunerView';

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
}

const [GUITAR_MIN, GUITAR_MAX] = instrumentRange(); // 40..86
const settings = loadSettings();

const fretboard = new FretboardView($('fretboard-wrap'));
const hud = new Hud();
const roll = new PianoRoll($<HTMLCanvasElement>('piano-roll'), GUITAR_MIN, GUITAR_MAX, { firstMidi: 21, divisionsPerSemitone: 5 });
const tracker = new NoteTracker({ minMidi: GUITAR_MIN, maxMidi: GUITAR_MAX });
const stabilizer = new ChordStabilizer(2, 3);
const fretboardWrap = $('fretboard-wrap');
const tuner = new TunerView();

// Shown on the fretboard while the Options dialog is open and nothing is sounding.
const PREVIEW_NOTES = [52, 55, 60, 64]; // C/E
const PREVIEW_ANALYSIS = analyzeNotes(PREVIEW_NOTES);
const PREVIEW_GUIDE = buildScale(0, 'major');

let native: NativeEngine | null = null;
let frameCount = 0;
let pluginRate = 48000;
let guide: GuideScale | null = null;
let tunerOn = false;
let tunerAnalyser: AnalyserNode | null = null;
let lastTunerRun = 0;

let context: AudioContext | null = null;
let engine: PitchEngine | null = null;
let input: InputDevice | null = null;
let inputInfo: InputInfo | null = null;

let notes: ActiveNote[] = [];
let analysis: ChordAnalysis = NO_CHORD;
let shown: ChordAnalysis = NO_CHORD;
let hint: EngineChordHint | null = null;
let dirty = true;
let gateOpen = false;
let levelDb = -120;

// Latency measurement: test-signal start -> note detected (main thread) -> note painted.
interface Measure { perfStart: number; targets: Set<number>; afterFrame: number; detectedAt: number | null }
let pendingMeasure: Measure | null = null;
const detectLatencies: number[] = [];
const paintLatencies: number[] = [];
let lastFrameIndex = 0;

function applyThreshold(): void {
  tracker.config.onThreshold = settings.onThreshold;
  tracker.config.offThreshold = settings.onThreshold * 0.6;
}
applyThreshold();

// Minimal counters for checking the engine from DevTools (also inside the plugin's WebView).
(window as unknown as { __gnvStats: unknown }).__gnvStats = {
  get frames() { return frameCount; },
  get notes() { return notes.map((n) => n.midi); },
  get chord() { return shown.name; },
  get levelDb() { return levelDb; },
};

if (import.meta.env.DEV) {
  (window as unknown as { __gnv: unknown }).__gnv = { detectLatencies, paintLatencies, get context() { return context; }, get notes() { return notes; }, get shown() { return shown; }, get analysis() { return analysis; } };
}

function pushLimited(arr: number[], v: number): void {
  arr.push(v);
  if (arr.length > 20) arr.shift();
}

function isMeasuredOnset(m: Measure): boolean {
  return notes.some((n) => m.targets.has(n.midi) && n.onFrame > m.afterFrame);
}

function onFrame(frame: PitchFrame): void {
  if (input) levelDb = input.levelDb(); // in the plugin, levelDb arrives with the host's audio events
  if (input || native) {
    // Gate with 6 dB hysteresis.
    if (gateOpen ? levelDb < settings.gateDb - 6 : levelDb > settings.gateDb) gateOpen = !gateOpen;
  }
  lastFrameIndex = frame.frameIndex;
  frameCount++;
  if (tunerOn && !native) runTuner();
  notes = tracker.update(frame.levels, frame.pitchCents, frame.frameIndex, gateOpen);
  analysis = analyzeNotes(
    notes.map((n) => n.midi),
    settings.accidental,
  );
  shown = stabilizer.update(analysis);
  roll.push(frame.levels, new Set(notes.map((n) => n.midi)));
  if (pendingMeasure && pendingMeasure.detectedAt == null && isMeasuredOnset(pendingMeasure)) {
    pendingMeasure.detectedAt = performance.now();
    pushLimited(detectLatencies, pendingMeasure.detectedAt - pendingMeasure.perfStart);
  }
  dirty = true;
}

function render(): void {
  // meter
  const pct = Math.max(0, Math.min(100, ((levelDb + 90) / 90) * 100));
  $('meter-fill').style.width = `${pct}%`;
  $('meter-gate').style.left = `${((settings.gateDb + 90) / 90) * 100}%`;

  if (dirty) {
    dirty = false;
    const preview = optionsDialog.open && notes.length === 0;
    fretboard.update({
      notes: preview ? PREVIEW_NOTES : notes.map((n) => n.midi),
      degrees: preview ? PREVIEW_ANALYSIS.degrees : analysis.degrees,
      showOctaves: settings.showOctaves,
      showAllNames: settings.showAllNames,
      labelMode: settings.labelMode,
      accidental: settings.accidental,
      guide: preview && !guide ? PREVIEW_GUIDE : guide,
    });
    hud.render(shown, notes, settings.accidental, guide);
    hud.renderHint(hint, settings.accidental);
    if (pendingMeasure?.detectedAt != null) {
      pushLimited(paintLatencies, performance.now() - pendingMeasure.perfStart);
      pendingMeasure = null;
      renderLatency();
    }
  }
  roll.draw();
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

function renderLatency(): void {
  const lines: string[] = [];
  const stat = (arr: number[]): string => {
    const last = arr[arr.length - 1];
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    return `直近 ${last.toFixed(0)} ms / 平均 ${avg.toFixed(0)} ms（${arr.length}回）`;
  };
  if (detectLatencies.length) {
    lines.push(`発音→検出: ${stat(detectLatencies)}`);
    if (paintLatencies.length) lines.push(`発音→描画: ${stat(paintLatencies)}`);
  } else {
    lines.push('内部処理: テスト信号ボタンで計測');
  }
  if (context) {
    lines.push(`AudioContext: ${context.sampleRate} Hz, baseLatency ${(context.baseLatency * 1000).toFixed(1)} ms`);
  }
  if (inputInfo) {
    lines.push(
      `入力デバイス報告遅延: ${inputInfo.reportedLatency != null ? (inputInfo.reportedLatency * 1000).toFixed(1) + ' ms' : '不明'}`,
    );
  }
  lines.push('※ 実際の弦→画面は＋入力遅延＋モニター表示遅延');
  $('latency').textContent = lines.join('\n');
}

function setStatus(text: string): void {
  $('status').textContent = text;
}

async function populateDevices(): Promise<void> {
  const select = $<HTMLSelectElement>('device-select');
  const devices = await InputDevice.listInputs();
  select.replaceChildren(
    ...devices.map((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || `入力デバイス ${i + 1}`;
      return o;
    }),
  );
  const current = settings.deviceId && devices.some((d) => d.deviceId === settings.deviceId) ? settings.deviceId : 'default';
  select.value = devices.some((d) => d.deviceId === current) ? current : (devices[0]?.deviceId ?? '');
}

async function openInput(): Promise<void> {
  if (!input || !context) return;
  try {
    inputInfo = await input.open(settings.deviceId, settings.channel);
  } catch (err) {
    if (settings.deviceId) {
      // Stale device id: fall back to the default device.
      settings.deviceId = null;
      inputInfo = await input.open(null, settings.channel);
    } else throw err;
  }
  input.setGainDb(settings.inputGainDb);
  tracker.reset();
  stabilizer.reset();
  setStatus(`${inputInfo.label} / ${inputInfo.channelCount}ch / ${context.sampleRate} Hz`);
  renderLatency();
}

async function start(): Promise<void> {
  const btn = $<HTMLButtonElement>('start-btn');
  if (context) return;
  btn.disabled = true;
  setStatus('エンジン起動中…');
  try {
    context = new AudioContext({ latencyHint: 'interactive' });
    await context.resume();
    input = new InputDevice(context);
    engine = await EffeTuneEngine.create(context, { minMidi: GUITAR_MIN, maxMidi: Math.min(108, GUITAR_MAX + 2) });
    input.bus.connect(engine.input);
    engine.onFrame(onFrame);
    engine.onChordHint((h) => {
      hint = h;
    });
    btn.textContent = '● 動作中';
    btn.classList.add('running');
    try {
      await openInput();
      await populateDevices();
    } catch (err) {
      console.error(err);
      setStatus(`入力を開けません（${(err as Error).name}）。テスト信号は使えます。`);
    }
  } catch (err) {
    console.error(err);
    setStatus(`起動失敗: ${(err as Error).message}`);
    btn.disabled = false;
    context?.close();
    context = null;
  }
}

/* ---------- controls ---------- */

function bindRange(id: string, key: 'inputGainDb' | 'gateDb' | 'onThreshold', fmt: (v: number) => string, onChange?: () => void): void {
  const el = $<HTMLInputElement>(id);
  const out = $<HTMLOutputElement>(`${id}-out`);
  el.value = String(settings[key]);
  out.textContent = fmt(settings[key]);
  el.addEventListener('input', () => {
    settings[key] = Number(el.value);
    out.textContent = fmt(settings[key]);
    saveSettings(settings);
    onChange?.();
  });
}

function bindCheck(id: string, get: () => boolean, set: (v: boolean) => void): void {
  const el = $<HTMLInputElement>(id);
  el.checked = get();
  el.addEventListener('change', () => {
    set(el.checked);
    saveSettings(settings);
    dirty = true;
  });
}

bindRange('gain', 'inputGainDb', (v) => `${v > 0 ? '+' : ''}${v} dB`, () => input?.setGainDb(settings.inputGainDb));
bindRange('gate', 'gateDb', (v) => `${v} dB`);
bindRange('threshold', 'onThreshold', (v) => v.toFixed(2), applyThreshold);
bindCheck('flat', () => settings.accidental === 'flat', (v) => (settings.accidental = v ? 'flat' : 'sharp'));
bindCheck('degree-mode', () => settings.labelMode === 'degree', (v) => (settings.labelMode = v ? 'degree' : 'note'));
bindCheck('octaves', () => settings.showOctaves, (v) => (settings.showOctaves = v));
bindCheck('all-names', () => settings.showAllNames, (v) => (settings.showAllNames = v));
bindCheck('monitor-test', () => settings.monitorTest, (v) => (settings.monitorTest = v));

/* ---------- key / scale guide ---------- */

const guideOn = $<HTMLInputElement>('guide-on');
const guideTonic = $<HTMLSelectElement>('guide-tonic');
const guideScale = $<HTMLSelectElement>('guide-scale');
guideScale.replaceChildren(
  ...SCALES.map((sc) => {
    const o = document.createElement('option');
    o.value = sc.id;
    o.textContent = sc.label;
    return o;
  }),
);
guideScale.value = settings.guideScale;

function fillTonicNames(): void {
  guideTonic.replaceChildren(
    ...Array.from({ length: 12 }, (_, pc) => {
      const o = document.createElement('option');
      o.value = String(pc);
      o.textContent = pretty(pcName(pc, settings.accidental));
      return o;
    }),
  );
  guideTonic.value = String(settings.guideTonic);
}

function applyGuide(): void {
  guide = settings.guideOn ? buildScale(settings.guideTonic, settings.guideScale) : null;
  fretboardWrap.classList.toggle('has-guide', guide != null);
  dirty = true;
}

function onGuidePick(): void {
  settings.guideTonic = Number(guideTonic.value);
  settings.guideScale = guideScale.value;
  settings.guideOn = true; // picking a key turns the guide on
  guideOn.checked = true;
  saveSettings(settings);
  applyGuide();
}

fillTonicNames();
bindCheck('guide-on', () => settings.guideOn, (v) => {
  settings.guideOn = v;
  applyGuide();
});
guideTonic.addEventListener('change', onGuidePick);
guideScale.addEventListener('change', onGuidePick);
$('flat').addEventListener('change', fillTonicNames);
applyGuide();

/* ---------- Options ---------- */

const optionsDialog = bindOptionsDialog(settings, fretboardWrap, () => {
  dirty = true;
});

/* ---------- tuner ---------- */

function runTuner(): void {
  const now = performance.now();
  if (now - lastTunerRun < 15 || !context || !input) return;
  lastTunerRun = now;
  if (!tunerAnalyser) {
    tunerAnalyser = context.createAnalyser();
    tunerAnalyser.fftSize = tuner.bufferSize;
    tunerAnalyser.smoothingTimeConstant = 0;
    input.bus.connect(tunerAnalyser);
  }
  tuner.update(tunerAnalyser, context.sampleRate, settings.tunerA4, settings.accidental);
}

const tunerA4 = $<HTMLInputElement>('tuner-a4');
tunerA4.value = String(settings.tunerA4);
tunerA4.addEventListener('change', () => {
  const v = Number(tunerA4.value);
  if (v >= 415 && v <= 466) {
    settings.tunerA4 = v;
    saveSettings(settings);
  } else tunerA4.value = String(settings.tunerA4);
});

$('tuner-btn').addEventListener('click', () => {
  tunerOn = !tunerOn;
  $('tuner-btn').setAttribute('aria-pressed', String(tunerOn));
  $('tuner').hidden = !tunerOn;
  $('readout').hidden = tunerOn;
  tuner.reset();
  native?.setTuner(tunerOn);
  if (tunerOn && !context && !native) void start();
});

const channelSelect = $<HTMLSelectElement>('channel-select');
channelSelect.value = String(settings.channel);
channelSelect.addEventListener('change', () => {
  const v = channelSelect.value;
  settings.channel = (v === 'mix' ? 'mix' : Number(v)) as ChannelChoice;
  saveSettings(settings);
  if (native) {
    native.setChannel(v === 'mix' ? 2 : Number(v));
    tracker.reset();
    stabilizer.reset();
    return;
  }
  openInput().catch((e) => setStatus(`入力切替失敗: ${(e as Error).message}`));
});

const deviceSelect = $<HTMLSelectElement>('device-select');
deviceSelect.addEventListener('change', () => {
  settings.deviceId = deviceSelect.value || null;
  saveSettings(settings);
  openInput().catch((e) => setStatus(`入力切替失敗: ${(e as Error).message}`));
});

$('start-btn').addEventListener('click', () => void start());

/* ---------- plugin host (VST3 / Standalone) ---------- */

async function startPlugin(): Promise<void> {
  document.body.classList.add('plugin');
  native = new NativeEngine();
  native.onFrame(onFrame);
  native.onChordHint((h) => {
    hint = h;
  });
  native.onAudio((a) => {
    levelDb = a.levelDb;
    pluginRate = a.sampleRate;
    if (tunerOn && a.samples) tuner.updateSamples(a.samples, a.sampleRate, settings.tunerA4, settings.accidental);
    setStatus(a.engineReady ? `プラグイン / ${Math.round(a.sampleRate)} Hz` : 'プラグイン / エンジン停止中（再生を開始してください）');
  });
  const init = await native.ready();
  pluginRate = init.sampleRate;
  // The host remembers the analysed channel per project.
  settings.channel = (init.inputChannel === 2 ? 'mix' : init.inputChannel) as ChannelChoice;
  channelSelect.value = String(settings.channel);
  setStatus(`プラグイン / ${Math.round(pluginRate)} Hz`);
}

if (isPluginHost()) {
  startPlugin().catch((e) => setStatus(`プラグイン接続失敗: ${(e as Error).message}`));
}

/* ---------- test signal ---------- */

function randomVoicing(): number[] {
  // One note per string on 3-5 adjacent strings within a 4-fret span, like a random grip.
  const count = 3 + Math.floor(Math.random() * 3);
  const firstString = 1 + Math.floor(Math.random() * (7 - count));
  const base = Math.floor(Math.random() * (FRET_COUNT - 4));
  const out: number[] = [];
  for (let s = firstString; s < firstString + count; s++) out.push(midiAt(s, base + Math.floor(Math.random() * 4)));
  return out;
}

async function playTest(midis: number[]): Promise<void> {
  if (native) {
    // The plugin synthesises the notes natively and mixes them into the analysis input only.
    native.playTest(midis);
    pendingMeasure = { perfStart: performance.now(), targets: new Set(midis), afterFrame: lastFrameIndex, detectedAt: null };
    return;
  }
  if (!context) await start();
  if (!context || !input) return;
  const dest: AudioNode = input.bus;
  let monitor: GainNode | null = null;
  if (settings.monitorTest) {
    monitor = context.createGain();
    monitor.gain.value = 0.6;
    monitor.connect(context.destination);
  }
  const target = monitor ? (() => {
    const split = context.createGain();
    split.connect(dest);
    split.connect(monitor);
    return split;
  })() : dest;
  const sig = playTestNotes(context, target, midis);
  // Map the scheduled AudioContext time to performance.now().
  const perfStart = performance.now() + (sig.startTime - context.currentTime) * 1000;
  pendingMeasure = { perfStart, targets: new Set(midis), afterFrame: lastFrameIndex, detectedAt: null };
  // Gate must not swallow the synthetic signal.
  gateOpen = true;
}

const testButtons = $('test-buttons');
for (const preset of TEST_PRESETS) {
  const b = document.createElement('button');
  b.textContent = preset.label;
  b.addEventListener('click', () => void playTest(preset.notes));
  testButtons.appendChild(b);
}
const rnd = document.createElement('button');
rnd.textContent = '🎲 ランダム押さえ';
rnd.addEventListener('click', () => void playTest(randomVoicing()));
testButtons.appendChild(rnd);

renderLatency();
