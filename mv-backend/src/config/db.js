import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import * as schema from '../db/schema.js';
import 'dotenv/config';

// Two drivers, one db object.
//
// Neon's serverless driver speaks their HTTP protocol and cannot reach a
// Postgres listening on a TCP socket, so a local database needs node-postgres
// instead. Which one we use is inferred from the connection string; set
// DB_DRIVER=neon|pg to override.

const url = process.env.DATABASE_URL;

if (!url) {
    console.error('❌ DATABASE_URL is not set — copy .env.example to .env and fill it in.');
    process.exit(1);
}

const driver = process.env.DB_DRIVER ?? (/neon\.tech/i.test(url) ? 'neon' : 'pg');

let pool = null;

const build = () => {
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
        console.log(`✅ DB connected via Drizzle (${driver === 'neon' ? 'Neon HTTP' : 'node-postgres'})`);
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
    if (!pool) return;
    await pool.end();
    console.log('👋 Postgres pool closed');
};
