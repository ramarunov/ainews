import * as Sentry from '@sentry/node';

/**
 * No-op unless SENTRY_DSN is actually configured — there's no real Sentry
 * account/DSN available in this environment to verify delivery against,
 * so this stays inert by default rather than silently pretending to be
 * wired up. Call once, as early as possible in bootstrap().
 */
export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
    // Strip the two headers most likely to carry credentials before
    // anything leaves the process, on top of Sentry's own default PII
    // scrubbing.
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      return event;
    },
  });

  return true;
}
