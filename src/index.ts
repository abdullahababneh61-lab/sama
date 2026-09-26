/**
 * Public entry point for embedding the workspace in the Sama platform.
 */
export { SamaWorkspace } from './workspace/SamaWorkspace';
export type { SamaWorkspaceProps, SamaWorkspaceHandle, ExportResult } from './workspace/SamaWorkspace';
export type { SamaDocument, SemanticLayer, DocumentAnalysis, PngOptions } from './editor/serialization';
export type { DocumentSettings, LayerKind, ToolId } from './editor/types';
export type { Locale } from './i18n';
export { Editor } from './editor/Editor';
