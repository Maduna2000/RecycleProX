import pino from 'pino'

/**
 * Pino logger — no pino-pretty transport (worker threads don't work inside
 * Next.js webpack bundles). In dev, logs are still readable JSON in the
 * terminal. In production, plain JSON is correct anyway.
 */
const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
})

export default logger
