type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function emit(level: LogLevel, scope: string, message: string, data?: unknown): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...(data !== undefined ? { data } : {}),
  }

  switch (level) {
    case 'debug':
      if (import.meta.env.DEV) console.debug(payload)
      break
    case 'info':
      console.info(payload)
      break
    case 'warn':
      console.warn(payload)
      break
    case 'error':
      console.error(payload)
      break
    default: {
      const _exhaustive: never = level
      return _exhaustive
    }
  }
}

export const log = {
  debug: (scope: string, message: string, data?: unknown) => emit('debug', scope, message, data),
  info: (scope: string, message: string, data?: unknown) => emit('info', scope, message, data),
  warn: (scope: string, message: string, data?: unknown) => emit('warn', scope, message, data),
  error: (scope: string, message: string, data?: unknown) => emit('error', scope, message, data),
}
