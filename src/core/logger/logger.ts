export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type Logger = {
  debug: (message: string, meta?: unknown) => void;
  info: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, meta?: unknown) => void;
  child: (context: Record<string, unknown>) => Logger;
};

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

type ConsoleLike = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type CreateLoggerOptions = {
  level?: LogLevel;
  context?: Record<string, unknown>;
  /** Injection point for tests. Defaults to globalThis.console. */
  output?: ConsoleLike;
};

/**
 * Tiny structured logger optimised for CloudWatch: emits a single JSON line per
 * record so AWS log insights can query fields directly.
 */
export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const level = options.level ?? 'info';
  const baseContext = options.context ?? {};
  const output = options.output ?? console;

  const minPriority = LEVEL_PRIORITY[level];

  function emit(recordLevel: LogLevel, message: string, meta?: unknown): void {
    if (LEVEL_PRIORITY[recordLevel] < minPriority) return;

    const record = {
      level: recordLevel,
      message,
      timestamp: new Date().toISOString(),
      ...baseContext,
      ...(meta !== undefined ? { meta: serialize(meta) } : {}),
    };

    const line = safeStringify(record);

    switch (recordLevel) {
      case 'debug':
        output.debug(line);
        return;
      case 'info':
        output.info(line);
        return;
      case 'warn':
        output.warn(line);
        return;
      case 'error':
        output.error(line);
    }
  }

  return {
    debug: (m, meta) => emit('debug', m, meta),
    info: (m, meta) => emit('info', m, meta),
    warn: (m, meta) => emit('warn', m, meta),
    error: (m, meta) => emit('error', m, meta),
    child: extraContext =>
      createLogger({
        level,
        context: { ...baseContext, ...extraContext },
        output,
      }),
  };
}

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ unserializable: String(value) });
  }
}
