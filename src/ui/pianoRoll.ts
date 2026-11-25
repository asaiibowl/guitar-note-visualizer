// Scrolling debug view of the raw engine confidences (1 px per analysis frame).
import { semitoneLevel, type LevelLayout } from '../engine/noteTracker';

export class PianoRoll {
  private ctx: CanvasRenderingContext2D;
  private pending: { levels: Float32Array; active: Set<number> }[] = [];

  constructor(private canvas: HTMLCanvasElement, private minMidi: number, private maxMidi: number, private layout: LevelLayout) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    this.ctx = ctx;
    canvas.height = (maxMidi - minMidi + 1) * 3;
    this.ctx.fillStyle = '#0b0d12';
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  push(levels: Float32Array, active: Set<number>): void {
    this.pending.push({ levels, active });
    if (this.pending.length > 200) this.pending.shift();
  }

  draw(): void {
    const n = this.pending.length;
    if (n === 0) return;
    const { canvas, ctx } = this;
    const rowH = 3;
    ctx.drawImage(canvas, -n, 0);
    for (let k = 0; k < n; k++) {
      const { levels, active } = this.pending[k];
      const x = canvas.width - n + k;
      for (let midi = this.minMidi; midi <= this.maxMidi; midi++) {
        const v = semitoneLevel(levels, midi, this.layout);
        const y = (this.maxMidi - midi) * rowH;
        if (active.has(midi)) ctx.fillStyle = '#ffb347';
        else {
          const c = Math.round(Math.min(1, v) * 200);
          ctx.fillStyle = `rgb(${c * 0.3},${c * 0.6},${c})`;
        }
        ctx.fillRect(x, y, 1, rowH);
      }
    }
    this.pending.length = 0;
  }
}
