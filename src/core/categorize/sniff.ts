/**
 * Magic-byte file type sniffing for core/categorize.
 * Reads the first 8KB and matches against constants/file-signatures.
 */

import fs from "fs/promises";
import {
  matchSignature,
  detectExtensionMismatch,
} from "../../constants/file-signatures.js";
import type { PathValidatorService } from "../../services/path-validator.service.js";

export interface SniffResult {
  detectedType: string;
  mimeType: string;
  confidence: number;
  extensionMatch: boolean;
}

const HEADER_BYTES = 8192;

/**
 * Open the file TOCTOU-safely and classify it by content.
 * Unknown content gets low confidence and no mismatch claim, so callers
 * fall back to the extension-based category.
 */
export async function sniffFileType(
  pathValidator: PathValidatorService,
  filePath: string,
): Promise<SniffResult> {
  const handle = await pathValidator.openAndValidateFile(filePath);
  try {
    const buffer = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEADER_BYTES, 0);
    const header = buffer.subarray(0, bytesRead);

    const signature = matchSignature(header);
    const mismatch = detectExtensionMismatch(filePath, header);

    if (!signature) {
      return {
        detectedType: "UNKNOWN",
        mimeType: "application/octet-stream",
        confidence: 0.3,
        extensionMatch: mismatch === null,
      };
    }

    return {
      detectedType: signature.type,
      mimeType: signature.mimeType,
      confidence: 0.9,
      extensionMatch: mismatch === null,
    };
  } finally {
    await handle.close().catch(() => {});
  }
}
