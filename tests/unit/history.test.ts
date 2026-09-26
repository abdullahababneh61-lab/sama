import { describe, expect, it } from 'vitest';
import { History, type Snapshot } from '../../src/editor/history';

const doc = { name: 'd', width: 100, height: 100, background: '#fff' };
const snap = (label: string, objects: [string, string][]): Snapshot => ({
  label,
  doc: { ...doc },
  objects: objects.map(([id, json]) => ({ id, json })),
  selection: [],
});

describe('History', () => {
  it('records, undoes and redoes steps', () => {
    const h = new History();
    h.reset(snap('new', []));
    expect(h.canUndo).toBe(false);
    h.push(snap('a', [['1', '{"x":1}']]));
    h.push(snap('b', [['1', '{"x":2}']]));
    expect(h.labels).toEqual(['new', 'a', 'b']);
    expect(h.undo()?.label).toBe('a');
    expect(h.undo()?.label).toBe('new');
    expect(h.undo()).toBeNull();
    expect(h.redo()?.label).toBe('a');
    expect(h.canRedo).toBe(true);
  });

  it('ignores commits that do not change anything', () => {
    const h = new History();
    h.reset(snap('new', [['1', '{}']]));
    expect(h.push(snap('same', [['1', '{}']]))).toBe(false);
    expect(h.labels).toEqual(['new']);
  });

  it('discards redo states after a new action', () => {
    const h = new History();
    h.reset(snap('new', []));
    h.push(snap('a', [['1', 'a']]));
    h.push(snap('b', [['1', 'b']]));
    h.undo();
    h.push(snap('c', [['1', 'c']]));
    expect(h.labels).toEqual(['new', 'a', 'c']);
    expect(h.canRedo).toBe(false);
  });

  it('caps the number of steps', () => {
    const h = new History(5);
    h.reset(snap('new', []));
    for (let i = 0; i < 10; i++) h.push(snap(`s${i}`, [['1', String(i)]]));
    expect(h.labels).toHaveLength(5);
    expect(h.labels[4]).toBe('s9');
    expect(h.position).toBe(4);
  });

  it('shares unchanged layer strings between snapshots', () => {
    const h = new History();
    const big = 'x'.repeat(1000);
    h.reset(snap('new', [['img', big]]));
    const next = snap('b', [
      ['img', 'x'.repeat(1000)],
      ['r', '{}'],
    ]);
    h.push(next);
    expect(h.current!.objects[0].json).toBe(big);
  });

  it('detects document setting changes', () => {
    const h = new History();
    h.reset(snap('new', []));
    const resized = snap('resize', []);
    resized.doc.width = 200;
    expect(h.push(resized)).toBe(true);
  });

  it('jumps to arbitrary positions', () => {
    const h = new History();
    h.reset(snap('new', []));
    h.push(snap('a', [['1', 'a']]));
    h.push(snap('b', [['1', 'b']]));
    expect(h.goTo(0)?.label).toBe('new');
    expect(h.goTo(0)).toBeNull();
    expect(h.goTo(2)?.label).toBe('b');
  });
});
