import pino from 'pino';

// Never log credentials, cookies or tokens. Request bodies are not logged at all.
const REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
];

export function createLogger(config, { stream, level } = {}) {
  return pino(
    {
      level: level ?? (config.NODE_ENV === 'test' ? 'silent' : 'info'),
      redact: { paths: REDACT, censor: '[redacted]' },
    },
    stream,
  );
}
