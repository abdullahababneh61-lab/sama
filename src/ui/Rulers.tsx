/**
 * Horizontal and vertical rulers in artboard pixels. Drag from a ruler onto
 * the canvas to create a guide (top ruler → horizontal guide, left ruler →
 * vertical guide); drag a guide back onto a ruler to delete it.
 */
import { useEffect, useRef } from 'react';
import { useEditor, useWorkspace } from '../workspace/context';

export const RULER_SIZE = 20;

const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];

function pickStep(zoom: number) {
  // Aim for labelled ticks at least ~60 screen pixels apart.
  return STEPS.find((s) => s * zoom >= 60) ?? STEPS[STEPS.length - 1];
}

export function Rulers() {
  const editor = useEditor();
  const version = useWorkspace((s) => s.viewportVersion);
  const doc = useWorkspace((s) => s.doc);
  const pointer = useWorkspace((s) => s.pointer);
  const selection = useWorkspace((s) => s.selection);
  const topRef = useRef<HTMLCanvasElement>(null);
  const leftRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!editor) return;
    const vpt = editor.canvas.viewportTransform;
    const zoom = vpt[0];
    const dpr = window.devicePixelRatio || 1;
    const styles = getComputedStyle(topRef.current!);
    const colors = {
      bg: styles.getPropertyValue('--sw-ruler-bg').trim() || '#232328',
      art: styles.getPropertyValue('--sw-ruler-art').trim() || '#2c2c33',
      tick: styles.getPropertyValue('--sw-ruler-tick').trim() || '#5c5c68',
      text: styles.getPropertyValue('--sw-ruler-text').trim() || '#9a9aa6',
      sel: 'rgba(77, 141, 255, 0.28)',
      pointer: '#4d8dff',
    };

    const draw = (canvas: HTMLCanvasElement, horizontal: boolean) => {
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const length = horizontal ? cssW : cssH;
      // Rulers are aligned with the canvas (they sit in the grid row/column next to it).
      const offset = horizontal ? vpt[4] : vpt[5];
      const toScreen = (v: number) => v * zoom + offset;

      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, cssW, cssH);
      // Artboard extent
      const a0 = toScreen(0);
      const a1 = toScreen(horizontal ? doc.width : doc.height);
      ctx.fillStyle = colors.art;
      if (horizontal) ctx.fillRect(a0, 0, a1 - a0, cssH);
      else ctx.fillRect(0, a0, cssW, a1 - a0);
      // Selection extent
      if (selection) {
        const s0 = toScreen(horizontal ? selection.x : selection.y);
        const bounds = editor.canvas.getActiveObject()?.getBoundingRect();
        const size = bounds ? (horizontal ? bounds.width : bounds.height) : 0;
        ctx.fillStyle = colors.sel;
        if (horizontal) ctx.fillRect(s0, 0, size * zoom, cssH);
        else ctx.fillRect(0, s0, cssW, size * zoom);
      }

      const step = pickStep(zoom);
      const minor = step / (step % 5 === 0 ? 5 : step % 2 === 0 ? 2 : 1);
      const start = Math.floor((0 - offset) / zoom / minor) * minor;
      const end = (length - offset) / zoom;
      ctx.strokeStyle = colors.tick;
      ctx.fillStyle = colors.text;
      ctx.font = '9px system-ui, sans-serif';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let v = start; v <= end; v += minor) {
        const p = Math.round(toScreen(v)) + 0.5;
        const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
        const len = major ? RULER_SIZE : RULER_SIZE * 0.3;
        if (horizontal) {
          ctx.moveTo(p, RULER_SIZE);
          ctx.lineTo(p, RULER_SIZE - len);
        } else {
          ctx.moveTo(RULER_SIZE, p);
          ctx.lineTo(RULER_SIZE - len, p);
        }
        if (major) {
          const label = String(Math.round(v));
          if (horizontal) ctx.fillText(label, p + 3, 9);
          else {
            ctx.save();
            ctx.translate(9, p + 3);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'right';
            ctx.fillText(label, 0, 0);
            ctx.restore();
          }
        }
      }
      ctx.stroke();
      // Border
      ctx.fillStyle = colors.tick;
      if (horizontal) ctx.fillRect(0, cssH - 1, cssW, 1);
      else ctx.fillRect(cssW - 1, 0, 1, cssH);
      // Pointer marker
      if (pointer) {
        const p = Math.round(toScreen(horizontal ? pointer.x : pointer.y)) + 0.5;
        ctx.strokeStyle = colors.pointer;
        ctx.beginPath();
        if (horizontal) {
          ctx.moveTo(p, 0);
          ctx.lineTo(p, cssH);
        } else {
          ctx.moveTo(0, p);
          ctx.lineTo(cssW, p);
        }
        ctx.stroke();
      }
    };
    if (topRef.current) draw(topRef.current, true);
    if (leftRef.current) draw(leftRef.current, false);
  }, [editor, version, doc, pointer, selection]);

  /** Drag from a ruler to create a guide. */
  const startGuide = (e: React.PointerEvent, orientation: 'vertical' | 'horizontal') => {
    if (!editor || e.button !== 0) return;
    e.preventDefault();
    const index = editor.addGuide(orientation, -100000);
    const move = (ev: PointerEvent) => {
      const p = editor.clientToScene(ev.clientX, ev.clientY);
      editor.moveGuide(orientation, index, orientation === 'vertical' ? p.x : p.y);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const r = editor.canvas.upperCanvasEl.getBoundingClientRect();
      const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (!inside) editor.removeGuide(orientation, index);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <>
      <div className="sw-ruler-corner" />
      <canvas
        ref={topRef}
        className="sw-ruler sw-ruler--top"
        onPointerDown={(e) => startGuide(e, 'horizontal')}
        data-testid="ruler-top"
      />
      <canvas
        ref={leftRef}
        className="sw-ruler sw-ruler--left"
        onPointerDown={(e) => startGuide(e, 'vertical')}
        data-testid="ruler-left"
      />
    </>
  );
}
