import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { verifySmtpConnection } from './services/email.js';

async function boot() {
  // Production fails fast on a dead mail path: verify SMTP (connect +
  // auth) before accepting traffic. Development/test boot untouched.
  if (env.NODE_ENV === 'production') {
    try {
      await verifySmtpConnection();
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'SMTP verification failed — refusing to boot. Check SMTP_URL credentials and host.',
      );
      process.exit(1);
    }
  }

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(`Copinex API listening on :${env.PORT} (${env.NODE_ENV})`);
  });

  /**
   * Graceful shutdown: stop accepting new connections and let in-flight
   * requests finish (a withdrawal approval mid-flight must not be cut).
   * The process supervisor restarts us on exit. Hard-exit after 10s if a
   * request hangs — a stuck process is worse than a dropped one.
   */
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      logger.info({ signal }, 'shutting down');
      server.close(() => {
        logger.info('server closed, exiting');
        process.exit(0);
      });
      setTimeout(() => {
        logger.warn('shutdown timed out, forcing exit');
        process.exit(1);
      }, 10_000).unref();
    });
  }
}

boot().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'boot failed');
  process.exit(1);
});