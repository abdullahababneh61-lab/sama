/**
 * <SamaWorkspace> — the embeddable design workspace component.
 *
 * Usage (inside the Sama platform, later):
 *
 *   const ref = useRef<SamaWorkspaceHandle>(null);
 *   <SamaWorkspace
 *     ref={ref}
 *     locale="ar"
 *     documentSettings={{ width: 1080, height: 1350, name: 'Exercise 3' }}
 *     initialDocument={savedDoc}             // optional, resumes work
 *     onChange={() => scheduleAutosave()}     // after every undoable change
 *     onExport={({ png, document }) => { upload(png, document); return false; }}
 *     topBarActions={<SubmitButton />}
 *   />
 *   // later: const doc = await ref.current!.getDocument();
 *
 * The component owns one Editor and one store; several can coexist on a page.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Editor, shortcutKey } from '../editor/Editor';
import type { PngOptions, SamaDocument } from '../editor/serialization';
import type { DocumentSettings, LayerKind } from '../editor/types';
import { createWorkspaceStore, DEFAULT_DOCUMENT, type WorkspaceStore } from '../store/workspaceStore';
import { EditorContext, StoreContext } from './context';
import { isRtl, LocaleContext, translate, type Locale } from '../i18n';
import { PortalContext } from '../ui/controls/Popover';
import { TopBar } from '../ui/TopBar';
import { Toolbar } from '../ui/Toolbar';
import { OptionsBar } from '../ui/OptionsBar';
import { CanvasArea } from '../ui/CanvasArea';
import { RightPanel } from '../ui/RightPanel';
import { StatusBar } from '../ui/StatusBar';
import { ExportDialog, type ExportRequest } from '../ui/dialogs/ExportDialog';
import { DocumentDialog } from '../ui/dialogs/DocumentDialog';
import { ShortcutsDialog } from '../ui/dialogs/ShortcutsDialog';
import '../styles/workspace.css';

export interface ExportResult {
  png?: Blob;
  document?: SamaDocument;
}

export interface SamaWorkspaceProps {
  /** Interface language. Arabic switches the UI to right-to-left. Default: 'en'. */
  locale?: Locale;
  /** Artboard settings for a new document (ignored when `initialDocument` is set). */
  documentSettings?: Partial<DocumentSettings>;
  /** A document previously produced by `getDocument()` / the JSON export. */
  initialDocument?: SamaDocument;
  /** Called after every undoable change. */
  onChange?: () => void;
  /**
   * Called when the learner exports. Return `false` to prevent the default
   * behaviour (downloading the files), e.g. when the host uploads them instead.
   */
  onExport?: (result: ExportResult) => boolean | void | Promise<boolean | void>;
  /** Extra controls rendered in the top bar, before the Export button. */
  topBarActions?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export interface SamaWorkspaceHandle {
  /** The structured document: semantic layers, analysis, and the exact scene. */
  getDocument(): Promise<SamaDocument>;
  loadDocument(doc: SamaDocument): Promise<void>;
  exportPng(options?: PngOptions): Promise<Blob>;
  newDocument(settings?: Partial<DocumentSettings>): void;
  /** Low-level access for advanced integrations and tests. */
  readonly editor: Editor | null;
}

type Dialog = null | 'export' | 'new' | 'setup' | 'shortcuts';

/** Elements whose keyboard input must never trigger canvas shortcuts. */
function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['checkbox', 'radio', 'range', 'button'].includes(type);
  }
  return false;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function safeFileName(name: string) {
  return (name || 'design').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'design';
}

export const SamaWorkspace = forwardRef<SamaWorkspaceHandle, SamaWorkspaceProps>(function SamaWorkspace(
  { locale = 'en', documentSettings, initialDocument, onChange, onExport, topBarActions, className, style },
  ref,
) {
  const [store] = useState<WorkspaceStore>(() =>
    createWorkspaceStore({
      doc: {
        ...DEFAULT_DOCUMENT,
        name: translate(locale, 'doc.untitled'),
        ...documentSettings,
      },
    }),
  );
  const [editor, setEditor] = useState<Editor | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [portalEl, setPortalEl] = useState<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onExportRef = useRef(onExport);
  onExportRef.current = onExport;

  // Arabic learners type RTL text by default.
  useEffect(() => {
    const s = store.getState();
    if (isRtl(locale) && s.toolOptions.text.direction === 'ltr') {
      store.setState({ toolOptions: { ...s.toolOptions, text: { ...s.toolOptions.text, direction: 'rtl', textAlign: 'right' } } });
    }
  }, [locale, store]);

  // Create the Editor once the canvas host is in the DOM.
  useEffect(() => {
    if (!hostRef.current) return;
    const labels = Object.fromEntries(
      (['paint', 'path', 'rect', 'ellipse', 'line', 'polygon', 'text', 'image', 'group'] as LayerKind[]).map((k) => [
        k,
        translate(locale, `kind.${k}`),
      ]),
    );
    const ed = new Editor({
      host: hostRef.current,
      store,
      layerLabels: labels,
      translate: (key, params) => translate(locale, key, params),
      onChange: () => onChangeRef.current?.(),
    });
    setEditor(ed);
    if (initialDocument) {
      ed.loadDocument(initialDocument).catch((err) => {
        console.error('[sama] could not load initial document', err);
        ed.notify('toast.openFailed', 'warning');
      });
    }
    if (import.meta.env.DEV) (window as unknown as { samaEditor?: Editor }).samaEditor = ed;
    return () => {
      ed.dispose();
      setEditor(null);
    };
    // The editor is created once per mount; locale/doc props are initial values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  // ---- File actions -------------------------------------------------------------
  const exportFiles = useCallback(
    async (req: ExportRequest) => {
      if (!editor) return;
      const result: ExportResult = {};
      if (req.png) result.png = await editor.exportPng({ scale: req.scale, transparent: req.transparent });
      if (req.json) result.document = await editor.getDocument();
      const handled = (await onExportRef.current?.(result)) === false;
      if (handled) return;
      const base = safeFileName(store.getState().doc.name);
      if (result.png) download(result.png, `${base}${req.scale > 1 ? `@${req.scale}x` : ''}.png`);
      if (result.document) {
        download(new Blob([JSON.stringify(result.document, null, 2)], { type: 'application/json' }), `${base}.sama.json`);
      }
    },
    [editor, store],
  );

  const saveDocument = useCallback(async () => {
    if (!editor) return;
    const doc = await editor.getDocument();
    download(new Blob([JSON.stringify(doc)], { type: 'application/json' }), `${safeFileName(doc.document.name)}.sama.json`);
  }, [editor]);

  const openDocumentFile = useCallback(
    async (file: File) => {
      if (!editor) return;
      try {
        const data = JSON.parse(await file.text()) as SamaDocument;
        await editor.loadDocument(data);
      } catch (err) {
        console.error('[sama] open failed', err);
        editor.notify('toast.openFailed', 'warning');
      }
    },
    [editor],
  );

  const actions = {
    newDocument: () => setDialog('new'),
    openDocument: () => docInput.current?.click(),
    saveDocument: () => void saveDocument(),
    importImage: () => imageInput.current?.click(),
    documentSetup: () => setDialog('setup'),
    exportDialog: () => setDialog('export'),
    exportJson: () => void exportFiles({ png: false, json: true, scale: 1, transparent: false }),
    showShortcuts: () => setDialog('shortcuts'),
  };
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // ---- Imperative API ---------------------------------------------------------------
  useImperativeHandle(
    ref,
    () => ({
      getDocument: () => {
        if (!editor) return Promise.reject(new Error('Workspace not ready'));
        return editor.getDocument();
      },
      loadDocument: (doc) => {
        if (!editor) return Promise.reject(new Error('Workspace not ready'));
        return editor.loadDocument(doc);
      },
      exportPng: (options) => {
        if (!editor) return Promise.reject(new Error('Workspace not ready'));
        return editor.exportPng(options);
      },
      newDocument: (settings) => editor?.newDocument(settings),
      get editor() {
        return editor;
      },
    }),
    [editor],
  );

  // ---- Keyboard ---------------------------------------------------------------------
  useEffect(() => {
    if (!editor) return;
    const root = rootRef.current;
    const inScope = () => {
      const a = document.activeElement;
      return !a || a === document.body || (root?.contains(a) ?? false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || dialog || !inScope() || isTypingTarget(e.target)) return;
      const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? e.metaKey : e.ctrlKey;
      const k = shortcutKey(e);
      // Workspace-level (dialogs, files)
      if (mod && k === 's') {
        e.preventDefault();
        actionsRef.current.saveDocument();
        return;
      }
      if (mod && k === 'o') {
        e.preventDefault();
        actionsRef.current.openDocument();
        return;
      }
      if (mod && e.shiftKey && k === 'e') {
        e.preventDefault();
        actionsRef.current.exportDialog();
        return;
      }
      if (mod && e.shiftKey && k === 'i') {
        e.preventDefault();
        actionsRef.current.importImage();
        return;
      }
      if ((e.key === '?' || e.key === '؟' || (e.code === 'Slash' && e.shiftKey)) && !mod) {
        e.preventDefault();
        actionsRef.current.showShortcuts();
        return;
      }
      if (editor.handleKeyDown(e)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (editor.handleKeyUp(e)) e.preventDefault();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (dialog || !inScope() || isTypingTarget(e.target) || editor.state.isEditingText) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      e.preventDefault();
      if (files.length) void editor.importImages(files);
      else if (editor.hasClipboard()) void editor.paste();
    };
    const onBlur = () => editor.handleBlur();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('paste', onPaste);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('blur', onBlur);
    };
  }, [editor, dialog]);

  const rtl = isRtl(locale);

  return (
    <LocaleContext.Provider value={locale}>
      <StoreContext.Provider value={store}>
        <EditorContext.Provider value={editor}>
          <PortalContext.Provider value={portalEl}>
            <div
              ref={rootRef}
              className={`sw-root${className ? ` ${className}` : ''}`}
              style={style}
              dir={rtl ? 'rtl' : 'ltr'}
              lang={locale}
              data-testid="sama-workspace"
              onMouseDown={(e) => {
                // Buttons shouldn't keep keyboard focus after a click, or Space/Enter
                // would re-trigger them instead of reaching canvas shortcuts.
                if ((e.target as HTMLElement).closest('button')) e.preventDefault();
              }}
            >
              <TopBar actions={actions} extra={topBarActions} />
              <OptionsBar />
              <div className="sw-main">
                <Toolbar onImportImage={actions.importImage} />
                <CanvasArea ref={hostRef} />
                <RightPanel />
              </div>
              <StatusBar />

              <input
                ref={imageInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                data-testid="image-input"
                onChange={(e) => {
                  if (e.target.files?.length) void editor?.importImages(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={docInput}
                type="file"
                accept=".json,application/json"
                hidden
                data-testid="document-input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void openDocumentFile(f);
                  e.target.value = '';
                }}
              />

              {dialog === 'export' && <ExportDialog onClose={() => setDialog(null)} onExport={exportFiles} />}
              {(dialog === 'new' || dialog === 'setup') && (
                <DocumentDialog
                  mode={dialog}
                  initial={store.getState().doc}
                  onClose={() => setDialog(null)}
                  onConfirm={(s) => {
                    setDialog(null);
                    if (!editor) return;
                    if (dialog === 'new') editor.newDocument(s);
                    else {
                      editor.resizeArtboard(s.width, s.height);
                      editor.setDocument({ name: s.name, background: s.background });
                    }
                  }}
                />
              )}
              {dialog === 'shortcuts' && <ShortcutsDialog onClose={() => setDialog(null)} />}
              <div className="sw-portal" ref={setPortalEl} />
            </div>
          </PortalContext.Provider>
        </EditorContext.Provider>
      </StoreContext.Provider>
    </LocaleContext.Provider>
  );
});
