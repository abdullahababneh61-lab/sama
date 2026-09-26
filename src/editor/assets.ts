/**
 * Asset registry for imported images.
 *
 * Imported files are kept as Blobs and referenced on canvas through short
 * `blob:` URLs. This keeps undo snapshots tiny (a URL instead of megabytes of
 * base64). When the document is exported as JSON, each asset is embedded once
 * as a data URL in an `assets` table; on load the table is turned back into
 * blobs.
 */
import { createId } from './meta';

export interface ImageAsset {
  id: string;
  blob: Blob;
  url: string;
  mimeType: string;
  fileName?: string;
  width: number;
  height: number;
}

export interface SerializedAsset {
  mimeType: string;
  fileName?: string;
  width: number;
  height: number;
  dataUrl: string;
}

export class AssetRegistry {
  private assets = new Map<string, ImageAsset>();

  get(id: string) {
    return this.assets.get(id);
  }

  /** Registers an image blob and resolves once its dimensions are known. */
  async add(blob: Blob, fileName?: string, id = createId('a')): Promise<ImageAsset> {
    const url = URL.createObjectURL(blob);
    const { width, height } = await measureImage(url);
    const asset: ImageAsset = { id, blob, url, mimeType: blob.type || 'image/png', fileName, width, height };
    this.assets.set(id, asset);
    return asset;
  }

  /** Serializes the given assets (only those still referenced) as data URLs. */
  async serialize(ids: Iterable<string>): Promise<Record<string, SerializedAsset>> {
    const out: Record<string, SerializedAsset> = {};
    for (const id of ids) {
      const a = this.assets.get(id);
      if (!a || out[id]) continue;
      out[id] = {
        mimeType: a.mimeType,
        fileName: a.fileName,
        width: a.width,
        height: a.height,
        dataUrl: await blobToDataUrl(a.blob),
      };
    }
    return out;
  }

  /** Restores assets from a serialized table. Returns id → blob URL. */
  async load(table: Record<string, SerializedAsset>): Promise<Map<string, string>> {
    const urls = new Map<string, string>();
    for (const [id, s] of Object.entries(table)) {
      const existing = this.assets.get(id);
      if (existing) {
        urls.set(id, existing.url);
        continue;
      }
      const blob = await (await fetch(s.dataUrl)).blob();
      const asset = await this.add(blob, s.fileName, id);
      urls.set(id, asset.url);
    }
    return urls;
  }

  dispose() {
    for (const a of this.assets.values()) URL.revokeObjectURL(a.url);
    this.assets.clear();
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function measureImage(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = url;
  });
}
