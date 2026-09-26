/**
 * React context plumbing: every component inside <SamaWorkspace> can reach
 * the workspace's store (reactive UI state) and Editor (commands).
 */
import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { Editor } from '../editor/Editor';
import type { WorkspaceState, WorkspaceStore } from '../store/workspaceStore';

export const StoreContext = createContext<WorkspaceStore | null>(null);
export const EditorContext = createContext<Editor | null>(null);

/** Subscribes to a slice of workspace state. Re-renders only when it changes. */
export function useWorkspace<T>(selector: (s: WorkspaceState) => T): T {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useWorkspace must be used inside <SamaWorkspace>');
  return useStore(store, selector);
}

/** The Editor instance, or null until the canvas has mounted. */
export function useEditor(): Editor | null {
  return useContext(EditorContext);
}
