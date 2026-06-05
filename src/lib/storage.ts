import { put, del } from "@vercel/blob";

// Uploads go to Vercel Blob with `access: 'public'` plus a random suffix.
// The URL the SDK returns contains an unguessable token, so the bytes can't
// be enumerated even though the bucket itself is public. We store that URL
// in DB (Version.storageKey) and the authenticated download route 302s to it.

export type UploadResult = {
  // The URL returned by Vercel Blob. Save this as Version.storageKey so we
  // can hand it back to clients (via the auth-gated download route) and to
  // `del()` when the version is removed.
  storageKey: string;
  url: string;
};

export interface StorageService {
  upload(
    pathname: string,
    body: Buffer,
    mimeType: string,
  ): Promise<UploadResult>;
  getDownloadUrl(storageKey: string): Promise<string>;
  delete(storageKey: string): Promise<void>;
}

class VercelBlobStorageService implements StorageService {
  async upload(
    pathname: string,
    body: Buffer,
    mimeType: string,
  ): Promise<UploadResult> {
    const result = await put(pathname, body, {
      access: "public",
      addRandomSuffix: true,
      contentType: mimeType,
    });
    return { storageKey: result.url, url: result.url };
  }

  async getDownloadUrl(storageKey: string): Promise<string> {
    return storageKey;
  }

  async delete(storageKey: string): Promise<void> {
    await del(storageKey);
  }
}

let cached: StorageService | undefined;

export function getStorage(): StorageService {
  if (!cached) {
    cached = new VercelBlobStorageService();
  }
  return cached;
}

export function buildVersionStorageKey(params: {
  contractId: string;
  round: number;
  stage: string;
  originalFilename: string;
}): string {
  const sanitized = sanitizeFilename(params.originalFilename);
  const ts = Date.now();
  return `contracts/${params.contractId}/r${params.round}/${params.stage}-${ts}-${sanitized}`;
}

export function sanitizeFilename(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? "" : name.slice(dot);
  const safeBase = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  const safeExt = ext.replace(/[^A-Za-z0-9.]+/g, "");
  return `${safeBase || "file"}${safeExt}`;
}
