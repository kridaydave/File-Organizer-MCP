/**
 * File Organizer MCP Server v3.3.3
 * Manifest Integrity Service
 *
 * Provides tamper detection for rollback manifests using cryptographic hashing.
 */

import crypto from "crypto";
import os from "os";
import type { RollbackManifest, RollbackAction } from "../types.js";

const SECRET_SEED = "FileOrganizerMCP-v3.3.3";

function getMachineSecret(): string {
  const machineInfo = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model || "unknown",
    os.totalmem(),
  ].join("|");
  return crypto
    .createHash("sha256")
    .update(SECRET_SEED + machineInfo)
    .digest("hex");
}

export interface ManifestVerificationResult {
  valid: boolean;
  error?: string;
}

export class ManifestIntegrityService {
  private readonly secretKey: string;

  constructor() {
    this.secretKey = getMachineSecret();
  }

  computeHash(actions: RollbackAction[], timestamp: number): string {
    const data = JSON.stringify({ actions, timestamp });
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  computeSignature(manifest: Omit<RollbackManifest, "signature">): string {
    const hmac = crypto.createHmac("sha256", this.secretKey);
    const data = JSON.stringify({
      id: manifest.id,
      timestamp: manifest.timestamp,
      description: manifest.description,
      actions: manifest.actions,
      version: manifest.version,
      hash: manifest.hash,
    });
    hmac.update(data);
    return hmac.digest("hex");
  }

  verifyManifest(manifest: RollbackManifest): ManifestVerificationResult {
    if (!manifest.version || manifest.version !== "1.0") {
      return { valid: false, error: "Invalid or missing manifest version" };
    }

    if (!manifest.hash) {
      return { valid: false, error: "Missing manifest hash" };
    }

    const expectedHash = this.computeHash(manifest.actions, manifest.timestamp);
    if (expectedHash !== manifest.hash) {
      return {
        valid: false,
        error: "Manifest hash mismatch - possible tampering detected",
      };
    }

    if (!manifest.signature) {
      return { valid: false, error: "Missing manifest signature" };
    }

    const manifestWithoutSignature: Omit<RollbackManifest, "signature"> = {
      id: manifest.id,
      timestamp: manifest.timestamp,
      description: manifest.description,
      actions: manifest.actions,
      version: manifest.version,
      hash: manifest.hash,
    };

    const expectedSignature = this.computeSignature(manifestWithoutSignature);
    if (expectedSignature !== manifest.signature) {
      return {
        valid: false,
        error: "Manifest signature mismatch - possible tampering detected",
      };
    }

    return { valid: true };
  }
}

export const manifestIntegrityService = new ManifestIntegrityService();
