/**
 * Keeps a selecting tool's cursor in step with the selection mode its next
 * click would use: the options-bar mode, changed on the fly by Shift/Alt
 * (see selectionModes.ts). Updates as the keys are pressed and released,
 * even before the pointer moves.
 */
import type { Editor } from '../Editor';

type Mods = { shift: boolean; alt: boolean };

export class ModeCursor {
  private off: (() => void) | null = null;
  private mods: Mods = { shift: false, alt: false };

  /**
   * @param cursorFor cursor for the given modifier keys
   * @param paused while true (a gesture in progress) the cursor is left alone
   */
  constructor(
    private readonly editor: Editor,
    private readonly cursorFor: (mods: Mods) => string,
    private readonly paused: () => boolean = () => false,
  ) {}

  start() {
    this.stop();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Shift' || e.key === 'Alt') this.update({ shift: e.shiftKey, alt: e.altKey });
    };
    // Keys released while the window was in the background never send keyup.
    const onBlur = () => this.update({ shift: false, alt: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    const offMove = this.editor.canvas.on('mouse:move', (opt) => {
      const e = opt.e as MouseEvent;
      this.update({ shift: !!e.shiftKey, alt: !!e.altKey });
    });
    this.off = () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
      offMove();
    };
    this.update({ shift: false, alt: false });
  }

  stop() {
    this.off?.();
    this.off = null;
  }

  /** Re-applies the cursor (e.g. after the options-bar mode changed). */
  refresh() {
    this.update(this.mods);
  }

  private update(mods: Mods) {
    this.mods = mods;
    if (this.paused()) return;
    const c = this.cursorFor(mods);
    if (c !== this.editor.canvas.defaultCursor) this.editor.setCursor(c);
  }
}
