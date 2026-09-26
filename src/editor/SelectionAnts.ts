/**
 * Draws the region selection's "marching ants" outline.
 *
 * The ants live on their own small canvas layered above Fabric's canvases
 * (pointer events pass through). Animating them only redraws this layer —
 * the artwork underneath is not re-rendered on every tick, so the animation
 * costs next to nothing even in heavy documents.
 */
import type { PixelSelection } from './pixelSelection';

/** Dash length and animation step (screen pixels / milliseconds). */
const DASH = 4;
const TICK_MS = 120;

export class SelectionAnts {
  private readonly el: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private timer = 0;
  private phase = 0;
  private cssWidth = 0;

  constructor(
    host: HTMLElement,
    private readonly selection: PixelSelection,
    private readonly getTransform: () => number[],
  ) {
    this.el = document.createElement('canvas');
    this.el.className = 'sw-selection-ants';
    this.el.dataset.testid = 'selection-ants';
    host.appendChild(this.el);
    this.ctx = this.el.getContext('2d');
  }

  /** Matches the layer to the canvas size (CSS pixels). */
  resize(width: number, height: number) {
    const dpr = window.devicePixelRatio || 1;
    this.cssWidth = width;
    this.el.width = Math.round(width * dpr);
    this.el.height = Math.round(height * dpr);
    this.el.style.width = `${width}px`;
    this.el.style.height = `${height}px`;
    this.draw();
  }

  /** Redraws after the selection or the viewport changed; starts/stops the animation. */
  update() {
    const active = !this.selection.isEmpty;
    if (active && !this.timer) {
      this.timer = window.setInterval(() => {
        this.phase = (this.phase + 1) % (DASH * 2);
        this.draw();
      }, TICK_MS);
    } else if (!active && this.timer) {
      window.clearInterval(this.timer);
      this.timer = 0;
    }
    this.draw();
  }

  dispose() {
    window.clearInterval(this.timer);
    this.timer = 0;
    this.el.remove();
  }

  private draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    const dpr = this.el.width / Math.max(1, this.cssWidth);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.el.width, this.el.height);
    if (this.selection.isEmpty) return;
    const loops = this.selection.outline();
    const v = this.getTransform();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath();
    for (const loop of loops) {
      for (let k = 0; k < loop.length; k += 2) {
        // Pixel-aligned so the 1px line stays crisp.
        const x = Math.round(loop[k] * v[0] + v[4]) + 0.5;
        const y = Math.round(loop[k + 1] * v[3] + v[5]) + 0.5;
        if (k) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
    }
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.setLineDash([DASH, DASH]);
    ctx.lineDashOffset = -this.phase;
    ctx.strokeStyle = '#000000';
    ctx.stroke();
  }
}
