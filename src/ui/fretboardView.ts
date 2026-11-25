// SVG fretboard (standard tuning, 0-22 frets). Elements are created once; updates only toggle attributes.
import { FRET_COUNT, STANDARD_TUNING } from '../theory/fretboard';
import { type Accidental, midiToName, pcName, pitchClass, pretty } from '../theory/notes';
import type { GuideScale } from '../theory/guide';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 1500;
const TOP = 34;
const STRING_GAP = 36;
const NUT_X = 92;
const END_X = W - 18;
const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];

export type LabelMode = 'note' | 'degree';

export interface FretboardState {
  /** Sounding MIDI notes. */
  notes: readonly number[];
  /** Pitch class -> degree label (from the chord analysis). */
  degrees: ReadonlyMap<number, string>;
  /** Highlight the same pitch class in other octaves (dim). */
  showOctaves: boolean;
  /** Faintly print every note name on the neck. */
  showAllNames: boolean;
  labelMode: LabelMode;
  accidental: Accidental;
  /** Key / scale guide to show underneath the played notes (null = off). */
  guide: GuideScale | null;
}

/** Degree label -> colour family used by CSS. */
export function degreeFamily(label: string | undefined): string {
  if (!label) return 'other';
  if (label === 'R') return 'root';
  const num = Number(label.replace(/[^\d]/g, ''));
  const altered = /[♭♯𝄫𝄪]/.test(label);
  switch (num) {
    case 3:
      return 'third';
    case 5:
      return altered ? 'alt' : 'fifth';
    case 7:
      return 'seventh';
    case 2:
    case 9:
      return 'ninth';
    case 4:
    case 11:
      return 'eleventh';
    case 6:
    case 13:
      return 'thirteenth';
    default:
      return 'other';
  }
}

/** Fret line x positions: a blend of real (logarithmic) spacing and linear spacing for readability. */
function fretX(n: number): number {
  const real = (1 - 2 ** (-n / 12)) / (1 - 2 ** (-FRET_COUNT / 12));
  const linear = n / FRET_COUNT;
  return NUT_X + (END_X - NUT_X) * (0.55 * real + 0.45 * linear);
}

function cellCenterX(fret: number): number {
  if (fret === 0) return NUT_X - 34;
  return (fretX(fret - 1) + fretX(fret)) / 2;
}

function stringY(string: number): number {
  return TOP + (string - 1) * STRING_GAP;
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
}

interface GuideMarker {
  g: SVGGElement;
  text: SVGTextElement;
  midi: number;
}

interface Marker {
  g: SVGGElement;
  text: SVGTextElement;
  midi: number;
  cls: string;
  label: string;
}

export class FretboardView {
  readonly svg: SVGSVGElement;
  private markers: Marker[] = [];
  private names: SVGTextElement[] = [];
  private namesLayer: SVGGElement;
  private lastAccidental: Accidental | null = null;
  private lastShowAll: boolean | null = null;
  private guideMarkers: GuideMarker[] = [];
  private lastGuideKey = '';

  constructor(container: HTMLElement) {
    const height = TOP + STRING_GAP * 5 + 52;
    this.svg = el('svg', { viewBox: `0 0 ${W} ${height}`, class: 'fretboard', role: 'img', 'aria-label': '指板' });
    container.appendChild(this.svg);

    const board = el('g', { class: 'board' }, this.svg);
    el('rect', { x: NUT_X, y: TOP - 14, width: END_X - NUT_X, height: STRING_GAP * 5 + 28, rx: 4, class: 'wood' }, board);

    // inlays
    const midY = TOP + STRING_GAP * 2.5;
    for (const f of INLAYS) el('circle', { cx: cellCenterX(f), cy: midY, r: 7, class: 'inlay' }, board);
    el('circle', { cx: cellCenterX(12), cy: TOP + STRING_GAP * 1.5, r: 7, class: 'inlay' }, board);
    el('circle', { cx: cellCenterX(12), cy: TOP + STRING_GAP * 3.5, r: 7, class: 'inlay' }, board);

    // frets + numbers
    for (let n = 1; n <= FRET_COUNT; n++) {
      el('line', { x1: fretX(n), x2: fretX(n), y1: TOP - 14, y2: TOP + STRING_GAP * 5 + 14, class: 'fret' }, board);
    }
    el('rect', { x: NUT_X - 5, y: TOP - 14, width: 7, height: STRING_GAP * 5 + 28, class: 'nut' }, board);
    for (let n = 0; n <= FRET_COUNT; n++) {
      const t = el('text', { x: cellCenterX(n), y: TOP + STRING_GAP * 5 + 40, class: `fret-num${INLAYS.includes(n) || n === 12 ? ' strong' : ''}` }, board);
      t.textContent = String(n);
    }

    // strings
    STANDARD_TUNING.forEach((open, i) => {
      const s = i + 1;
      el('line', { x1: NUT_X - 60, x2: END_X, y1: stringY(s), y2: stringY(s), class: 'string', 'stroke-width': 1 + i * 0.45 }, board);
      const label = el('text', { x: 12, y: stringY(s) + 5, class: 'string-label' }, board);
      label.textContent = `${s}弦 ${midiToName(open).replace(/\d/, '')}`;
    });

    // faint note names for every cell
    this.namesLayer = el('g', { class: 'all-names' }, this.svg);
    // key / scale guide (below the played-note markers)
    const guideLayer = el('g', { class: 'guide' }, this.svg);
    // markers
    const layer = el('g', { class: 'markers' }, this.svg);
    STANDARD_TUNING.forEach((open, i) => {
      const s = i + 1;
      for (let f = 0; f <= FRET_COUNT; f++) {
        const x = cellCenterX(f);
        const y = stringY(s);
        const nameText = el('text', { x, y: y + 0.5, class: 'cell-name' }, this.namesLayer);
        this.names.push(nameText);
        const gg = el('g', { class: 'gm', transform: `translate(${x},${y})` }, guideLayer);
        el('circle', { r: 11 }, gg);
        const gt = el('text', { y: 0.5 }, gg);
        this.guideMarkers.push({ g: gg, text: gt, midi: open + f });
        const g = el('g', { class: 'm', transform: `translate(${x},${y})` }, layer);
        el('circle', { r: 15, class: 'out-ring' }, g);
        el('circle', { r: 15, class: 'body' }, g);
        const text = el('text', { y: 0.5 }, g);
        this.markers.push({ g, text, midi: open + f, cls: '', label: '' });
      }
    });
  }

  update(state: FretboardState): void {
    if (state.accidental !== this.lastAccidental || state.showAllNames !== this.lastShowAll) {
      this.names.forEach((t, i) => {
        t.textContent = state.showAllNames ? pretty(pcName(pitchClass(this.markers[i].midi), state.accidental)) : '';
      });
      this.lastAccidental = state.accidental;
      this.lastShowAll = state.showAllNames;
    }

    this.updateGuide(state);

    const exact = new Set(state.notes);
    const pcs = new Set(state.notes.map(pitchClass));
    for (const m of this.markers) {
      let cls = 'm';
      let label = '';
      const pc = pitchClass(m.midi);
      const isExact = exact.has(m.midi);
      const isPc = !isExact && state.showOctaves && pcs.has(pc);
      if (isExact || isPc) {
        const degree = state.degrees.get(pc);
        cls += ` on ${isExact ? 'exact' : 'pc'} f-${degreeFamily(degree)}`;
        if (state.guide && !state.guide.degrees.has(pc)) cls += ' out';
        if (state.labelMode === 'degree' && degree) label = degree;
        else label = pretty(isExact ? midiToName(m.midi, state.accidental) : pcName(pc, state.accidental));
      }
      if (cls !== m.cls) {
        m.g.setAttribute('class', cls);
        m.cls = cls;
      }
      if (label !== m.label) {
        m.text.textContent = label;
        m.label = label;
      }
    }
  }

  private updateGuide(state: FretboardState): void {
    const g = state.guide;
    const key = g ? `${g.tonicPc}:${g.scaleId}:${state.labelMode}:${state.accidental}` : '';
    if (key === this.lastGuideKey) return;
    this.lastGuideKey = key;
    for (const m of this.guideMarkers) {
      const pc = pitchClass(m.midi);
      const degree = g?.degrees.get(pc);
      if (!g || degree == null) {
        m.g.setAttribute('class', 'gm');
        m.text.textContent = '';
        continue;
      }
      m.g.setAttribute('class', `gm on${pc === g.tonicPc ? ' tonic' : ''}`);
      m.text.textContent = state.labelMode === 'degree' ? degree : pretty(pcName(pc, state.accidental));
    }
  }
}
