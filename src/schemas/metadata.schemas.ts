/**
 * File Organizer MCP Server v3.4.2
 * Metadata Inspection Schemas
 */

import { z } from "zod";
import { CommonParamsSchema } from "./common.schemas.js";

/**
 * Schema for inspect_metadata tool
 * Inspects a file and returns comprehensive but privacy-safe metadata
 */
export const InspectMetadataInputSchema = z
  .object({
    file: z
      .string()
      .min(1, "File path cannot be empty")
      .describe("Full path to the file to inspect"),
  })
  .merge(CommonParamsSchema);

export type InspectMetadataInput = z.infer<typeof InspectMetadataInputSchema>;
