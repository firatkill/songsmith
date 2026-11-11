import pino, { type DestinationStream } from 'pino';
import { requestContext } from './correlation.js';
const sensitiveFragments = [
  'birth',
  'dob',
  'lyric',
  'description',
  'prompt',
  'email',
  'token',
  'password',
  'passwd',
  'secret',
  'apikey',
  'authorization',
  'cookie',
  'gift',
  'recipient',
  'occasion',
  'memor',
  'instruction',
  'transcript',
];
const sensitiveExactKeys = new Set([
  'text',
  'body',
  'message',
  'details',
  'key',
  'messagebody',
  'supabaseservicerolekey',
  'supabaseanonkey',
]);
function sensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z]/g, '');
  return (
    sensitiveExactKeys.has(normalized) ||
    sensitiveFragments.some((fragment) => normalized.includes(fragment))
  );
}
// Match values even inside a longer message (for example a Bearer header).
const jwt = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;
const email =
  /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;
function redact(value: unknown): unknown {
  if (typeof value === 'string' && (jwt.test(value) || email.test(value)))
    return '[redacted]';
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sensitiveKey(key) ? '[redacted]' : redact(item),
      ]),
    );
  return value;
}
export function createLogger(level = 'info', destination?: DestinationStream) {
  const options: pino.LoggerOptions = {
    level,
    base: null,
    mixin: () => ({
      correlationId: requestContext.getStore()?.correlationId ?? null,
      userId: requestContext.getStore()?.userId ?? null,
      jobId: null,
      route: null,
      latencyMs: null,
      errorCode: null,
    }),
    // Pino formats message arguments outside formatters.log. Sanitize those too.
    hooks: {
      logMethod(args, method) {
        method.apply(this, args.map(redact) as typeof args);
      },
    },
    formatters: {
      level: (label) => ({ level: label }),
      log: (object) => redact(object) as Record<string, unknown>,
    },
  };
  return destination ? pino(options, destination) : pino(options);
}
export type Logger = ReturnType<typeof createLogger>;
