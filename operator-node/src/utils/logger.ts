type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

function formatTimestamp(): string {
  return new Date().toISOString();
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];
}

export const logger = {
  debug(msg: string, ...args: unknown[]) {
    if (shouldLog("debug")) console.log(`[${formatTimestamp()}] [DEBUG] ${msg}`, ...args);
  },
  info(msg: string, ...args: unknown[]) {
    if (shouldLog("info")) console.log(`[${formatTimestamp()}] [INFO]  ${msg}`, ...args);
  },
  warn(msg: string, ...args: unknown[]) {
    if (shouldLog("warn")) console.warn(`[${formatTimestamp()}] [WARN]  ${msg}`, ...args);
  },
  error(msg: string, ...args: unknown[]) {
    if (shouldLog("error")) console.error(`[${formatTimestamp()}] [ERROR] ${msg}`, ...args);
  },
};
