import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';

/**
 * Reproduces exactly what Nest's built-in default filter would have sent
 * (same status code and response body shape for both HttpException and
 * unexpected errors) — the only addition is reporting genuine server-side
 * failures to Sentry before responding. 4xx HttpExceptions (validation,
 * permission checks, not-found) are expected application flow, not bugs
 * worth paging someone for, so only >=500 (or a non-HttpException at all,
 * meaning something actually crashed) gets reported.
 */
@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!isHttpException || status >= 500) {
      Sentry.captureException(exception, {
        contexts: {
          request: {
            method: request?.method,
            url: request?.url,
          },
        },
      });
    }

    const body = isHttpException
      ? exception.getResponse()
      : { statusCode: status, message: 'Internal server error' };

    response
      .status(status)
      .json(typeof body === 'string' ? { statusCode: status, message: body } : body);
  }
}
