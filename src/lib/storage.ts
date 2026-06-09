import { put, del } from "@vercel/blob";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

export type UploadResult = {
  storageKey: string;
  url: string;
};

export type DownloadResult =
  | { type: "redirect"; url: string }
  | { type: "stream"; body: ReadableStream; mimeType: string };

export interface StorageService {
  upload(pathname: string, body: Buffer, mimeType: string): Promise<UploadResult>;
  download(storageKey: string): Promise<DownloadResult>;
  delete(storageKey: string): Promise<void>;
}

class VercelBlobStorageService implements StorageService {
  async upload(pathname: string, body: Buffer, mimeType: string): Promise<UploadResult> {
    const result = await put(pathname, body, {
      access: "public",
      addRandomSuffix: true,
      contentType: mimeType,
    });
    return { storageKey: result.url, url: result.url };
  }

  async download(storageKey: string): Promise<DownloadResult> {
    return { type: "redirect", url: storageKey };
  }

  async delete(storageKey: string): Promise<void> {
    await del(storageKey);
  }
}

class S3StorageService implements StorageService {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.client = new S3Client({
      endpoint: process.env.S3_ENDPOINT!,
      region: process.env.S3_REGION ?? "us-east-1",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY!,
        secretAccessKey: process.env.S3_SECRET_KEY!,
      },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    });
    this.bucket = process.env.S3_BUCKET ?? "contracts";
  }

  async upload(pathname: string, body: Buffer, mimeType: string): Promise<UploadResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: pathname,
        Body: body,
        ContentType: mimeType,
      }),
    );
    return { storageKey: pathname, url: pathname };
  }

  async download(storageKey: string): Promise<DownloadResult> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
    return {
      type: "stream",
      body: result.Body!.transformToWebStream(),
      mimeType: result.ContentType ?? "application/octet-stream",
    };
  }

  async delete(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
  }
}

let cached: StorageService | undefined;

export function getStorage(): StorageService {
  if (!cached) {
    cached = process.env.BLOB_READ_WRITE_TOKEN
      ? new VercelBlobStorageService()
      : new S3StorageService();
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
