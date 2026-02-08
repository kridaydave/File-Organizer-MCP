/**
 * File Organizer MCP Server v3.1.3
 * Structured Logging Utility
 */

export class Logger {
  private logLevel: 'debug' | 'info' | 'warn' | 'error';

  constructor(level: 'debug' | 'info' | 'warn' | 'error' = 'info') {
    this.logLevel = level;
  }

  private log(level: string, message: string, context?: Record<string, any>) {
    if (!this.shouldLog(level)) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    };

    console.error(JSON.stringify(entry)); // stderr for stdio servers
  }

  debug(message: string, context?: Record<string, any>) {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, any>) {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, any>) {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error | unknown, context?: Record<string, any>) {
    this.log('error', message, {
      ...context,
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
            }
          : error,
    });
  }

  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }
}

export const logger = new Logger(
  (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info'
);
