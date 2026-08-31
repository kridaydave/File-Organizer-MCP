/**
 * File Organizer MCP Server v5.0.0
 * Manifest Integrity Service
 *
 * Provides tamper detection for rollback manifests using cryptographic hashing.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { RollbackManifest, RollbackAction } from "../../types.js";
import { getHistoryDirectory } from "../config/paths.js";

const SECRET_SEED = "FileOrganizerMCP-v3.5.0";

function getMachineSecret(): string {
  try {
    const configDir = getHistoryDirectory();
    const machineIdPath = path.join(configDir, "machine-id");
    let machineId: string;
    try {
      machineId = fs.readFileSync(machineIdPath, "utf-8").trim();
    } catch {
      machineId = crypto.randomUUID();
      try {
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(machineIdPath, machineId, {
          encoding: "utf-8",
          mode: 0o600,
        });
      } catch {
        // Fall back to in-memory ID if filesystem is read-only
      }
    }
    if (!machineId) {
      machineId = crypto.randomUUID();
    }
    return crypto
      .createHash("sha256")
      .update(SECRET_SEED + machineId)
      .digest("hex");
  } catch {
    return crypto
      .createHash("sha256")
      .update(SECRET_SEED + "fallback-machine-id")
      .digest("hex");
  }
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

  signManifest(
    manifest: Omit<RollbackManifest, "hash" | "signature"> & {
      version?: string;
    },
  ): RollbackManifest {
    const version = manifest.version ?? "1.0";
    const hash = this.computeHash(manifest.actions, manifest.timestamp);
    const withHash: Omit<RollbackManifest, "signature"> = {
      ...manifest,
      version,
      hash,
    };
    const signature = this.computeSignature(withHash);
    return {
      ...withHash,
      signature,
    };
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
