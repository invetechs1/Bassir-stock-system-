import { db } from './index.js';
import { SCHEMA_SQL } from './schema.js';
import { logger } from '../logger.js';

// The connection (db/index.js) already applies the schema on load; this runner
// makes the step explicit for `npm run migrate` and CI.
export function migrate() {
  db.exec(SCHEMA_SQL);
  logger.info('Database migrated');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
}
