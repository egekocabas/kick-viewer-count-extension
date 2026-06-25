const LOG_PREFIX = '[Kick Viewer Count]';
const ENABLED = import.meta.env.DEV;

export const logger = {
  debug(message: string, details?: unknown): void {
    log('debug', message, details);
  },
  info(message: string, details?: unknown): void {
    log('info', message, details);
  },
  warn(message: string, details?: unknown): void {
    log('warn', message, details);
  },
};

function log(
  level: 'debug' | 'info' | 'warn',
  message: string,
  details?: unknown,
): void {
  if (!ENABLED) {
    return;
  }

  if (details === undefined) {
    console[level](LOG_PREFIX, message);
    return;
  }

  console[level](LOG_PREFIX, message, details);
}
