/**
 * The canvas viewport: hosts the Fabric canvas, the rulers, drag-and-drop
 * image import and guide dragging.
 */
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, useWorkspace } from '../workspace/context';
import { useT } from '../i18n';
import { Rulers, RULER_SIZE } from './Rulers';
import { Toast } from './controls/Toast';
import { ColorSamplerPanel } from './ColorSamplerPanel';

export const CanvasArea = forwardRef<HTMLDivElement>(function CanvasArea(_props, hostRef) {
  const editor = useEditor();
  const t = useT();
  const showRulers = useWorkspace((s) => s.showRulers);
  const tool = useWorkspace((s) => s.activeTool);
  const [dropActive, setDropActive] = useState(false);
  const [guideCursor, setGuideCursor] = useState<'col-resize' | 'row-resize' | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);

  // --- Drag & drop image import ---------------------------------------------
  const hasFiles = (e: React.DragEvent) => [...e.dataTransfer.types].includes('Files');
  const onDragEnter = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current++;
    setDropActive(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDropActive(false);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDrop = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDropActive(false);
    if (!editor) return;
    const at = editor.clientToScene(e.clientX, e.clientY);
    void editor.importImages(e.dataTransfer.files, at);
  };

  // --- Dragging existing guides on the canvas (Select tool) -------------------
  const guideDrag = useCallback(
    (e: PointerEvent) => {
      if (!editor || e.button !== 0) return;
      if (editor.activeTool !== 'select' && editor.activeTool !== 'direct') return;
      const canvasEl = editor.canvas.upperCanvasEl;
      const rect = canvasEl.getBoundingClientRect();
      const hit = editor.hitTestGuide({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      if (!hit) return;
      // Take over this pointer interaction from Fabric.
      e.stopPropagation();
      e.preventDefault();
      const move = (ev: PointerEvent) => {
        const p = editor.clientToScene(ev.clientX, ev.clientY);
        editor.moveGuide(hit.orientation, hit.index, hit.orientation === 'vertical' ? p.x : p.y);
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
        // Dropping a guide back onto the ruler (outside the canvas) deletes it.
        const r = canvasEl.getBoundingClientRect();
        const outside = ev.clientX < r.left || ev.clientY < r.top || ev.clientX > r.right || ev.clientY > r.bottom;
        if (outside) editor.removeGuide(hit.orientation, hit.index);
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
    },
    [editor],
  );

  const guideHover = useCallback(
    (e: PointerEvent) => {
      if (!editor || e.buttons) return;
      if (editor.activeTool !== 'select' && editor.activeTool !== 'direct') {
        setGuideCursor(null);
        return;
      }
      const rect = editor.canvas.upperCanvasEl.getBoundingClientRect();
      const hit = editor.hitTestGuide({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setGuideCursor(hit ? (hit.orientation === 'vertical' ? 'col-resize' : 'row-resize') : null);
    },
    [editor],
  );

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.addEventListener('pointerdown', guideDrag, true);
    el.addEventListener('pointermove', guideHover, true);
    return () => {
      el.removeEventListener('pointerdown', guideDrag, true);
      el.removeEventListener('pointermove', guideHover, true);
    };
  }, [guideDrag, guideHover]);

  return (
    <div
      ref={areaRef}
      className={`sw-canvas-area${showRulers ? ' has-rulers' : ''}${guideCursor ? ` guide-${guideCursor}` : ''}`}
      style={{ ['--ruler' as string]: `${showRulers ? RULER_SIZE : 0}px` }}
      data-tool={tool}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      dir="ltr"
    >
      {showRulers && <Rulers />}
      <div className="sw-canvas-host" ref={hostRef} data-testid="canvas-host" />
      {dropActive && (
        <div className="sw-drop-overlay">
          <div>{t('canvas.dropImages')}</div>
        </div>
      )}
      <ColorSamplerPanel />
      <Toast />
    </div>
  );
});
