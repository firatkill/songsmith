import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import {
  errorCatalogue,
  type ErrorCode,
  type ErrorResponse,
} from '@songsmith/schemas';
import { formatMessage, resolveLocale } from '@songsmith/i18n';
import type { Logger } from './log.js';
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly details?: ErrorResponse['error']['details'],
  ) {
    super(code);
  }
}
export function errorMiddleware(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req, res, _next) => {
    if (res.headersSent) {
      _next(error);
      return;
    }
    let code: ErrorCode = 'INTERNAL';
    let details: ErrorResponse['error']['details'];
    if (error instanceof AppError) {
      code = error.code;
      details = error.details;
    } else if (error instanceof ZodError) {
      code = 'VALIDATION';
      details = {
        fields: error.issues.map((i) => i.path.map(String).join('.')),
      };
    } else if (
      error &&
      typeof error === 'object' &&
      'type' in error &&
      error.type === 'entity.too.large'
    )
      code = 'PAYLOAD_TOO_LARGE';
    else if (
      error &&
      typeof error === 'object' &&
      'type' in error &&
      [
        'entity.parse.failed',
        'encoding.unsupported',
        'charset.unsupported',
      ].includes(String(error.type))
    )
      code = 'VALIDATION';
    if (code === 'INTERNAL') {
      // Stack frames only: Error.message can contain request content or credentials.
      const stack =
        error instanceof Error
          ? error.stack
              ?.split('\n')
              .filter((line) => /^\s+at /.test(line))
              .join('\n')
          : undefined;
      logger.error({ errorCode: code, stack }, 'Unhandled request error');
    }
    res.locals['errorCode'] = code;
    const entry = errorCatalogue[code];
    res.status(entry.status).json({
      error: {
        code,
        message: formatMessage(
          resolveLocale(req.get('Accept-Language')),
          entry.messageKey,
        ),
        ...(details === undefined ? {} : { details }),
      },
    });
  };
}
