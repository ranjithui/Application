/**
 * Production entrypoint: apply pending migrations, then start the API in the
 * same process.
 *
 * This deliberately replaces the older `sh -c "node migrate.js && node
 * server.js"`. Two reasons:
 *
 *  - Hosts that parse the start command themselves (Render's `dockerCommand`
 *    among them) can mangle the `&&`, and the whole string ends up treated as
 *    one command name.
 *  - With `sh -c`, the shell is PID 1 and does not forward SIGTERM to node, so
 *    the graceful shutdown in server.ts never runs and the platform ends up
 *    killing the container. Here node *is* PID 1 and receives the signal.
 *
 * Migrations are idempotent — already-applied files are skipped — so running
 * this on every boot is safe, including on hosts that restart after idling.
 */
import { pool } from '../src/config/db.js';
import { logger } from '../src/utils/logger.js';
import { runMigrations } from './migrate-lib.js';

const client = await pool.connect();
try {
  await runMigrations(client, (msg: string) => logger.info(msg));
} catch (err) {
  logger.error({ err }, 'Migrations failed — refusing to start');
  process.exit(1);
} finally {
  // Back to the pool, not pool.end(): the server reuses it.
  client.release();
}

await import('../src/server.js');
