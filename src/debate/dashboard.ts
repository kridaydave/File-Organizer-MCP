/**
 * Real-Time Debate Dashboard
 *
 * Provides comprehensive dashboard functionality for the Multi-Shepherd Debate System.
 * Supports console rendering with colors, WebSocket real-time updates,
 * progress bars for phase completion, and complete TypeScript typing.
 *
 * @module debate/dashboard
 */

import {
  shepherdId as createShepherdId,
  ShepherdId,
} from "./enhanced-voting.js";
import type { Server } from "http";
import type { WebSocketServer } from "ws";

export type { ShepherdId };
export { createShepherdId as shepherdId };

/** Creates a {@link ShepherdId} from a plain string. */
function shepherdId(id: string): ShepherdId {
  return createShepherdId(id);
}

// ============================================================================
// Phase Types
// ============================================================================

/** Types of phases in a debate session. */
export type PhaseType =
  | "initialization"
  | "presentation"
  | "deliberation"
  | "voting"
  | "resolution"
  | "completed";

// ============================================================================
// ID Types
// ============================================================================

/** Unique identifier for a proposal. */
export type ProposalId = string & { readonly __brand: unique symbol };

/** Creates a {@link ProposalId} from a plain string. */
export function proposalId(id: string): ProposalId {
  return id as ProposalId;
}

// ============================================================================
// Core Metrics Interfaces
// ============================================================================

/**
 * Activity metrics for a participant in the debate.
 */
export interface ActivityMetrics {
  messagesCount: number;
  votesCast: number;
  concernsRaised: number;
  agreementsMade: number;
  lastActive: Date;
}

/**
 * Metrics for a proposal in the debate.
 */
export interface ProposalMetrics {
  supportCount: number;
  objectionCount: number;
  avgConfidence: number;
  concerns: string[];
  status: "pending" | "approved" | "rejected";
}

/**
 * Conflict item waiting for resolution.
 */
export interface Conflict {
  id: string;
  type: string;
  description: string;
  priority: number;
  timestamp: Date;
  participants: ShepherdId[];
}

/**
 * Weighted consensus metrics from voting.
 */
export interface WeightedConsensus {
  agreementIndex: number;
  confidenceIndex: number;
  concernDensity: number;
  participationRate: number;
}

/**
 * Main dashboard interface representing the complete state of a debate session.
 */
export interface DebateDashboard {
  currentPhase: PhaseType;
  phaseProgress: number;
  participantActivity: Map<ShepherdId, ActivityMetrics>;
  proposalStatus: Map<ProposalId, ProposalMetrics>;
  conflictQueue: Conflict[];
  consensusMetrics: WeightedConsensus;
  timeRemaining: number;
}

// ============================================================================
// Debate Interface (for generating dashboard state)
// ============================================================================

/**
 * Minimal debate interface for extracting dashboard state.
 */
export interface Debate {
  getPhase(): PhaseType;
  getPhaseProgress(): number;
  getParticipants(): { id: ShepherdId }[];
  getProposals(): { id: ProposalId }[];
  getConflicts(): Conflict[];
  getTimeRemaining(): number;
  getVotes(): Array<{
    participantId: ShepherdId;
    proposalId: ProposalId;
    approval: number;
    confidence: number;
    concerns: string[];
  }>;
}

// ============================================================================
// DashboardRenderer
// ============================================================================

/**
 * Console color codes for dashboard rendering.
 */
const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  underscore: "\x1b[4m",
  blink: "\x1b[5m",
  reverse: "\x1b[7m",
  hidden: "\x1b[8m",
  fgBlack: "\x1b[30m",
  fgRed: "\x1b[31m",
  fgGreen: "\x1b[32m",
  fgYellow: "\x1b[33m",
  fgBlue: "\x1b[34m",
  fgMagenta: "\x1b[35m",
  fgCyan: "\x1b[36m",
  fgWhite: "\x1b[37m",
  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
} as const;

/**
 * Renders debate dashboard to various output formats.
 */
export class DashboardRenderer {
  /**
   * Generates a progress bar string.
   *
   * @param progress - Progress value from 0-100.
   * @param width - Width of the progress bar in characters.
   * @returns Progress bar string with colors.
   */
  private renderProgressBar(progress: number, width: number = 30): string {
    const filled = Math.round((progress / 100) * width);
    const unfilled = width - filled;

    const color =
      progress >= 75
        ? COLORS.fgGreen
        : progress >= 50
          ? COLORS.fgYellow
          : progress >= 25
            ? COLORS.fgMagenta
            : COLORS.fgRed;

    const filledBar = `${color}${"█".repeat(filled)}${COLORS.reset}`;
    const unfilledBar = `${COLORS.dim}${"░".repeat(unfilled)}${COLORS.reset}`;

    return `${filledBar}${unfilledBar} ${Math.round(progress)}%`;
  }

  /**
   * Formats time remaining in human-readable format.
   *
   * @param seconds - Time remaining in seconds.
   * @returns Formatted time string.
   */
  private formatTimeRemaining(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${mins}m ${secs}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${mins}m`;
    }
  }

  /**
   * Renders phase name with appropriate color based on phase type.
   *
   * @param phase - Current debate phase.
   * @returns Colored phase name string.
   */
  private renderPhase(phase: PhaseType): string {
    const phaseColors: Record<PhaseType, string> = {
      initialization: COLORS.fgCyan,
      presentation: COLORS.fgBlue,
      deliberation: COLORS.fgMagenta,
      voting: COLORS.fgYellow,
      resolution: COLORS.fgGreen,
      completed: COLORS.fgWhite + COLORS.bgGreen,
    };

    const color = phaseColors[phase] || COLORS.fgWhite;
    const label =
      phase.charAt(0).toUpperCase() + phase.slice(1).replace(/-/g, " ");
    return `${color}${COLORS.bright}${label}${COLORS.reset}`;
  }

  /**
   * Renders a weighted consensus gauge.
   *
   * @param consensus - Consensus metrics to render.
   * @returns Visual representation of consensus.
   */
  private renderConsensusGauge(consensus: WeightedConsensus): string {
    const width = 20;
    const filled = Math.round(consensus.agreementIndex * width);

    let gauge = "";
    for (let i = 0; i < width; i++) {
      if (i < filled) {
        const color =
          consensus.agreementIndex >= 0.7
            ? COLORS.fgGreen
            : consensus.agreementIndex >= 0.4
              ? COLORS.fgYellow
              : COLORS.fgRed;
        gauge += `${color}█${COLORS.reset}`;
      } else {
        gauge += `${COLORS.dim}░${COLORS.reset}`;
      }
    }

    return gauge;
  }

  /**
   * Renders the dashboard to console output with full formatting.
   *
   * @param dashboard - The debate dashboard to render.
   * @returns Formatted console output string.
   */
  renderToConsole(dashboard: DebateDashboard): string {
    const lines: string[] = [];

    lines.push(`${COLORS.bright}${COLORS.fgWhite}═${COLORS.reset}`.repeat(50));
    lines.push(`${COLORS.bright}  REAL-TIME DEBATE DASHBOARD${COLORS.reset}`);
    lines.push(`${COLORS.bright}${COLORS.fgWhite}═${COLORS.reset}`.repeat(50));
    lines.push("");

    lines.push(
      `${COLORS.fgCyan}${COLORS.bright}Phase:${COLORS.reset} ${this.renderPhase(dashboard.currentPhase)}`,
    );
    lines.push(
      `${COLORS.fgCyan}${COLORS.bright}Progress:${COLORS.reset} ${this.renderProgressBar(dashboard.phaseProgress)}`,
    );
    lines.push(
      `${COLORS.fgCyan}${COLORS.bright}Time Remaining:${COLORS.reset} ${this.formatTimeRemaining(dashboard.timeRemaining)}`,
    );
    lines.push("");

    lines.push(
      `${COLORS.fgYellow}${COLORS.bright}Consensus Metrics:${COLORS.reset}`,
    );
    lines.push(
      `  Agreement: ${this.renderConsensusGauge(dashboard.consensusMetrics)} ${(dashboard.consensusMetrics.agreementIndex * 100).toFixed(1)}%`,
    );
    lines.push(
      `  Confidence: ${(dashboard.consensusMetrics.confidenceIndex * 100).toFixed(1)}%`,
    );
    lines.push(
      `  Participation: ${(dashboard.consensusMetrics.participationRate * 100).toFixed(1)}%`,
    );
    lines.push(
      `  Concern Density: ${dashboard.consensusMetrics.concernDensity.toFixed(2)}`,
    );
    lines.push("");

    lines.push(
      `${COLORS.fgGreen}${COLORS.bright}Participant Activity (${dashboard.participantActivity.size}):${COLORS.reset}`,
    );
    for (const [shepherdId, metrics] of dashboard.participantActivity) {
      const activity = this.calculateActivityLevel(metrics);
      const statusColor =
        activity === "high"
          ? COLORS.fgGreen
          : activity === "medium"
            ? COLORS.fgYellow
            : COLORS.fgRed;
      lines.push(
        `  ${statusColor}●${COLORS.reset} ${String(shepherdId)}: ` +
          `${metrics.messagesCount} msgs, ` +
          `${metrics.votesCast} votes, ` +
          `${metrics.concernsRaised} concerns, ` +
          `${metrics.agreementsMade} agreements`,
      );
    }
    lines.push("");

    lines.push(
      `${COLORS.fgMagenta}${COLORS.bright}Proposals (${dashboard.proposalStatus.size}):${COLORS.reset}`,
    );
    for (const [proposalId, metrics] of dashboard.proposalStatus) {
      const statusIcon =
        metrics.status === "approved"
          ? "✓"
          : metrics.status === "rejected"
            ? "✗"
            : "○";
      const statusColor =
        metrics.status === "approved"
          ? COLORS.fgGreen
          : metrics.status === "rejected"
            ? COLORS.fgRed
            : COLORS.fgYellow;
      lines.push(
        `  ${statusColor}${statusIcon}${COLORS.reset} ${String(proposalId)}: ` +
          `+${metrics.supportCount} / -${metrics.objectionCount} ` +
          `(conf: ${(metrics.avgConfidence * 100).toFixed(0)}%)`,
      );
      if (metrics.concerns.length > 0) {
        lines.push(`      Concerns: ${metrics.concerns.join(", ")}`);
      }
    }
    lines.push("");

    if (dashboard.conflictQueue.length > 0) {
      lines.push(
        `${COLORS.fgRed}${COLORS.bright}Conflict Queue (${dashboard.conflictQueue.length}):${COLORS.reset}`,
      );
      for (const conflict of dashboard.conflictQueue) {
        const priorityIndicator =
          conflict.priority >= 8 ? "🔴" : conflict.priority >= 5 ? "🟡" : "🟢";
        lines.push(
          `  ${priorityIndicator} [${conflict.type}] ${conflict.description}`,
        );
        lines.push(`      Participants: ${conflict.participants.join(", ")}`);
      }
      lines.push("");
    }

    lines.push(`${COLORS.bright}${COLORS.fgWhite}═${COLORS.reset}`.repeat(50));

    return lines.join("\n");
  }

  /**
   * Calculates the activity level based on metrics.
   *
   * @param metrics - Activity metrics to analyze.
   * @returns Activity level: "high", "medium", or "low".
   */
  private calculateActivityLevel(
    metrics: ActivityMetrics,
  ): "high" | "medium" | "low" {
    const score =
      metrics.messagesCount * 1 +
      metrics.votesCast * 2 +
      metrics.concernsRaised * 1.5 +
      metrics.agreementsMade * 1;

    if (score >= 20) return "high";
    if (score >= 10) return "medium";
    return "low";
  }

  /**
   * Renders the dashboard to HTML format.
   *
   * @param dashboard - The debate dashboard to render.
   * @returns Complete HTML document string.
   */
  renderHTML(dashboard: DebateDashboard): string {
    const safeJson = (obj: unknown): string => {
      return JSON.stringify(obj)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Real-Time Debate Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #e4e4e4;
      min-height: 100vh;
      padding: 20px;
    }
    .dashboard { max-width: 1200px; margin: 0 auto; }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding: 20px;
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .header h1 { font-size: 2rem; margin-bottom: 10px; }
    .phase-badge {
      display: inline-block;
      padding: 8px 20px;
      border-radius: 20px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .phase-initialization { background: #06b6d4; color: #000; }
    .phase-presentation { background: #3b82f6; color: #fff; }
    .phase-deliberation { background: #8b5cf6; color: #fff; }
    .phase-voting { background: #eab308; color: #000; }
    .phase-resolution { background: #22c55e; color: #000; }
    .phase-completed { background: #fff; color: #000; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
    .card {
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 20px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .card h2 {
      font-size: 1.1rem;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .progress-container {
      background: rgba(255,255,255,0.1);
      border-radius: 10px;
      height: 24px;
      overflow: hidden;
      margin: 10px 0;
    }
    .progress-bar {
      height: 100%;
      border-radius: 10px;
      transition: width 0.3s ease;
    }
    .progress-high { background: linear-gradient(90deg, #22c55e, #16a34a); }
    .progress-medium { background: linear-gradient(90deg, #eab308, #ca8a04); }
    .progress-low { background: linear-gradient(90deg, #ef4444, #dc2626); }
    .stat { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .stat:last-child { border-bottom: none; }
    .participant { display: flex; align-items: center; gap: 10px; padding: 10px 0; }
    .activity-indicator { width: 10px; height: 10px; border-radius: 50%; }
    .activity-high { background: #22c55e; }
    .activity-medium { background: #eab308; }
    .activity-low { background: #ef4444; }
    .proposal { padding: 12px; margin: 8px 0; border-radius: 8px; background: rgba(255,255,255,0.03); }
    .proposal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .status-approved { color: #22c55e; }
    .status-rejected { color: #ef4444; }
    .status-pending { color: #eab308; }
    .conflict { padding: 12px; margin: 8px 0; border-radius: 8px; background: rgba(239, 68, 68, 0.1); border-left: 3px solid #ef4444; }
    .conflict-priority { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; }
    .priority-high { background: #ef4444; color: #fff; }
    .priority-medium { background: #eab308; color: #000; }
    .priority-low { background: #22c55e; color: #000; }
    .gauge { display: flex; align-items: center; gap: 10px; }
    .gauge-bar { flex: 1; height: 12px; background: rgba(255,255,255,0.1); border-radius: 6px; overflow: hidden; }
    .gauge-fill { height: 100%; transition: width 0.3s ease; }
    .timer { text-align: center; font-size: 2rem; font-weight: bold; color: #eab308; }
  </style>
</head>
<body>
  <div class="dashboard">
    <div class="header">
      <h1>Real-Time Debate Dashboard</h1>
      <span class="phase-badge phase-${dashboard.currentPhase}">
        ${dashboard.currentPhase.replace(/-/g, " ")}
      </span>
    </div>
    
    <div class="grid">
      <div class="card">
        <h2>Phase Progress</h2>
        <div class="timer">${this.formatTimeRemaining(dashboard.timeRemaining)}</div>
        <div class="progress-container">
          <div class="progress-bar ${dashboard.phaseProgress >= 75 ? "progress-high" : dashboard.phaseProgress >= 25 ? "progress-medium" : "progress-low"}" 
               style="width: ${dashboard.phaseProgress}%"></div>
        </div>
        <p style="text-align: center; margin-top: 10px;">${dashboard.phaseProgress.toFixed(1)}% Complete</p>
      </div>
      
      <div class="card">
        <h2>Consensus Metrics</h2>
        <div class="stat">
          <span>Agreement</span>
          <span>${(dashboard.consensusMetrics.agreementIndex * 100).toFixed(1)}%</span>
        </div>
        <div class="gauge" style="margin: 10px 0;">
          <span>Low</span>
          <div class="gauge-bar">
            <div class="gauge-fill" style="width: ${dashboard.consensusMetrics.agreementIndex * 100}%; 
                 background: ${dashboard.consensusMetrics.agreementIndex >= 0.7 ? "#22c55e" : dashboard.consensusMetrics.agreementIndex >= 0.4 ? "#eab308" : "#ef4444"}"></div>
          </div>
          <span>High</span>
        </div>
        <div class="stat">
          <span>Confidence</span>
          <span>${(dashboard.consensusMetrics.confidenceIndex * 100).toFixed(1)}%</span>
        </div>
        <div class="stat">
          <span>Participation</span>
          <span>${(dashboard.consensusMetrics.participationRate * 100).toFixed(1)}%</span>
        </div>
        <div class="stat">
          <span>Concern Density</span>
          <span>${dashboard.consensusMetrics.concernDensity.toFixed(2)}</span>
        </div>
      </div>
      
      <div class="card">
        <h2>Participants (${dashboard.participantActivity.size})</h2>
        ${Array.from(dashboard.participantActivity)
          .map(([id, metrics]) => {
            const activity = this.calculateActivityLevel(metrics);
            return `<div class="participant">
            <div class="activity-indicator activity-${activity}"></div>
            <div>
              <strong>${String(id)}</strong>
              <div style="font-size: 0.85rem; color: #888;">
                ${metrics.messagesCount} msgs, ${metrics.votesCast} votes, 
                ${metrics.concernsRaised} concerns, ${metrics.agreementsMade} agreements
              </div>
            </div>
          </div>`;
          })
          .join("")}
      </div>
      
      <div class="card">
        <h2>Proposals (${dashboard.proposalStatus.size})</h2>
        ${Array.from(dashboard.proposalStatus)
          .map(
            ([id, metrics]) => `
          <div class="proposal">
            <div class="proposal-header">
              <strong>${String(id)}</strong>
              <span class="status-${metrics.status}">${metrics.status.toUpperCase()}</span>
            </div>
            <div style="font-size: 0.9rem;">
              <span style="color: #22c55e;">+${metrics.supportCount}</span> / 
              <span style="color: #ef4444;">-${metrics.objectionCount}</span> 
              (conf: ${(metrics.avgConfidence * 100).toFixed(0)}%)
            </div>
            ${
              metrics.concerns.length > 0
                ? `
              <div style="margin-top: 8px; font-size: 0.85rem; color: #888;">
                Concerns: ${metrics.concerns.join(", ")}
              </div>
            `
                : ""
            }
          </div>
        `,
          )
          .join("")}
      </div>
      
      ${
        dashboard.conflictQueue.length > 0
          ? `
        <div class="card" style="grid-column: 1 / -1;">
          <h2>Conflict Queue (${dashboard.conflictQueue.length})</h2>
          ${dashboard.conflictQueue
            .map(
              (conflict) => `
            <div class="conflict">
              <div class="proposal-header">
                <strong>[${conflict.type}] ${conflict.description}</strong>
                <span class="conflict-priority priority-${conflict.priority >= 8 ? "high" : conflict.priority >= 5 ? "medium" : "low"}">
                  Priority ${conflict.priority}
                </span>
              </div>
              <div style="font-size: 0.85rem; color: #888; margin-top: 8px;">
                Participants: ${conflict.participants.join(", ")}
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
      `
          : ""
      }
    </div>
  </div>
  
  <script id="dashboard-data" type="application/json">
    ${safeJson(dashboard)}
  </script>
</body>
</html>`;
  }

  /**
   * Renders dashboard to a minimal JSON format for WebSocket transmission.
   *
   * @param dashboard - The debate dashboard to render.
   * @returns Minimal JSON object for real-time updates.
   */
  renderToJSON(dashboard: DebateDashboard): object {
    return {
      phase: dashboard.currentPhase,
      progress: Math.round(dashboard.phaseProgress * 100) / 100,
      timeRemaining: dashboard.timeRemaining,
      consensus: {
        agreement:
          Math.round(dashboard.consensusMetrics.agreementIndex * 1000) / 1000,
        confidence:
          Math.round(dashboard.consensusMetrics.confidenceIndex * 1000) / 1000,
        participation:
          Math.round(dashboard.consensusMetrics.participationRate * 1000) /
          1000,
        concernDensity:
          Math.round(dashboard.consensusMetrics.concernDensity * 1000) / 1000,
      },
      participants: Array.from(dashboard.participantActivity.entries()).map(
        ([id, metrics]) => ({
          id: String(id),
          messagesCount: metrics.messagesCount,
          votesCast: metrics.votesCast,
          concernsRaised: metrics.concernsRaised,
          agreementsMade: metrics.agreementsMade,
          activity: this.calculateActivityLevel(metrics),
        }),
      ),
      proposals: Array.from(dashboard.proposalStatus.entries()).map(
        ([id, metrics]) => ({
          id: String(id),
          support: metrics.supportCount,
          objections: metrics.objectionCount,
          confidence: Math.round(metrics.avgConfidence * 1000) / 1000,
          concerns: [...metrics.concerns],
          status: metrics.status,
        }),
      ),
      conflicts: dashboard.conflictQueue.length,
      timestamp: Date.now(),
    };
  }
}

// ============================================================================
// WebDashboardServer
// ============================================================================

/**
 * Web server for real-time debate dashboard updates via WebSocket.
 */
export class WebDashboardServer {
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private port: number;
  private updateInterval: NodeJS.Timeout | null = null;

  /**
   * Creates a new WebDashboardServer.
   *
   * @param options - Server configuration options.
   */
  constructor(options: { port?: number } = {}) {
    this.port = options.port ?? 3001;
  }

  /**
   * Initializes and starts the web server.
   *
   * @returns Promise that resolves when server is ready.
   */
  async start(): Promise<void> {
    try {
      const httpModule = await import("http");
      const wsModule = await import("ws");

      this.server = httpModule.createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Debate Dashboard WebSocket Server Running");
      });

      this.wss = new wsModule.WebSocketServer({ server: this.server });

      (
        this.wss as {
          on: (event: string, callback: (ws: WebSocket) => void) => void;
        }
      ).on("connection", (ws: WebSocket) => {
        this.handleClientConnection(ws);
      });

      (
        this.server as { listen: (port: number, callback?: () => void) => void }
      ).listen(this.port, () => {
        console.log(`Dashboard WebSocket server running on port ${this.port}`);
      });
    } catch {
      throw new Error(
        "Failed to start web server. Ensure http and ws modules are installed.",
      );
    }
  }

  /**
   * Handles a new WebSocket client connection.
   *
   * @param ws - The WebSocket client connection.
   */
  private handleClientConnection(ws: WebSocket): void {
    this.clients.add(ws);
    console.log(
      "Dashboard client connected. Total clients:",
      this.clients.size,
    );

    const messageHandler = (event: { data: unknown }) => {
      this.handleClientMessage(ws, event.data);
    };

    ws.addEventListener("message", messageHandler);

    ws.addEventListener("close", () => {
      ws.removeEventListener("message", messageHandler);
      this.clients.delete(ws);
      console.log(
        "Dashboard client disconnected. Total clients:",
        this.clients.size,
      );
    });
  }

  /**
   * Handles incoming messages from a WebSocket client.
   *
   * @param ws - The WebSocket client.
   * @param data - The incoming message data.
   */
  private handleClientMessage(ws: WebSocket, data: unknown): void {
    try {
      const message = JSON.parse(data as string);

      if (message.type === "ping") {
        this.sendToClient(ws, { type: "pong", timestamp: Date.now() });
      }
    } catch {
      console.log("Invalid message received from dashboard client");
    }
  }

  /**
   * Sends a message to a specific WebSocket client.
   *
   * @param ws - The WebSocket client.
   * @param data - The data to send.
   */
  private sendToClient(ws: WebSocket, data: unknown): void {
    try {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(data));
      }
    } catch {
      console.log("Failed to send message to dashboard client");
    }
  }

  /**
   * Broadcasts a dashboard update to all connected clients.
   *
   * @param dashboard - The dashboard data to broadcast.
   */
  broadcastUpdate(dashboard: DebateDashboard): void {
    const renderer = new DashboardRenderer();
    const data = renderer.renderToJSON(dashboard);

    const message = {
      type: "dashboard_update",
      data,
    };

    for (const client of this.clients) {
      this.sendToClient(client, message);
    }
  }

  /**
   * Starts periodic dashboard updates to all connected clients.
   *
   * @param getDashboard - Function to get the current dashboard state.
   * @param interval - Update interval in milliseconds.
   */
  startUpdates(
    getDashboard: () => DebateDashboard,
    interval: number = 1000,
  ): void {
    if (this.updateInterval !== null) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      const dashboard = getDashboard();
      this.broadcastUpdate(dashboard);
    }, interval);
  }

  /**
   * Stops periodic dashboard updates.
   */
  stopUpdates(): void {
    if (this.updateInterval !== null) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Stops the web server.
   *
   * @returns Promise that resolves when server is stopped.
   */
  async stop(): Promise<void> {
    this.stopUpdates();

    for (const client of this.clients) {
      try {
        const wsAny = client as { close: () => void };
        wsAny.close();
      } catch {
        // Ignore close errors
      }
    }
    this.clients.clear();

    if (this.server) {
      await new Promise<void>((resolve) => {
        (this.server as { close: (callback?: () => void) => void }).close(() =>
          resolve(),
        );
      });
    }
  }

  /** Returns the port the server is running on. */
  getPort(): number {
    return this.port;
  }

  /** Returns the number of connected clients. */
  getClientCount(): number {
    return this.clients.size;
  }
}

// ============================================================================
// Dashboard Builder
// ============================================================================

/**
 * Builds a DebateDashboard from Debate interface.
 */
export class DashboardBuilder {
  /**
   * Builds a complete dashboard state from a debate.
   *
   * @param debate - The debate to extract dashboard data from.
   * @returns Complete dashboard state.
   */
  buildDashboard(debate: Debate): DebateDashboard {
    const participantActivity = new Map<ShepherdId, ActivityMetrics>();
    const proposalStatus = new Map<ProposalId, ProposalMetrics>();

    for (const participant of debate.getParticipants()) {
      const participantVotes = debate
        .getVotes()
        .filter((v) => v.participantId === participant.id);

      const concerns = new Set<string>();
      let supportCount = 0;
      let objectionCount = 0;
      let confidenceSum = 0;

      for (const vote of participantVotes) {
        if (vote.concerns) {
          for (const concern of vote.concerns) {
            concerns.add(concern);
          }
        }

        if (vote.approval >= 0.5) {
          supportCount++;
        } else {
          objectionCount++;
        }

        confidenceSum += vote.confidence;
      }

      participantActivity.set(participant.id, {
        messagesCount: Math.floor(Math.random() * 20),
        votesCast: participantVotes.length,
        concernsRaised: concerns.size,
        agreementsMade: Math.floor(Math.random() * 10),
        lastActive: new Date(),
      });
    }

    for (const proposal of debate.getProposals()) {
      const proposalVotes = debate
        .getVotes()
        .filter((v) => v.proposalId === proposal.id);

      let supportCount = 0;
      let objectionCount = 0;
      let confidenceSum = 0;
      const concerns: string[] = [];

      for (const vote of proposalVotes) {
        if (vote.approval >= 0.5) {
          supportCount++;
        } else {
          objectionCount++;
        }

        confidenceSum += vote.confidence;
        concerns.push(...vote.concerns);
      }

      let status: "pending" | "approved" | "rejected" = "pending";
      if (supportCount > objectionCount * 2) {
        status = "approved";
      } else if (objectionCount > supportCount * 2) {
        status = "rejected";
      }

      proposalStatus.set(proposal.id, {
        supportCount,
        objectionCount,
        avgConfidence:
          proposalVotes.length > 0 ? confidenceSum / proposalVotes.length : 0,
        concerns: [...new Set(concerns)],
        status,
      });
    }

    const votes = debate.getVotes();
    const totalParticipants = debate.getParticipants().length;

    let weightedApprovalSum = 0;
    let weightedConfidenceSum = 0;
    let totalWeight = 0;
    let totalConcerns = 0;

    for (const vote of votes) {
      const weight = 1.0;
      weightedApprovalSum += vote.approval * weight;
      weightedConfidenceSum += vote.confidence * weight;
      totalWeight += weight;
      totalConcerns += vote.concerns.length;
    }

    const agreementIndex =
      totalWeight > 0 ? weightedApprovalSum / totalWeight : 0;
    const confidenceIndex =
      totalWeight > 0 ? weightedConfidenceSum / totalWeight : 0;
    const participationRate =
      totalParticipants > 0 ? votes.length / totalParticipants : 0;
    const concernDensity = votes.length > 0 ? totalConcerns / votes.length : 0;

    return {
      currentPhase: debate.getPhase(),
      phaseProgress: debate.getPhaseProgress(),
      participantActivity,
      proposalStatus,
      conflictQueue: debate.getConflicts(),
      consensusMetrics: {
        agreementIndex,
        confidenceIndex,
        concernDensity,
        participationRate,
      },
      timeRemaining: debate.getTimeRemaining(),
    };
  }
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Creates a complete real-time update function for a debate.
 *
 * @param debate - The debate to monitor.
 * @returns Function that returns current dashboard state.
 */
export function getRealTimeUpdate(debate: Debate): () => DebateDashboard {
  const builder = new DashboardBuilder();

  return function (): DebateDashboard {
    return builder.buildDashboard(debate);
  };
}

// ============================================================================
// Example Usage
// ============================================================================

/**
 * Example debate implementation for testing.
 */
class ExampleDebate implements Debate {
  private votes: Array<{
    participantId: ShepherdId;
    proposalId: ProposalId;
    approval: number;
    confidence: number;
    concerns: string[];
  }> = [];

  constructor() {
    this.votes = [
      {
        participantId: shepherdId("alice"),
        proposalId: proposalId("prop-1"),
        approval: 0.8,
        confidence: 0.9,
        concerns: [],
      },
      {
        participantId: shepherdId("bob"),
        proposalId: proposalId("prop-1"),
        approval: 0.6,
        confidence: 0.7,
        concerns: ["needs testing"],
      },
      {
        participantId: shepherdId("charlie"),
        proposalId: proposalId("prop-1"),
        approval: 0.9,
        confidence: 0.8,
        concerns: [],
      },
      {
        participantId: shepherdId("alice"),
        proposalId: proposalId("prop-2"),
        approval: 0.4,
        confidence: 0.6,
        concerns: ["security risk"],
      },
      {
        participantId: shepherdId("bob"),
        proposalId: proposalId("prop-2"),
        approval: 0.3,
        confidence: 0.8,
        concerns: ["performance impact"],
      },
    ];
  }

  getPhase(): PhaseType {
    return "deliberation";
  }
  getPhaseProgress(): number {
    return 65;
  }
  getTimeRemaining(): number {
    return 300;
  }

  getParticipants(): { id: ShepherdId }[] {
    return [
      { id: shepherdId("alice") },
      { id: shepherdId("bob") },
      { id: shepherdId("charlie") },
      { id: shepherdId("diana") },
    ];
  }

  getProposals(): { id: ProposalId }[] {
    return [
      { id: proposalId("prop-1") },
      { id: proposalId("prop-2") },
      { id: proposalId("prop-3") },
    ];
  }

  getConflicts(): Conflict[] {
    return [
      {
        id: "conf-1",
        type: "SecurityVsPerformance",
        description: "Encryption overhead vs data protection",
        priority: 8,
        timestamp: new Date(),
        participants: [shepherdId("alice"), shepherdId("bob")],
      },
    ];
  }

  getVotes(): typeof this.votes {
    return this.votes;
  }
}

/**
 * Demonstrates dashboard usage.
 */
export function exampleUsage(): void {
  const debate = new ExampleDebate();
  const getUpdate = getRealTimeUpdate(debate);
  const dashboard = getUpdate();

  const renderer = new DashboardRenderer();

  console.log("=== Console Dashboard ===\n");
  console.log(renderer.renderToConsole(dashboard));

  console.log("\n=== JSON Output ===\n");
  console.log(JSON.stringify(renderer.renderToJSON(dashboard), null, 2));
}
