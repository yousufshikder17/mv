import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lt, sql } from 'drizzle-orm';
import { db, disconnectDB } from '../config/db.js';
import { priceQuotes } from '../db/schema.js';
import { fetchKindleDeals } from '../adapters/price/kindle.js';
import { fetchBookPrices } from '../adapters/price/googlebooks.js';
import { refreshStaleMovies } from '../controllers/movieController.js';

// SPEC §7: raw quotes keep 90 days in Postgres. Neon's free tier is 0.5 GB and
// this is the fattest table we actually own, so the policy exists from day one
// rather than being retrofitted once the table is already too big to prune
// cheaply.
const RETENTION_DAYS = 90;

/**
 * Inserts a day's quotes, skipping any already recorded.
 *
 * Dedupe is the unique(source, external_id, quote_date) constraint doing the
 * work, not a read-then-write: a re-run — a retried job, a manual invocation,
 * two workflow triggers on the same day — must not double-insert, and checking
 * first would still race with itself.
 */
export const storeQuotes = async (quotes) => {
    if (!quotes.length) return 0;
    const rows = await db
        .insert(priceQuotes)
        .values(quotes)
        .onConflictDoNothing()
        .returning({ id: priceQuotes.id });
    return rows.length;
};

/** Drops raw quotes past the retention window. */
export const pruneOldQuotes = async (now = new Date()) => {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const rows = await db
        .delete(priceQuotes)
        .where(lt(priceQuotes.quoteDate, cutoff.toISOString().slice(0, 10)))
        .returning({ id: priceQuotes.id });
    return rows.length;
};

/**
 * One run of the daily job. Idempotent, so re-running it is always safe.
 *
 * Each step is independent and failures are logged rather than thrown: TMDB
 * being unreachable must not cost us a day of Kindle history, which is the one
 * thing in this system that cannot be backfilled (SPEC §7).
 */
export const runDailyPoll = async () => {
    const summary = { fetched: 0, inserted: 0, pruned: 0, refreshed: 0, skipped: [], errors: [] };

    // An adapter with no configuration is not a failure, it is a source that
    // is not turned on yet. Keeping the two apart matters: the exit code gates
    // whether the run counts as healthy, and a permanently-dormant Kindle
    // adapter must not paint every run red.
    const record = (label, err) => {
        if (/is not set/.test(err.message)) summary.skipped.push(label);
        else summary.errors.push(`${label}: ${err.message}`);
    };

    try {
        const { quotes, errors } = await fetchKindleDeals();
        summary.fetched = quotes.length;
        summary.inserted = await storeQuotes(quotes);
        // A dead feed is worth seeing in the log without failing the run —
        // the other feeds' rows still landed.
        for (const e of errors) summary.errors.push(`kindle feed ${e}`);
    } catch (err) {
        record('kindle', err);
    }

    // Independent of Kindle: whichever source is configured contributes, and a
    // dead one costs only its own rows.
    try {
        const { quotes, errors } = await fetchBookPrices();
        summary.fetched += quotes.length;
        summary.inserted += await storeQuotes(quotes);
        for (const e of errors) summary.errors.push(`googlebooks ${e}`);
    } catch (err) {
        record('googlebooks', err);
    }

    try {
        summary.pruned = await pruneOldQuotes();
    } catch (err) {
        summary.errors.push(`prune: ${err.message}`);
    }

    // Wired here because it was exported and called nowhere: TMDB rows
    // refreshed only on access, so a film nobody opened aged past TMDB's
    // 6-month cache limit (ToS §1.C). Free to fix while a cron exists anyway.
    try {
        summary.refreshed = await refreshStaleMovies();
    } catch (err) {
        summary.errors.push(`tmdb: ${err.message}`);
    }

    return summary;
};

// Run directly (`npm run poll`) rather than imported: this is the entrypoint
// GitHub Actions calls. No node-cron — a scheduler in-process would need a
// server running 24/7, and the workflow already has cron built in.
//
// Path comparison rather than a filename regex: this module is imported by the
// test suite, which must not trigger a live poll.
const isEntrypoint =
    process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
    const summary = await runDailyPoll();
    console.log(JSON.stringify({ at: new Date().toISOString(), ...summary }));
    await disconnectDB();
    // Non-zero so a failed run shows up red in the Actions log instead of
    // silently reporting success for months.
    process.exit(summary.errors.length ? 1 : 0);
}
