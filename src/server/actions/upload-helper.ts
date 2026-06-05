import "server-only";
import type { VersionStage } from "@prisma/client";
import { buildVersionStorageKey, getStorage } from "@/lib/storage";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const ALLOWED_DOC_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
] as const;

export const PDF_ONLY_MIMES = ["application/pdf"] as const;

export type UploadValidationError =
  | { code: "missing-file" }
  | { code: "too-large"; maxBytes: number; actualBytes: number }
  | { code: "wrong-mime"; allowed: ReadonlyArray<string>; actual: string };

export type UploadValidationResult =
  | { ok: true; file: File | null }
  | { ok: false; error: UploadValidationError };

// When `optional` is true, a missing file returns { ok: true, file: null } so
// the caller can advance the stage without attaching a document. Validation
// still runs on size/mime when a file *is* present.
export function validateUpload(
  file: unknown,
  opts: { allowedMimes: ReadonlyArray<string>; optional?: boolean },
): UploadValidationResult {
  if (!(file instanceof File) || file.size === 0) {
    if (opts.optional) return { ok: true, file: null };
    return { ok: false, error: { code: "missing-file" } };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: { code: "too-large", maxBytes: MAX_UPLOAD_BYTES, actualBytes: file.size },
    };
  }
  if (!opts.allowedMimes.includes(file.type)) {
    return {
      ok: false,
      error: { code: "wrong-mime", allowed: opts.allowedMimes, actual: file.type },
    };
  }
  return { ok: true, file };
}

export type UploadedVersionData = {
  fileName: string;
  storageKey: string;
  fileSize: number;
  mimeType: string;
  versionLabel: string;
  round: number;
  stage: VersionStage;
};

export async function uploadVersionFile(params: {
  file: File;
  contractId: string;
  round: number;
  stage: VersionStage;
}): Promise<UploadedVersionData> {
  const { file, contractId, round, stage } = params;
  const buffer = Buffer.from(await file.arrayBuffer());
  const storageKey = buildVersionStorageKey({
    contractId,
    round,
    stage,
    originalFilename: file.name,
  });

  const storage = getStorage();
  const uploaded = await storage.upload(storageKey, buffer, file.type);

  return {
    fileName: file.name,
    storageKey: uploaded.storageKey,
    fileSize: file.size,
    mimeType: file.type,
    versionLabel: deriveVersionLabel(round, stage),
    round,
    stage,
  };
}

export function deriveVersionLabel(round: number, stage: VersionStage): string {
  switch (stage) {
    case "TEMPLATE":
      return "template";
    case "BU_DRAFT":
      return `R${round}-draft`;
    case "LEGAL_REVIEWED":
      return `R${round}-reviewed`;
    case "CP_RETURNED":
      return `R${round}-cp-returned`;
    case "FINAL":
      return `R${round}-final`;
    case "SIGNED":
      return "signed";
  }
}
