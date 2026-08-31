import 'dotenv/config';
import { spawn } from 'node:child_process';
import { mkdir, stat, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Dumps the database to backups/ for uploading somewhere off this machine.
 *
 * The price history is the one thing here that cannot be re-fetched: TMDB will
 * hand back film metadata any time, but a book's price on a given day exists
 * only because we polled for it that day (SPEC 7). Losing this disk loses that
 * permanently, so while the database is local the backup is not optional.
 *
 * Custom format (-Fc): compressed, and restorable selectively with pg_restore.
 *   pg_restore --clean --if-exists -d "$DATABASE_URL" backups/mv-2026-08-31.dump
 */

const KEEP = 14; // Local copies. The off-site one is whatever gets uploaded.

// pg_dump is not on PATH on Windows. Override with PG_DUMP if yours differs —
// the server and client versions must match, so this points at the 17 install.
const CANDIDATES = [
    process.env.PG_DUMP,
    'C:/Program Files/PostgreSQL/17/bin/pg_dump.exe',
    'pg_dump',
].filter(Boolean);

const pgDump = CANDIDATES.find((c) => c === 'pg_dump' || existsSync(c));

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('DATABASE_URL is not set in mv-backend/.env');
    process.exit(1);
}

const dir = path.resolve('backups');
await mkdir(dir, { recursive: true });

const stamp = new Date().toISOString().slice(0, 10);
const out = path.join(dir, `mv-${stamp}.dump`);

// The URL is passed as an argument, not through a shell, so the password is
// never expanded into a command line a shell could log.
const child = spawn(pgDump, ['--format=custom', '--no-owner', '--no-acl', '--file', out, url], {
    stdio: ['ignore', 'inherit', 'inherit'],
});

child.on('error', (err) => {
    console.error(`Could not run pg_dump (${pgDump}): ${err.message}`);
    console.error('Set PG_DUMP in .env to the full path of pg_dump.exe.');
    process.exit(1);
});

child.on('exit', async (code) => {
    if (code !== 0) process.exit(code ?? 1);

    const { size } = await stat(out);
    console.log(`Backup written: ${out} (${(size / 1024).toFixed(1)} KB)`);

    // Keep the last KEEP dumps so this never quietly fills the disk.
    const old = (await readdir(dir))
        .filter((f) => f.startsWith('mv-') && f.endsWith('.dump'))
        .sort()
        .slice(0, -KEEP);
    for (const f of old) await unlink(path.join(dir, f));
    if (old.length) console.log(`Pruned ${old.length} older backup(s), keeping ${KEEP}.`);

    console.log('\nUpload this file to your cloud drive. Restore with:');
    console.log(`  pg_restore --clean --if-exists -d "$DATABASE_URL" "${out}"`);
});
