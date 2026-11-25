// Chord / note read-out above the fretboard.
import type { ActiveNote } from '../engine/noteTracker';
import type { ChordAnalysis } from '../theory/chordNamer';
import { type Accidental, intervalSemitones, midiToName, pcName, pitchClass, pretty } from '../theory/notes';
import { degreeFamily } from './fretboardView';
import type { EngineChordHint } from '../audio/pitchEngine';
import { type GuideScale, romanNumeral, scaleTitle } from '../theory/guide';

function $(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e;
}

const DEGREE_ORDER = (label: string): number => {
  if (label === 'R') return 0;
  const num = Number(label.replace(/[^\d]/g, '')) || 0;
  const iv = `${num}${label.startsWith('♭') ? 'm' : label.startsWith('♯') ? 'A' : num === 4 || num === 5 || num === 11 ? 'P' : 'M'}`;
  return num * 12 + intervalSemitones(iv);
};

export class Hud {
  private chordEl = $('chord-name');
  private funcEl = $('chord-func');
  private descEl = $('chord-desc');
  private altEl = $('chord-alt');
  private notesEl = $('note-list');
  private degreesEl = $('degree-list');
  private hintEl = $('engine-hint');
  private lastKey = '';
  private lastNotesKey = '';

  render(shown: ChordAnalysis, notes: readonly ActiveNote[], accidental: Accidental, guide: GuideScale | null = null): void {
    const guideKey = guide ? `${guide.tonicPc}:${guide.scaleId}` : '';
    const key = `${shown.key}|${accidental}|${guideKey}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.funcEl.textContent = guide ? this.functionText(shown, guide, accidental) : '';
      this.funcEl.title = this.funcEl.textContent; // full text when cut off
      this.chordEl.textContent = shown.kind === 'none' ? '—' : shown.name;
      this.chordEl.dataset.kind = shown.kind;
      this.fitChordName();
      this.descEl.textContent = shown.description;
      this.altEl.textContent = shown.alternatives.length ? `別解釈: ${shown.alternatives.join(' / ')}` : '';
      const degrees = [...shown.degrees.entries()].sort((a, b) => DEGREE_ORDER(a[1]) - DEGREE_ORDER(b[1]));
      this.degreesEl.replaceChildren(
        ...degrees.map(([pc, label]) => {
          const chip = document.createElement('span');
          chip.className = `chip f-${degreeFamily(label)}`;
          chip.innerHTML = `<b>${label}</b><small>${pretty(pcName(pc, accidental))}</small>`;
          return chip;
        }),
      );
    }

    const notesKey = notes.map((n) => `${n.midi}:${Math.round(n.cents / 5)}`).join(',') + accidental + guideKey;
    if (notesKey !== this.lastNotesKey) {
      this.lastNotesKey = notesKey;
      this.notesEl.replaceChildren(
        ...notes.map((n) => {
          const chip = document.createElement('span');
          chip.className = guide && !guide.degrees.has(pitchClass(n.midi)) ? 'note-chip out' : 'note-chip';
          const cents = Math.round(n.cents);
          const sign = cents > 0 ? '+' : '';
          const degree = shown.degrees.get(pitchClass(n.midi));
          chip.innerHTML = `<b>${pretty(midiToName(n.midi, accidental))}</b><small>${sign}${cents}¢${degree ? ' · ' + degree : ''}</small>`;
          return chip;
        }),
      );
    }
  }

  /** Shrink the chord name to fit its box instead of letting the box grow. */
  fitChordName(): void {
    const el = this.chordEl;
    el.style.setProperty('--fit', '1');
    const avail = el.clientWidth;
    const need = el.scrollWidth;
    if (avail > 0 && need > avail) el.style.setProperty('--fit', String(Math.max(0.3, (avail / need) * 0.97)));
  }

  private functionText(shown: ChordAnalysis, guide: GuideScale, accidental: Accidental): string {
    const title = scaleTitle(guide, accidental);
    if (shown.kind === 'none') return title;
    if (shown.kind === 'single') {
      const deg = guide.degrees.get(shown.rootPc ?? -1);
      return deg ? `${title} の ${deg}` : `${title} のスケール外`;
    }
    if (shown.kind === 'unknown') return title;
    const roman = romanNumeral(shown.rootPc, shown.symbol, guide.tonicPc);
    const outside = [...shown.degrees.keys()].filter((pc) => !guide.degrees.has(pc));
    const tail = outside.length ? `（スケール外: ${outside.map((pc) => pretty(pcName(pc, accidental))).join(' ')}）` : '';
    return `${roman ?? ''} in ${title}${tail}`;
  }

  renderHint(hint: EngineChordHint | null, accidental: Accidental): void {
    if (!hint || hint.root == null) {
      this.hintEl.textContent = 'EffeTune推定: —';
      return;
    }
    const root = pretty(pcName(hint.root, accidental));
    const bass = hint.bass != null && hint.bass !== hint.root ? `/${pretty(pcName(hint.bass, accidental))}` : '';
    this.hintEl.textContent = `EffeTune推定: ${root}${hint.quality ?? ''}${bass}`;
  }
}
