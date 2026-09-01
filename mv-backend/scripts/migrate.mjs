import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { db, disconnectDB } from '../src/config/db.js';

/**
 * Applies the drizzle migrations to whatever DATABASE_URL points at.
 *
 * There was no way to do this. Migrations were generated and the schema was
 * evidently synced by hand, which held until it did not: the local database
 * was missing `list`, `list_item` and `password_reset` for two milestones,
 * and every test passed the whole time because the suite replays these same
 * files into a fresh throwaway database. Tests proved the migrations were
 * correct; nothing proved they had been run.
 *
 * Deliberately the same replay the test harness does, rather than
 * `drizzle-kit migrate`. drizzle-kit tracks state in its own table, and this
 * database predates that table - pointing it here would try to replay 0000
 * against tables that already exist. This tracks its own state instead, and
 * records the migrations already applied when it first runs against an
 * existing database.
 *
 *   npm run db:migrate            apply anything outstanding
 *   npm run db:migrate -- --status  list without applying
 */

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');

const ensureLedger = () => db.execute(sql`
    CREATE TABLE IF NOT EXISTS applied_migration (
        tag text PRIMARY KEY,
        applied_at timestamp NOT NULL DEFAULT now()
    )
`);

const appliedTags = async () => {
    const res = await db.execute(sql`SELECT tag FROM applied_migration`);
    return new Set((res.rows ?? res).map((r) => r.tag));
};

/**
 * Has this database already been set up by hand?
 *
 * If core tables exist but the ledger is empty, the schema was applied some
 * other way. Replaying from 0000 would fail on the first CREATE TABLE, so
 * everything up to the newest table present is recorded as done instead.
 */
const baseline = async (files) => {
    const res = await db.execute(sql`
        SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    `);
    const tables = new Set((res.rows ?? res).map((r) => r.table_name));
    if (!tables.has('user')) return [];

    // Columns too, not just tables. Several migrations only ADD COLUMN, and
    // judging those by table presence marks them pending forever - which then
    // fails on "column already exists" the first time the runner is used.
    const colRes = await db.execute(sql`
        SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'
    `);
    const columns = new Set((colRes.rows ?? colRes).map((r) => `${r.table_name}.${r.column_name}`));

    // Migrations apply in order, so if migration N is present then everything
    // before it is too. Find the newest one whose artifacts are all there and
    // baseline up to and including it.
    //
    // Checking each file independently does not work, for two reasons this
    // repo actually contains: 0000 creates `movie` and `watchlist_item`, which
    // M1 later renamed, so its artifacts are legitimately gone; and several
    // migrations only add a constraint, leaving nothing to look for at all.
    // Either would be misread as "not applied" and then fail on re-run.
    //
    // This is a ONE-TIME reconciliation for a database built before this
    // script existed. From here the ledger is authoritative and nothing is
    // inferred.
    const isPresent = async (file) => {
        const text = await readFile(path.join(dir, file), 'utf8');
        const creates = [...text.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"([a-z_]+)"/gi)].map((m) => m[1]);
        const adds = [...text.matchAll(/ALTER TABLE "([a-z_]+)" ADD COLUMN (?:IF NOT EXISTS )?"([a-z_]+)"/gi)]
            .map((m) => `${m[1]}.${m[2]}`);

        // Nothing to check means nothing to contradict.
        if (!creates.length && !adds.length) return null;
        return creates.every((t) => tables.has(t)) && adds.every((c) => columns.has(c));
    };

    let newestApplied = -1;
    for (let i = 0; i < files.length; i++) {
        const present = await isPresent(files[i]);
        if (present === true) newestApplied = i;
    }

    return newestApplied >= 0 ? files.slice(0, newestApplied + 1) : [];
};

const run = async () => {
    const statusOnly = process.argv.includes('--status');

    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    await ensureLedger();

    let applied = await appliedTags();

    if (applied.size === 0) {
        const already = await baseline(files);
        if (already.length) {
            for (const tag of already) {
                await db.execute(sql`INSERT INTO applied_migration (tag) VALUES (${tag}) ON CONFLICT DO NOTHING`);
            }
            console.log(`Baselined ${already.length} migration(s) already present in this database.`);
            applied = await appliedTags();
        }
    }

    const pending = files.filter((f) => !applied.has(f));

    if (statusOnly) {
        console.log(`${applied.size} applied, ${pending.length} pending`);
        pending.forEach((f) => console.log(`  pending: ${f}`));
        return;
    }

    if (!pending.length) {
        console.log('Up to date — nothing to apply.');
        return;
    }

    for (const file of pending) {
        const text = await readFile(path.join(dir, file), 'utf8');
        // Same split the test harness uses, so a migration cannot pass there
        // and fail here for a parsing reason.
        for (const statement of text.split('--> statement-breakpoint')) {
            const trimmed = statement.trim();
            if (trimmed) await db.execute(sql.raw(trimmed));
        }
        await db.execute(sql`INSERT INTO applied_migration (tag) VALUES (${file})`);
        console.log(`applied ${file}`);
    }

    console.log(`Done — ${pending.length} migration(s) applied.`);
};

try {
    await run();
} catch (err) {
    console.error(`Migration failed: ${err.message}`);
    process.exitCode = 1;
} finally {
    await disconnectDB();
}
