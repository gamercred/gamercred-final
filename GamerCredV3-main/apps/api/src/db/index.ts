import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

let _db: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (_db) return _db;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for this operation (set STUB_MODE=true to bypass)');
  }
  const client = postgres(connectionString, { prepare: false, max: 10 });
  _db = drizzle(client, { schema });
  return _db;
}

// Proxy so `import { db }` works but actual connection is lazy.
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    const real = getDb();
    const v = (real as any)[prop];
    return typeof v === 'function' ? v.bind(real) : v;
  },
});

export { schema };
