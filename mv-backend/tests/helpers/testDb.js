import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { db } from '../../src/config/db.js';
import { createApp } from '../../src/app.js';

const migrationDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'drizzle',
);

export const app = createApp();
export const api = () => request(app);

/**
 * Replays the real drizzle migrations into the in-memory Postgres.
 *
 * Deliberately the same .sql files production runs, rather than a
 * schema-push from schema.js: a migration that does not apply cleanly is
 * itself a defect, and this is the only place that would notice.
 */
export const createSchema = async () => {
    const files = (await readdir(migrationDir))
        .filter((f) => f.endsWith('.sql'))
        .sort();

    for (const file of files) {
        const text = await readFile(path.join(migrationDir, file), 'utf8');
        for (const statement of text.split('--> statement-breakpoint')) {
            const trimmed = statement.trim();
            if (trimmed) await db.execute(sql.raw(trimmed));
        }
    }
};

/** Empties every table between tests. CASCADE follows the FKs for us. */
export const resetTables = async () => {
    await db.execute(
        sql.raw('TRUNCATE TABLE follow, review_vote, review, comment, deal_vote, notification, push_subscription, price_alert, price_quote, tracking_item, media_item, "user" RESTART IDENTITY CASCADE'),
    );
};

let counter = 0;

/**
 * Registers a user through the real endpoint and returns what a client would
 * hold afterwards. Going through HTTP rather than inserting directly means the
 * password is hashed the way login expects.
 */
export const registerUser = async (overrides = {}) => {
    counter += 1;
    const payload = {
        name: `User ${counter}`,
        email: `user${counter}@example.com`,
        password: 'correct-horse-battery',
        ...overrides,
    };

    const res = await api().post('/auth/register').send(payload);
    if (res.status !== 201) {
        throw new Error(`registerUser failed (${res.status}): ${JSON.stringify(res.body)}`);
    }

    return {
        ...payload,
        id: res.body.user.id,
        token: res.body.token,
        auth: (req) => req.set('Authorization', `Bearer ${res.body.token}`),
    };
};

/** Inserts a catalogue row directly — the catalogue is not what these tests exercise. */
export const createMovie = async (overrides = {}) => {
    // Captured before the await, not read after it. Reading `counter` on the
    // far side of an await gives every concurrent call the same number, and
    // Promise.all(...createMovie()) then collides on (source, type, externalId).
    const n = (counter += 1);
    const { mediaItems } = await import('../../src/db/schema.js');
    // tmdbId is accepted for readability at call sites and mapped to the
    // generic (source, externalId) key the schema now uses.
    const { tmdbId, ...rest } = overrides;
    const [movie] = await db
        .insert(mediaItems)
        .values({
            title: `Movie ${counter}`,
            releaseYear: 2020,
            type: 'film',
            source: 'tmdb',
            externalId: tmdbId === null ? null : String(tmdbId ?? 900000 + n),
            ...rest,
        })
        .returning();
    return movie;
};
