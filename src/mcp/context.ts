/**
 * Tool Context — per-request dependencies
 *
 * The stdio server is stateless: every tool call gets a fresh context with a
 * freshly-loaded user config. Nothing session-shaped survives between calls.
 */

import { loadUserConfig, type UserConfig } from "../config.js";
import {
  HistoryLoggerService,
  historyLogger,
} from "../services/history-logger.service.js";

export interface ToolContext {
  /** User config as of this request (read from disk). */
  config: UserConfig;
  /** History sink for this process. */
  history: HistoryLoggerService;
}

/**
 * Build the context for one tool call. The default history instance is a
 * stateless file appender shared by all calls in the process.
 */
export function createRequestContext(): ToolContext {
  return {
    config: loadUserConfig(),
    history: historyLogger,
  };
}
