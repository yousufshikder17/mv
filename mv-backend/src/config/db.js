import { createRequire } from 'node:module';
import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import * as schema from '../db/schema.js';
import 'dotenv/config';

// Three drivers, one db object.
//
// Neon's serverless driver speaks their HTTP protocol and cannot reach a
// Postgres listening on a TCP socket, so a local database needs node-postgres
// instead. Which one we use is inferred from the connection string; set
// DB_DRIVER=neon|pg|pglite to override.
//
// pglite is real Postgres compiled to WASM, running in this process. It exists
// so the test suite can exercise this module rather than a mock: the error
// paths in errorMiddleware key off Postgres SQLSTATE codes (23505 unique,
// 23503 foreign key, 22P02 bad uuid), and only a real Postgres emits those.

const url = process.env.DATABASE_URL;

const driver =
    process.env.DB_DRIVER ?? (url && /neon\.tech/i.test(url) ? 'neon' : 'pg');

// pglite needs no connection string; it has nothing to connect to.
if (driver !== 'pglite' && !url) {
    console.error('❌ DATABASE_URL is not set — copy .env.example to .env and fill it in.');
    process.exit(1);
}

let pool = null;
let pglite = null;

const build = () => {
    if (driver === 'pglite') {
        // Loaded lazily: pglite is a devDependency, so it is absent in
        // production and must never be reached by a static import.
        // No argument means in-memory, discarded when the process exits.
        // A "pglite://./some/dir" URL persists to that directory instead.
        const { PGlite } = createRequire(import.meta.url)('@electric-sql/pglite');
        pglite = new PGlite(url?.replace(/^pglite:\/\//, '') || undefined);
        return drizzlePglite(pglite, { schema });
    }

    if (driver === 'neon') {
        return drizzleNeon(neon(url), { schema });
    }

    pool = new pg.Pool({
        connectionString: url,
        // Local Postgres almost never has TLS configured; hosted almost always
        // does. `true` verifies against the system CA store — do not swap this
        // for { rejectUnauthorized: false }, which encrypts without
        // authenticating and accepts any certificate a MITM presents.
        ssl: /sslmode=require/i.test(url) ? true : false,
    });

    return drizzlePg(pool, { schema });
};

export const db = build();

/** Verifies the connection at startup. Same query on either driver. */
export const connectDB = async () => {
    try {
        await db.execute(sql`SELECT 1`);
        const label = { neon: 'Neon HTTP', pg: 'node-postgres', pglite: 'pglite (in-process)' };
        console.log(`✅ DB connected via Drizzle (${label[driver] ?? driver})`);
    } catch (error) {
        console.error(`❌ Connection error: ${error.message}`);
        process.exit(1);
    }
};

/**
 * Closes the pool on shutdown. No-op under Neon HTTP, which holds no
 * persistent socket — but callers shouldn't have to know which driver is live.
 */
export const disconnectDB = async () => {
    if (pglite) {
        await pglite.close();
        return;
    }
    if (!pool) return;
    await pool.end();
    console.log('👋 Postgres pool closed');
};
